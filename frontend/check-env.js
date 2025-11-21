// Quick script to check .env file configuration
// Run with: node check-env.js

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');

console.log('Checking .env file configuration...\n');

if (!fs.existsSync(envPath)) {
  console.log('❌ .env file does not exist!');
  console.log('\nCreate a .env file in the frontend directory with:');
  console.log('REACT_APP_SUPABASE_URL=https://your-project-id.supabase.co');
  console.log('REACT_APP_SUPABASE_ANON_KEY=your-anon-key-here');
  console.log('REACT_APP_PAYSTACK_PUBLIC_KEY=pk_test_your-paystack-key');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const lines = envContent.split('\n');

let hasSupabaseUrl = false;
let hasSupabaseKey = false;
let hasPaystackKey = false;
let hasSmmgenUrl = false;
let hasSmmgenKey = false;

let supabaseUrl = '';
let supabaseKey = '';
let paystackKey = '';
let smmgenUrl = '';
let smmgenKey = '';

lines.forEach((line, index) => {
  const trimmed = line.trim();
  if (trimmed.startsWith('REACT_APP_SUPABASE_URL=')) {
    hasSupabaseUrl = true;
    supabaseUrl = trimmed.split('=')[1]?.trim() || '';
  }
  if (trimmed.startsWith('REACT_APP_SUPABASE_ANON_KEY=')) {
    hasSupabaseKey = true;
    supabaseKey = trimmed.split('=')[1]?.trim() || '';
  }
  if (trimmed.startsWith('REACT_APP_PAYSTACK_PUBLIC_KEY=')) {
    hasPaystackKey = true;
    paystackKey = trimmed.split('=')[1]?.trim() || '';
  }
  if (trimmed.startsWith('REACT_APP_SMMGEN_API_URL=')) {
    hasSmmgenUrl = true;
    smmgenUrl = trimmed.split('=')[1]?.trim() || '';
  }
  if (trimmed.startsWith('REACT_APP_SMMGEN_API_KEY=')) {
    hasSmmgenKey = true;
    smmgenKey = trimmed.split('=')[1]?.trim() || '';
  }
});

console.log('Environment Variables Check:\n');

// Check Supabase URL
if (hasSupabaseUrl) {
  if (supabaseUrl && !supabaseUrl.includes('your-project-id') && supabaseUrl.startsWith('https://') && supabaseUrl.includes('.supabase.co')) {
    console.log('✅ REACT_APP_SUPABASE_URL: Configured');
    console.log(`   Value: ${supabaseUrl.substring(0, 30)}...`);
  } else {
    console.log('⚠️  REACT_APP_SUPABASE_URL: Invalid or placeholder value');
    console.log(`   Current: ${supabaseUrl || '(empty)'}`);
  }
} else {
  console.log('❌ REACT_APP_SUPABASE_URL: Missing');
}

// Check Supabase Key
if (hasSupabaseKey) {
  if (supabaseKey && !supabaseKey.includes('your-anon-key') && supabaseKey.length > 50) {
    console.log('✅ REACT_APP_SUPABASE_ANON_KEY: Configured');
    console.log(`   Value: ${supabaseKey.substring(0, 20)}...`);
  } else {
    console.log('⚠️  REACT_APP_SUPABASE_ANON_KEY: Invalid or placeholder value');
    console.log(`   Current: ${supabaseKey ? supabaseKey.substring(0, 20) + '...' : '(empty)'}`);
  }
} else {
  console.log('❌ REACT_APP_SUPABASE_ANON_KEY: Missing');
}

// Check Paystack Key
if (hasPaystackKey) {
  if (paystackKey && !paystackKey.includes('xxxxxxxx') && !paystackKey.includes('your-paystack') && (paystackKey.startsWith('pk_test_') || paystackKey.startsWith('pk_live_'))) {
    console.log('✅ REACT_APP_PAYSTACK_PUBLIC_KEY: Configured');
    console.log(`   Value: ${paystackKey.substring(0, 20)}...`);
    console.log(`   Type: ${paystackKey.startsWith('pk_test_') ? 'Test Mode' : 'Live Mode'}`);
  } else {
    console.log('❌ REACT_APP_PAYSTACK_PUBLIC_KEY: Invalid or placeholder value');
    console.log(`   Current: ${paystackKey ? paystackKey.substring(0, 30) + '...' : '(empty)'}`);
    console.log('   Expected format: pk_test_... or pk_live_...');
  }
} else {
  console.log('❌ REACT_APP_PAYSTACK_PUBLIC_KEY: Missing');
}

// Check SMMGen URL
if (hasSmmgenUrl) {
  if (smmgenUrl && !smmgenUrl.includes('your-smmgen') && smmgenUrl.startsWith('http')) {
    console.log('✅ REACT_APP_SMMGEN_API_URL: Configured');
    console.log(`   Value: ${smmgenUrl}`);
  } else {
    console.log('⚠️  REACT_APP_SMMGEN_API_URL: Invalid or placeholder value');
    console.log(`   Current: ${smmgenUrl || '(empty)'}`);
  }
} else {
  console.log('⚠️  REACT_APP_SMMGEN_API_URL: Missing (optional, defaults to https://smmgen.com/api/v2)');
}

// Check SMMGen Key
if (hasSmmgenKey) {
  if (smmgenKey && !smmgenKey.includes('your-smmgen') && smmgenKey.length > 10) {
    console.log('✅ REACT_APP_SMMGEN_API_KEY: Configured');
    console.log(`   Value: ${smmgenKey.substring(0, 20)}...`);
  } else {
    console.log('⚠️  REACT_APP_SMMGEN_API_KEY: Invalid or placeholder value');
    console.log(`   Current: ${smmgenKey ? smmgenKey.substring(0, 20) + '...' : '(empty)'}`);
    console.log('   Get your API key from your SMMGen dashboard');
  }
} else {
  console.log('⚠️  REACT_APP_SMMGEN_API_KEY: Missing (required for SMMGen integration)');
}

console.log('\n---\n');
console.log('If any values are missing or invalid:');
console.log('1. Open frontend/.env file');
console.log('2. Update the values with your actual keys');
console.log('3. Restart your dev server (npm start)');
console.log('\nGet your keys from:');
console.log('- Supabase: https://supabase.com/dashboard → Project Settings → API');
console.log('- Paystack: https://dashboard.paystack.com/#/settings/developer');
console.log('- SMMGen: Your SMMGen dashboard → API Settings');

