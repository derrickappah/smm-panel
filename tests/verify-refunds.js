const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
const envPath = 'backend/.env';
let env = {};
try {
    const content = fs.readFileSync(envPath, 'utf8').replace(/\x00/g, '');
    env = content.split('\n').reduce((acc, line) => {
        const [k, ...v] = line.split('=');
        if (k && v.length) acc[k.trim()] = v.join('=').trim();
        return acc;
    }, {});
} catch (e) {
    console.error('Failed to load .env file:', e.message);
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyRefundSystem() {
    console.log('--- Verifying Automatic Refund System ---');

    // 1. Check if order_refunds table exists
    console.log('1. Checking order_refunds table...');
    const { error: tableError } = await supabase
        .from('order_refunds')
        .select('count', { count: 'exact', head: true });
    
    if (tableError) {
        console.error('❌ Table order_refunds check failed:', tableError.message);
    } else {
        console.log('✅ Table order_refunds exists.');
    }

    // 2. Check if process_automatic_refund RPC exists
    console.log('\n2. Checking process_automatic_refund RPC...');
    // We try to call it with an invalid UUID to see if it responds with a function error or a value error
    // If it says "function doesn't exist", it's missing.
    const { data: rpcData, error: rpcError } = await supabase.rpc('process_automatic_refund', {
        p_order_id: 'test-order-123',
        p_refund_amount: 0,
        p_refund_type: 'full'
    });

    if (rpcError) {
        if (rpcError.message.includes('function') && rpcError.message.includes('does not exist')) {
            console.error('❌ RPC process_automatic_refund NOT found.');
        } else {
            console.log('✅ RPC process_automatic_refund exists (returned expected error for invalid ID).');
            console.log('   Response:', rpcError.message);
        }
    } else {
        console.log('✅ RPC process_automatic_refund exists.');
        console.log('   Response:', rpcData);
    }

    // 3. Logic Check: Verify check-orders-status.js content
    console.log('\n3. Verifying api/check-orders-status.js logic...');
    try {
        const fileContent = fs.readFileSync('api/check-orders-status.js', 'utf8');
        if (fileContent.includes('handleAutomaticRefund')) {
            console.log('✅ handleAutomaticRefund function found in API.');
        } else {
            console.error('❌ handleAutomaticRefund function missing in API.');
        }

        if (fileContent.includes("mappedStatus === 'canceled'")) {
            console.log('✅ logic for canceled orders found.');
        }
        
        if (fileContent.includes("mappedStatus === 'partial'")) {
            console.log('✅ logic for partial orders found.');
        }
    } catch (e) {
        console.error('❌ Failed to read api/check-orders-status.js');
    }

    console.log('\n--- Verification Complete ---');
}

verifyRefundSystem();
