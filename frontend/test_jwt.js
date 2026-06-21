const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabaseUrl = 'https://spihsvdchouynfbsotwq.supabase.co';
const jwtSecretBase64 = '4kXETj0h9xjbPsFNxLDskivDueSxOgSWrA7MQ4AcJglV+wwzPlii66ecPqMoUaT9JU98DfwbaKCpes+rEzJGDw==';
// Sometimes secrets are base64 encoded, sometimes they are utf8. Let's try both if needed.
const secret = Buffer.from(jwtSecretBase64, 'base64'); // base64 decode it? Wait, maybe just jwtSecretBase64.

const payload = {
  role: 'service_role',
  iss: 'supabase',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24)
};

// Try with plain string first, if invalid try base64
let serviceRoleKey = jwt.sign(payload, jwtSecretBase64);
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
