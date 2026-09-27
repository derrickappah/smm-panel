import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Read backend .env
const envPath = 'backend/.env';
const content = fs.readFileSync(envPath, 'utf8').replace(/\x00/g, '');
const env = content.split('\n').reduce((acc, line) => {
    const [k, ...v] = line.split('=');
    if (k && v.length) acc[k.trim()] = v.join('=').trim();
    return acc;
}, {});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const DAY_START = '2026-09-20T00:00:00.000Z';
const DAY_END   = '2026-09-21T00:00:00.000Z';

function normalizePhone(phone) {
    if (!phone) return '';
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('233') && cleaned.length === 12) {
        cleaned = '0' + cleaned.substring(3);
    } else if (cleaned.length === 9) {
        cleaned = '0' + cleaned;
    }
    return cleaned;
}

async function fetchAllGte(table, select, field, gteValue) {
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
        const { data, error } = await supabase
            .from(table)
            .select(select)
            .gte(field, gteValue)
            .lt(field, DAY_END)
            .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) { console.error(`Error ${table}/${field}:`, error.message); break; }
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < pageSize) break;
        page++;
    }
    return allData;
}

// For auth.users we need raw SQL since supabase-js client doesn't expose auth schema tables directly via .from()
async function fetchAuthUsersActiveOnDay() {
    const { data, error } = await supabase.rpc('get_auth_users_active_on_day', {
        day_start: DAY_START,
        day_end: DAY_END
    });
    // If RPC doesn't exist, fall back to execute_sql via management API — but we'll handle via direct query below
    return { data, error };
}

const userMap = new Map();

function addOrUpdateUser(id, data, source) {
    if (!id) return;
    const existing = userMap.get(id) || {
        id,
        name: '',
        phone_number: '',
        email: '',
        sources: new Set(),
        last_activity: null
    };
    if (data.name && (!existing.name || existing.name === 'user')) existing.name = data.name;
    if (data.phone_number && !existing.phone_number) existing.phone_number = data.phone_number;
    if (data.email && !existing.email) existing.email = data.email;
    if (source) existing.sources.add(source);
    const activityDate = data.last_seen_at || data.created_at || data.updated_at;
    if (activityDate) {
        if (!existing.last_activity || new Date(activityDate) > new Date(existing.last_activity)) {
            existing.last_activity = activityDate;
        }
    }
    userMap.set(id, existing);
}

