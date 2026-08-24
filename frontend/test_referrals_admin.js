const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || 'https://spihsvdchouynfbsotwq.supabase.co';
const jwtSecret = process.env.SUPABASE_JWT_SECRET;

if (!jwtSecret) {
  console.error("Error: SUPABASE_JWT_SECRET environment variable is not set.");
  process.exit(1);
}

const payload = {
  role: 'service_role',
  iss: 'supabase',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (60 * 60)
};

const serviceRoleKey = jwt.sign(payload, jwtSecret);

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function test() {
  console.log("Fetching referrals...");
  const { data: refs, error: refErr } = await supabase
    .from('referrals')
    .select('*, referrer:referrer_id(name, email), referee:referee_id(name, email)')
    .order('created_at', { ascending: false });
  console.log("Refs error:", refErr);
  console.log("Refs count:", refs?.length);

  console.log("\nFetching wallets...");
  const { data: wallets, error: walletErr } = await supabase
    .from('referral_wallets')
    .select('*, profiles:user_id(name, email)')
    .order('balance', { ascending: false });
  console.log("Wallets error:", walletErr);
  console.log("Wallets count:", wallets?.length);

  console.log("\nFetching transactions...");
  const { data: txs, error: txErr } = await supabase
    .from('referral_transactions')
    .select('*, profiles:user_id(name, email)')
    .order('created_at', { ascending: false });
  console.log("Txs error:", txErr);
  console.log("Txs count:", txs?.length);
}

test();
