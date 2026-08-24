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
  exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24)
};

let serviceRoleKey = jwt.sign(payload, jwtSecret);
let supabase = createClient(supabaseUrl, serviceRoleKey);

async function test(client, desc) {
  console.log(`\n--- Testing with ${desc} ---`);
  const { data: refs, error: refErr } = await client
    .from('referrals')
    .select('*, referrer:referrer_id(name, email), referee:referee_id(name, email)')
    .order('created_at', { ascending: false })
    .range(0, 10);
  console.log("Refs error:", refErr);
  console.log("Refs count:", refs?.length);
  if (refs?.length > 0) console.log("Sample ref:", refs[0]);

  const { data: wallets, error: walletErr } = await client
    .from('referral_wallets')
    .select('*, profiles:user_id(name, email)')
    .order('balance', { ascending: false })
    .range(0, 10);
  console.log("Wallets count:", wallets?.length);
}

async function run() {
  await test(supabase, "Plain String Secret");

  // If failed with Invalid API key, try base64 decoded
  const serviceRoleKey2 = jwt.sign(payload, secret);
  const supabase2 = createClient(supabaseUrl, serviceRoleKey2);
  await test(supabase2, "Base64 Decoded Secret");
}

run();
