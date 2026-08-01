const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envPath = 'backend/.env';
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    envVars[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const supabaseUrl = envVars.SUPABASE_URL;
const supabaseKey = envVars.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
  const { data, error } = await supabase
    .from('combo_services')
    .select('count', { count: 'exact', head: true });

  if (error) {
    console.log('STATUS: NOT_MIGRATED');
    console.log('Error:', error.message);
  } else {
    console.log('STATUS: MIGRATED');
  }
}

checkTables();
