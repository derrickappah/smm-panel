const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envPath = 'backend/.env';
const content = fs.readFileSync(envPath, 'utf8').replace(/\x00/g, '');
const env = content.split('\n').reduce((acc, line) => {
    const [k, ...v] = line.split('=');
    if (k && v.length) acc[k.trim()] = v.join('=').trim();
    return acc;
}, {});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const supabase = createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const reference = 'd4f4eb8a9ac248548d2dc0d44c56692';
    console.log(`Checking transaction for reference: ${reference}`);

    const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('client_reference', reference)
        .single();

    if (error) {
        console.error('Error fetching transaction:', error);

        // Let's also check if it exists with 'reference' key if available, or just latest hubtel tx
        const { data: latest } = await supabase
            .from('transactions')
            .select('*')
            .eq('deposit_method', 'hubtel')
            .order('created_at', { ascending: false })
            .limit(5);

        console.log('Latest Hubtel transactions:');
        console.log(JSON.stringify(latest, null, 2));
    } else {
        console.log('Transaction found:');
        console.log(JSON.stringify(data, null, 2));
    }
}

run();
