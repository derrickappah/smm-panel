import fs from 'fs';
import path from 'path';
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

const TODAY_START = '2026-09-18T00:00:00.000Z';

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

async function fetchAll(table, select, filterGteField, gteValue) {
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
        const { data, error } = await supabase
            .from(table)
            .select(select)
            .gte(filterGteField, gteValue)
            .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) {
            console.error(`Error fetching from ${table}:`, error.message);
            break;
        }
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < pageSize) break;
        page++;
    }
    return allData;
}

async function run() {
    console.log('Fetching all active data for today (since ' + TODAY_START + ')...');

    // 1. Profiles with last_seen_at today
    console.log('1. Fetching profiles by last_seen_at...');
    const pLastSeen = await fetchAll('profiles', 'id, name, phone_number, email, last_seen_at, updated_at, created_at', 'last_seen_at', TODAY_START);
    console.log(`   Found ${pLastSeen.length} profiles by last_seen_at`);

    // 2. Profiles with updated_at today
    console.log('2. Fetching profiles by updated_at...');
    const pUpdated = await fetchAll('profiles', 'id, name, phone_number, email, last_seen_at, updated_at, created_at', 'updated_at', TODAY_START);
    console.log(`   Found ${pUpdated.length} profiles by updated_at`);

    // 3. Profiles with created_at today
    console.log('3. Fetching profiles by created_at...');
    const pCreated = await fetchAll('profiles', 'id, name, phone_number, email, last_seen_at, updated_at, created_at', 'created_at', TODAY_START);
    console.log(`   Found ${pCreated.length} profiles by created_at`);

    // Master map of user_id -> profile/activity record
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

    pLastSeen.forEach(p => addOrUpdateUser(p.id, p, 'Profile Active (last_seen_at)'));
    pUpdated.forEach(p => addOrUpdateUser(p.id, p, 'Profile Updated'));
    pCreated.forEach(p => addOrUpdateUser(p.id, p, 'New Account Registered'));

    // 4. Fetch orders created today
    console.log('4. Fetching orders created today...');
    const orders = await fetchAll('orders', 'user_id, created_at', 'created_at', TODAY_START);
    console.log(`   Found ${orders.length} orders today`);
    orders.forEach(o => {
        if (o.user_id) {
            addOrUpdateUser(o.user_id, { created_at: o.created_at }, 'Placed Order');
        }
    });

    // 5. Fetch transactions today
    console.log('5. Fetching transactions today...');
    const txCreated = await fetchAll('transactions', 'user_id, created_at, updated_at', 'created_at', TODAY_START);
    const txUpdated = await fetchAll('transactions', 'user_id, created_at, updated_at', 'updated_at', TODAY_START);
    const allTx = [...txCreated, ...txUpdated];
    console.log(`   Found ${allTx.length} transactions today`);
    allTx.forEach(t => {
        if (t.user_id) {
            addOrUpdateUser(t.user_id, { created_at: t.created_at, updated_at: t.updated_at }, 'Transaction/Deposit');
        }
    });

    // 6. Fetch activity_logs today
    console.log('6. Fetching activity_logs created today...');
    const actLogs = await fetchAll('activity_logs', 'id, user_id, action_type, description, metadata, created_at', 'created_at', TODAY_START);
    console.log(`   Found ${actLogs.length} activity logs today`);

    const unlinkedAttemptIdentifiers = new Map(); // identifier -> { sources, last_activity, raw_metadata }

    actLogs.forEach(a => {
        const actionDesc = a.action_type || 'Activity Log';
        if (a.user_id) {
            addOrUpdateUser(a.user_id, { created_at: a.created_at }, actionDesc);
        }

        // Check metadata for login attempts / identifiers
        const m = a.metadata || {};
        const rawId = (
            m.phone ||
            m.email ||
            m.attempted_identifier ||
            m.target_email ||
            m.identifier ||
            ''
        ).toString().trim();

        if (rawId) {
            const key = rawId.toLowerCase();
            const existing = unlinkedAttemptIdentifiers.get(key) || {
                identifier: rawId,
                sources: new Set(),
                last_activity: a.created_at
            };
            existing.sources.add(actionDesc);
            if (new Date(a.created_at) > new Date(existing.last_activity)) {
                existing.last_activity = a.created_at;
            }
            unlinkedAttemptIdentifiers.set(key, existing);
        }
    });

    // 7. Load ClickHouse auth audit logs actors if available
    try {
        if (fs.existsSync('scripts/clickhouse_actors.json')) {
            const chActors = JSON.parse(fs.readFileSync('scripts/clickhouse_actors.json', 'utf8'));
            console.log(`7. Processing ${chActors.length} ClickHouse auth actors...`);
            chActors.forEach(actor => {
                if (actor.actor_id) {
                    addOrUpdateUser(actor.actor_id, { email: actor.actor_username }, 'Auth Event (Token Refresh / Session)');
                }
            });
        }
    } catch (e) {
        console.warn('ClickHouse actors warning:', e.message);
    }

    console.log(`Currently accumulated ${userMap.size} unique user IDs.`);

    // 8. Enrich user profiles for all collected user IDs that don't have name/phone/email
    const missingProfileIds = [];
    for (const [id, user] of userMap.entries()) {
        if (!user.name || !user.phone_number || !user.email) {
            missingProfileIds.push(id);
        }
    }

    console.log(`Enriching profiles for ${missingProfileIds.length} users with missing details...`);
    const chunkSize = 200;
    for (let i = 0; i < missingProfileIds.length; i += chunkSize) {
        const chunk = missingProfileIds.slice(i, i + chunkSize);
        const { data, error } = await supabase
            .from('profiles')
            .select('id, name, phone_number, email')
            .in('id', chunk);

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

    // 9. Now match unlinked attempt identifiers against profiles
    console.log(`Processing ${unlinkedAttemptIdentifiers.size} login attempt identifiers...`);
    const attemptKeys = Array.from(unlinkedAttemptIdentifiers.keys());

    // Separate into emails and phones
    const attemptEmails = attemptKeys.filter(k => k.includes('@'));
    const attemptPhones = attemptKeys.filter(k => !k.includes('@')).map(k => normalizePhone(k)).filter(Boolean);

    // Query profiles by email
    const emailToProfile = new Map();
    for (let i = 0; i < attemptEmails.length; i += chunkSize) {
        const chunk = attemptEmails.slice(i, i + chunkSize);
        const { data } = await supabase
            .from('profiles')
            .select('id, name, phone_number, email')
            .in('email', chunk);
        if (data) {
            data.forEach(p => {
                if (p.email) emailToProfile.set(p.email.toLowerCase(), p);
            });
        }
    }

    // Query profiles by phone_number
    const phoneToProfile = new Map();
    for (let i = 0; i < attemptPhones.length; i += chunkSize) {
        const chunk = attemptPhones.slice(i, i + chunkSize);
        const { data } = await supabase
            .from('profiles')
            .select('id, name, phone_number, email')
            .in('phone_number', chunk);
        if (data) {
            data.forEach(p => {
                const norm = normalizePhone(p.phone_number);
                if (norm) phoneToProfile.set(norm, p);
            });
        }
    }

    // Match each attempt
    const unlinkedAttemptUsers = [];
    for (const [key, attempt] of unlinkedAttemptIdentifiers.entries()) {
        let matchedProfile = null;
        if (key.includes('@')) {
            matchedProfile = emailToProfile.get(key);
        } else {
            const norm = normalizePhone(key);
            matchedProfile = phoneToProfile.get(norm);
        }

        if (matchedProfile) {
            // Merge into userMap
            const sourcesArr = Array.from(attempt.sources);
            sourcesArr.forEach(src => {
                addOrUpdateUser(matchedProfile.id, {
                    name: matchedProfile.name,
                    phone_number: matchedProfile.phone_number,
                    email: matchedProfile.email,
                    last_seen_at: attempt.last_activity
                }, `Attempted Login (${src})`);
            });
        } else {
            // User attempted login but has no profile record
            const isEmail = key.includes('@');
            const cleanPhone = !isEmail ? normalizePhone(attempt.identifier) : '';
            unlinkedAttemptUsers.push({
                id: 'attempt-' + key,
                name: isEmail ? key.split('@')[0] : '(Attempted Login)',
                phone_number: cleanPhone || '',
                email: isEmail ? key : '',
                sources: Array.from(attempt.sources).map(s => `Attempted Login (${s})`),
                last_activity: attempt.last_activity,
                is_unregistered_attempt: true
            });
        }
    }

    console.log(`Matched attempts to existing profiles. Unregistered attempt accounts: ${unlinkedAttemptUsers.length}`);

    // Build final combined user list
    const finalUsers = [];

    for (const u of userMap.values()) {
        // If name is still missing, fallback to email prefix
        let name = (u.name || '').trim();
        if (!name && u.email) {
            name = u.email.split('@')[0];
        }

        finalUsers.push({
            id: u.id,
            name: name || 'Unknown',
            phone_number: u.phone_number || '',
            email: u.email || '',
            activity_sources: Array.from(u.sources).join('; '),
            last_activity: u.last_activity || TODAY_START,
            is_unregistered_attempt: false
        });
    }

    unlinkedAttemptUsers.forEach(u => {
        finalUsers.push({
            id: u.id,
            name: u.name,
            phone_number: u.phone_number,
            email: u.email,
            activity_sources: u.sources.join('; '),
            last_activity: u.last_activity,
            is_unregistered_attempt: true
        });
    });

    // Deduplicate by normalized phone_number (when available) or email
    const dedupedMap = new Map();
    for (const user of finalUsers) {
        const normPhone = normalizePhone(user.phone_number);
        const emailKey = (user.email || '').toLowerCase().trim();
        const primaryKey = normPhone || emailKey || user.id;

        if (dedupedMap.has(primaryKey)) {
            const existing = dedupedMap.get(primaryKey);
            if (!existing.phone_number && user.phone_number) existing.phone_number = user.phone_number;
            if (!existing.name && user.name) existing.name = user.name;
            if (!existing.email && user.email) existing.email = user.email;
            existing.activity_sources += '; ' + user.activity_sources;
            if (new Date(user.last_activity) > new Date(existing.last_activity)) {
                existing.last_activity = user.last_activity;
            }
        } else {
            dedupedMap.set(primaryKey, { ...user });
        }
    }

    const uniqueUsers = Array.from(dedupedMap.values()).sort((a, b) => {
        return new Date(b.last_activity) - new Date(a.last_activity);
    });

    console.log(`\n================ SUMMARY ================`);
    console.log(`Total Unique Active Users Today: ${uniqueUsers.length}`);
    const withPhone = uniqueUsers.filter(u => u.phone_number && u.phone_number.trim() !== '');
    console.log(`Users with Phone Number: ${withPhone.length}`);
    console.log(`Users without Phone Number: ${uniqueUsers.length - withPhone.length}`);

    // Export to CSV
    function escapeCsv(val) {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
    }

    const csvHeader = ['Name', 'Phone Number', 'Email', 'Last Activity (UTC)', 'Activity Types / Actions', 'Account Status'];
    const csvRows = uniqueUsers.map(u => [
        escapeCsv(u.name),
        escapeCsv(u.phone_number),
        escapeCsv(u.email),
        escapeCsv(u.last_activity),
        escapeCsv(u.activity_sources),
        escapeCsv(u.is_unregistered_attempt ? 'Attempted Login (Unregistered)' : 'Registered User')
    ].join(','));

    const csvContent = [csvHeader.join(','), ...csvRows].join('\n');
    fs.writeFileSync('active_users_today_2026-09-18.csv', csvContent, 'utf8');
    fs.writeFileSync('active_users_today_2026-09-18.json', JSON.stringify(uniqueUsers, null, 2), 'utf8');

    console.log('Saved CSV to active_users_today_2026-09-18.csv');
    console.log('Saved JSON to active_users_today_2026-09-18.json');

    // Also write a preview of the first 25 users with phone numbers
    console.log('\n--- SAMPLE OF FIRST 10 ACTIVE USERS WITH PHONE NUMBERS ---');
    console.table(withPhone.slice(0, 10).map(u => ({
        Name: u.name,
        'Phone Number': u.phone_number,
        Email: u.email,
        'Last Active': u.last_activity
    })));
}

run().catch(console.error);
