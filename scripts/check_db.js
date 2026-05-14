
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'app/backend/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  console.log('Checking services table...');
  const { data: services, error: servicesError } = await supabase
    .from('services')
    .select('id, name, smmgen_service_id')
    .limit(5);
  
  if (servicesError) {
    console.error('Error fetching services:', servicesError);
  } else {
    console.log('Sample services:', services);
  }

  console.log('Checking notifications table...');
  const { data: tables, error: tablesError } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public');

  if (tablesError) {
    console.error('Error fetching tables:', tablesError);
  } else {
    const tableNames = tables.map(t => t.table_name);
    console.log('Existing tables:', tableNames);
    
    if (tableNames.includes('service_notifications')) {
      console.log('service_notifications table EXISTS');
    } else {
      console.log('service_notifications table MISSING');
    }
  }
}

checkSchema();
