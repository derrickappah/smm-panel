const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('backend/.env', 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    envVars[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const supabase = createClient(envVars.SUPABASE_URL, envVars.SUPABASE_ANON_KEY);

async function testUserQuery() {
  console.log('--- Testing Query as a Standard User (userRole !== admin) ---');
  
  // Standard user query used by Dashboard and Services page
  const { data: services, error } = await supabase
    .from('services')
    .select('id, name, platform, enabled, is_combo, seller_only')
    .eq('enabled', true)
    .eq('seller_only', false);

  if (error) {
    console.error('Error fetching user services:', error.message);
    return;
  }

  const comboServices = (services || []).filter(s => s.is_combo);
  console.log(`Total visible services for regular users: ${services?.length}`);
  console.log(`Visible Combo services for regular users: ${comboServices.length}`);
  if (comboServices.length > 0) {
    console.log('Sample visible combo service:', comboServices[0]);
  }
}

testUserQuery();