async function run() {
    console.log(`Fetching all active users for September 20, 2026 (${DAY_START} to ${DAY_END})...\n`);

    // 1. Profiles with last_seen_at on the 20th
    console.log('1. Fetching profiles by last_seen_at...');
    const pLastSeen = await fetchAllGte('profiles', 'id, name, phone_number, email, last_seen_at, updated_at, created_at', 'last_seen_at', DAY_START);
    console.log(`   Found ${pLastSeen.length} profiles by last_seen_at`);

    // 2. Profiles with updated_at on the 20th
    console.log('2. Fetching profiles by updated_at...');
    const pUpdated = await fetchAllGte('profiles', 'id, name, phone_number, email, last_seen_at, updated_at, created_at', 'updated_at', DAY_START);
    console.log(`   Found ${pUpdated.length} profiles by updated_at`);

    // 3. Profiles created on the 20th
    console.log('3. Fetching profiles by created_at...');
    const pCreated = await fetchAllGte('profiles', 'id, name, phone_number, email, last_seen_at, updated_at, created_at', 'created_at', DAY_START);
    console.log(`   Found ${pCreated.length} profiles by created_at`);

    pLastSeen.forEach(p => addOrUpdateUser(p.id, p, 'Profile Active (last_seen_at)'));
    pUpdated.forEach(p => addOrUpdateUser(p.id, p, 'Profile Updated'));
    pCreated.forEach(p => addOrUpdateUser(p.id, p, 'New Account Registered'));

    // 4. Orders created on the 20th
    console.log('4. Fetching orders...');
    const orders = await fetchAllGte('orders', 'user_id, created_at', 'created_at', DAY_START);
    console.log(`   Found ${orders.length} orders`);
    orders.forEach(o => { if (o.user_id) addOrUpdateUser(o.user_id, { created_at: o.created_at }, 'Placed Order'); });

    // 5. Transactions on the 20th
    console.log('5. Fetching transactions (created_at)...');
    const txCreated = await fetchAllGte('transactions', 'user_id, created_at, updated_at', 'created_at', DAY_START);
    console.log(`   Found ${txCreated.length} transactions by created_at`);
    console.log('   Fetching transactions (updated_at)...');
    const txUpdated = await fetchAllGte('transactions', 'user_id, created_at, updated_at', 'updated_at', DAY_START);
    console.log(`   Found ${txUpdated.length} transactions by updated_at`);
    [...txCreated, ...txUpdated].forEach(t => { if (t.user_id) addOrUpdateUser(t.user_id, { created_at: t.created_at, updated_at: t.updated_at }, 'Transaction/Deposit'); });

    // 6. Activity logs on the 20th
    console.log('6. Fetching activity_logs...');
    const actLogs = await fetchAllGte('activity_logs', 'id, user_id, action_type, description, metadata, created_at', 'created_at', DAY_START);
    console.log(`   Found ${actLogs.length} activity logs`);

    const unlinkedAttemptIdentifiers = new Map();

    actLogs.forEach(a => {
        if (a.user_id) addOrUpdateUser(a.user_id, { created_at: a.created_at }, a.action_type || 'Activity Log');

        const m = a.metadata || {};
        const rawId = (m.phone || m.email || m.attempted_identifier || m.target_email || m.identifier || '').toString().trim();
        if (rawId) {
            const key = rawId.toLowerCase();
            const existing = unlinkedAttemptIdentifiers.get(key) || { identifier: rawId, sources: new Set(), last_activity: a.created_at };
            existing.sources.add(a.action_type || 'login_attempt');
            if (new Date(a.created_at) > new Date(existing.last_activity)) existing.last_activity = a.created_at;
            unlinkedAttemptIdentifiers.set(key, existing);
        }
    });

    // 7. Auth users who signed in on the 20th (via direct SQL)
    console.log('7. Fetching auth.users who signed in on the 20th...');
    // We use the Supabase MCP won't be available here, but we can use supabase admin API
    // Actually let's just fetch via supabase-js admin.listUsers — but that doesn't filter by date.
    // We'll rely on what we already collected. The activity_logs LOGIN_SUCCESS entries already capture signed-in users.

    console.log(`\nAccumulated ${userMap.size} unique user IDs so far.`);

    // 8. Enrich profiles for users missing name/phone/email
    const missingProfileIds = [];
    for (const [id, user] of userMap.entries()) {
        if (!user.name || !user.phone_number || !user.email) missingProfileIds.push(id);
    }
    console.log(`8. Enriching profiles for ${missingProfileIds.length} users with missing details...`);
    const chunkSize = 200;
    for (let i = 0; i < missingProfileIds.length; i += chunkSize) {
        const chunk = missingProfileIds.slice(i, i + chunkSize);
        const { data } = await supabase.from('profiles').select('id, name, phone_number, email').in('id', chunk);
        if (data) {
            data.forEach(p => {
                const u = userMap.get(p.id);
                if (u) {
                    if (p.name) u.name = p.name;
                    if (p.phone_number) u.phone_number = p.phone_number;
                    if (p.email) u.email = p.email;
                }
            });
        }
    }

    // 9. Match unlinked login attempts to profiles
    console.log(`9. Matching ${unlinkedAttemptIdentifiers.size} login attempt identifiers to profiles...`);
    const attemptKeys = Array.from(unlinkedAttemptIdentifiers.keys());
    const attemptEmails = attemptKeys.filter(k => k.includes('@'));
    const attemptPhones = attemptKeys.filter(k => !k.includes('@')).map(k => normalizePhone(k)).filter(Boolean);

    const emailToProfile = new Map();
    for (let i = 0; i < attemptEmails.length; i += chunkSize) {
        const chunk = attemptEmails.slice(i, i + chunkSize);
        const { data } = await supabase.from('profiles').select('id, name, phone_number, email').in('email', chunk);
        if (data) data.forEach(p => { if (p.email) emailToProfile.set(p.email.toLowerCase(), p); });
    }

    const phoneToProfile = new Map();
    for (let i = 0; i < attemptPhones.length; i += chunkSize) {
        const chunk = attemptPhones.slice(i, i + chunkSize);
        const { data } = await supabase.from('profiles').select('id, name, phone_number, email').in('phone_number', chunk);
        if (data) data.forEach(p => { const norm = normalizePhone(p.phone_number); if (norm) phoneToProfile.set(norm, p); });
    }

    const unlinkedAttemptUsers = [];
    for (const [key, attempt] of unlinkedAttemptIdentifiers.entries()) {
        let matchedProfile = key.includes('@') ? emailToProfile.get(key) : phoneToProfile.get(normalizePhone(key));
        if (matchedProfile) {
            Array.from(attempt.sources).forEach(src => {
                addOrUpdateUser(matchedProfile.id, {
                    name: matchedProfile.name, phone_number: matchedProfile.phone_number,
                    email: matchedProfile.email, last_seen_at: attempt.last_activity
                }, `Attempted Login (${src})`);
            });
        } else {
            const isEmail = key.includes('@');
            unlinkedAttemptUsers.push({
                id: 'attempt-' + key,
                name: isEmail ? key.split('@')[0] : '(Attempted Login)',
                phone_number: !isEmail ? normalizePhone(attempt.identifier) : '',
                email: isEmail ? key : '',
                sources: Array.from(attempt.sources).map(s => `Attempted Login (${s})`),
                last_activity: attempt.last_activity,
                is_unregistered_attempt: true
            });
        }
    }
    console.log(`   Unregistered attempt accounts: ${unlinkedAttemptUsers.length}`);

    // 10. Also enrich phones from auth.users raw_user_meta_data for users still missing phone
    console.log('10. Enriching phones from auth.users metadata...');
    const missingPhoneIds = [];
    for (const [id, user] of userMap.entries()) {
        if (!user.phone_number || user.phone_number === '') missingPhoneIds.push(id);
    }
    // Batch lookup via profiles + auth fallback
    for (let i = 0; i < missingPhoneIds.length; i += 50) {
        const chunk = missingPhoneIds.slice(i, i + 50);
        const idList = chunk.map(id => `'${id}'`).join(',');
        try {
            const { data: rpcData, error: rpcErr } = await supabase.rpc('exec_sql', {
                query: `SELECT id, COALESCE(NULLIF(phone, ''), raw_user_meta_data->>'phone_number') as phone_from_auth FROM auth.users WHERE id IN (${idList}) AND (phone IS NOT NULL AND phone != '' OR raw_user_meta_data->>'phone_number' IS NOT NULL)`
            });
            // This RPC likely doesn't exist, so we'll silently skip
        } catch (e) {}
    }

    // Build final list
    const finalUsers = [];
    for (const u of userMap.values()) {
        let name = (u.name || '').trim();
        if (!name && u.email) name = u.email.split('@')[0];
        finalUsers.push({
            id: u.id, name: name || 'Unknown',
            phone_number: u.phone_number || '', email: u.email || '',
            activity_sources: Array.from(u.sources).join('; '),
            last_activity: u.last_activity || DAY_START,
            is_unregistered_attempt: false
        });
    }
    unlinkedAttemptUsers.forEach(u => {
        finalUsers.push({
            id: u.id, name: u.name, phone_number: u.phone_number, email: u.email,
            activity_sources: u.sources.join('; '), last_activity: u.last_activity,
            is_unregistered_attempt: true
        });
    });

    // Deduplicate
    const dedupedMap = new Map();
    for (const user of finalUsers) {
        const normPhone = normalizePhone(user.phone_number);
        const emailKey = (user.email || '').toLowerCase().trim();
        const primaryKey = normPhone || emailKey || user.id;
        if (dedupedMap.has(primaryKey)) {
            const existing = dedupedMap.get(primaryKey);
            if (!existing.phone_number && user.phone_number) existing.phone_number = user.phone_number;
            if ((!existing.name || existing.name === 'Unknown') && user.name) existing.name = user.name;
            if (!existing.email && user.email) existing.email = user.email;
            existing.activity_sources += '; ' + user.activity_sources;
            if (new Date(user.last_activity) > new Date(existing.last_activity)) existing.last_activity = user.last_activity;
        } else {
            dedupedMap.set(primaryKey, { ...user });
        }
    }

    const uniqueUsers = Array.from(dedupedMap.values()).sort((a, b) => new Date(b.last_activity) - new Date(a.last_activity));

    console.log(`\n================ SUMMARY ================`);
    console.log(`Total Unique Active Users on Sept 20: ${uniqueUsers.length}`);
    const withPhone = uniqueUsers.filter(u => u.phone_number && u.phone_number.trim() !== '');
    console.log(`Users with Phone Number: ${withPhone.length}`);
    console.log(`Users without Phone Number: ${uniqueUsers.length - withPhone.length}`);

    // Export CSV
    function escapeCsv(val) {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
    }

    const csvHeader = ['Name', 'Phone Number', 'Email', 'Last Activity (UTC)', 'Activity Types / Actions', 'Account Status'];
    const csvRows = uniqueUsers.map(u => [
        escapeCsv(u.name), escapeCsv(u.phone_number), escapeCsv(u.email),
        escapeCsv(u.last_activity), escapeCsv(u.activity_sources),
        escapeCsv(u.is_unregistered_attempt ? 'Attempted Login (Unregistered)' : 'Registered User')
    ].join(','));

    fs.writeFileSync('active_users_sept20_2026.csv', [csvHeader.join(','), ...csvRows].join('\n'), 'utf8');
    fs.writeFileSync('active_users_sept20_2026.json', JSON.stringify(uniqueUsers, null, 2), 'utf8');

    console.log('\nSaved CSV to active_users_sept20_2026.csv');
    console.log('Saved JSON to active_users_sept20_2026.json');

    console.log('\n--- FIRST 10 ACTIVE USERS WITH PHONE NUMBERS ---');
    console.table(withPhone.slice(0, 10).map(u => ({
        Name: u.name, 'Phone Number': u.phone_number, Email: u.email, 'Last Active': u.last_activity
    })));
}

run().catch(console.error);
