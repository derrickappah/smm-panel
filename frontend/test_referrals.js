const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY);

async function test() {
  console.log("Fetching referrals...");
  const { data: refs, error: refErr } = await supabase
    .from('referrals')
    .select('*, referrer:referrer_id(name, email), referee:referee_id(name, email)')
    .order('created_at', { ascending: false });
  console.log("Refs error:", refErr);
  console.log("Refs count:", refs?.length);
  if (refErr) console.log(refErr);

  console.log("\nFetching wallets...");
  const { data: wallets, error: walletErr } = await supabase
    .from('referral_wallets')
    .select('*, profiles:user_id(name, email)')
    .order('balance', { ascending: false });
  console.log("Wallets error:", walletErr);
  console.log("Wallets count:", wallets?.length);
  if (walletErr) console.log(walletErr);

  console.log("\nFetching transactions...");
  const { data: txs, error: txErr } = await supabase
    .from('referral_transactions')
    .select('*, profiles:user_id(name, email)')
    .order('created_at', { ascending: false });
  console.log("Txs error:", txErr);
  console.log("Txs count:", txs?.length);
  if (txErr) console.log(txErr);
}

test();
