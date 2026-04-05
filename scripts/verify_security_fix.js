// Verification script for balance update vulnerability fix
// This script simulates a PostgREST update attempt on sensitive columns

const { createClient } = require('@supabase/supabase-js');

// Mock credentials (these won't actually work without a real Supabase URL/Key, 
// but the logic shows how we would verify)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'your-anon-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function verifyFix() {
  console.log('Testing Balance Manipulation Vulnerability...');
  
  // 1. Attempt to update balance directly (Simulated as an authenticated user)
  // In a real test, you'd need a valid JWT for an 'authenticated' role
  const { data: balanceData, error: balanceError } = await supabase
    .from('profiles')
    .update({ balance: 999999 })
    .match({ email: 'testuser@example.com' });

  if (balanceError) {
    console.log('✅ Balance modification attempt correctly blocked:', balanceError.message);
  } else {
    console.error('❌ VULNERABILITY STILL EXISTS: Balance was modified directly!');
  }

  console.log('\nTesting Admin Privilege Escalation Vulnerability...');
  
  // 2. Attempt to elevate role to admin
  const { data: roleData, error: roleError } = await supabase
    .from('profiles')
    .update({ role: 'admin' })
    .match({ email: 'testuser@example.com' });

  if (roleError) {
    console.log('✅ Role escalation attempt correctly blocked:', roleError.message);
  } else {
    console.error('❌ VULNERABILITY STILL EXISTS: Role was escalated to admin!');
  }

  console.log('\nTesting Transaction Fraud Vulnerability...');
  
  // 3. Attempt to insert an approved transaction
  const { data: txData, error: txError } = await supabase
    .from('transactions')
    .insert({
      user_id: 'some-uuid',
      amount: 1000,
      type: 'deposit',
      status: 'approved'
    });

  if (txError) {
    console.log('✅ Transaction fraud attempt correctly blocked:', txError.message);
  } else {
    console.error('❌ VULNERABILITY STILL EXISTS: Approved transaction was created directly!');
  }
}

console.log('Note: This script requires a running Supabase instance and valid user session to execute fully.');
console.log('The database migration HARDEN_DATABASE_SECURITY.sql must be applied first.');

// Exporting for manual run if needed
module.exports = { verifyFix };
