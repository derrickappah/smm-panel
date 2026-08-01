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

async function detailedCheck() {
  const tables = ['combo_services', 'combo_service_items', 'combo_parent_orders', 'combo_child_orders', 'combo_logs'];
  console.log('--- Checking All Combo Tables ---');
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (error) {
      console.log(`❌ Table '${t}': MISSING (${error.message})`);
    } else {
      console.log(`✅ Table '${t}': PRESENT`);
    }
  }

  console.log('--- Checking services table combo columns ---');
  const { data: svc, error: svcErr } = await supabase.from('services').select('is_combo, combo_service_id').limit(1);
  if (svcErr) {
    console.log(`❌ Services combo columns check failed:`, svcErr.message);
  } else {
    console.log(`✅ Services table combo columns present!`);
  }
}

detailedCheck();
