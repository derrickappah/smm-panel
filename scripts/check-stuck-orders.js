
const fs = require('fs');
const path = require('path');

function readEnv() {
    const envPath = path.join(process.cwd(), '.env');
    let content = '';
    try {
        content = fs.readFileSync(envPath, 'utf8');
        if (content.includes('\u0000')) {
            content = fs.readFileSync(envPath, 'utf16le');
        }
    } catch (e) {
        console.error('Error reading .env:', e);
        return {};
    }

    const env = {};
    content.split(/\r?\n/).forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
            let value = match[2] || '';
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.substring(1, value.length - 1);
            } else if (value.startsWith("'") && value.endsWith("'")) {
                value = value.substring(1, value.length - 1);
            }
            env[match[1]] = value;
        }
    });
    return env;
}

const env = readEnv();
console.log('SUPABASE_URL=' + (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || 'not found'));
console.log('HAS_SERVICE_ROLE_KEY=' + (!!env.SUPABASE_SERVICE_ROLE_KEY));

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRecentStuckOrders() {
    console.log('Checking recent orders that might be stuck...');

    const { data: orders, error } = await supabase
        .from('orders')
        .select('id, status, smmgen_order_id, smmcost_order_id, jbsmmpanel_order_id, worldofsmm_order_id, g1618_order_id, last_status_check, created_at')
        .in('status', ['pending', 'processing', 'in progress'])
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error fetching orders:', error);
        return;
    }

    console.log(`Found ${orders.length} potentially stuck orders:`);
    console.table(orders.map(o => ({
        id: o.id.substring(0, 8),
        status: o.status,
        smmgen: o.smmgen_order_id,
        smmcost: o.smmcost_order_id,
        jb: o.jbsmmpanel_order_id,
        world: o.worldofsmm_order_id,
        g1618: o.g1618_order_id,
        last_check: o.last_status_check
    })));

    // Check history for the most recent one
    if (orders.length > 0) {
        const { data: history, error: historyError } = await supabase
            .from('order_status_history')
            .select('*')
            .eq('order_id', orders[0].id)
            .order('created_at', { ascending: false })
            .limit(5);

        if (historyError) {
            console.error('Error fetching history:', historyError);
        } else {
            console.log(`History for order ${orders[0].id.substring(0, 8)}:`);
            console.table(history.map(h => ({
                status: h.status,
                old: h.old_status,
                src: h.source,
                created: h.created_at
            })));
        }
    }
}

checkRecentStuckOrders();
