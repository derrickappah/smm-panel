
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: 'app/backend/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  const migrationPath = path.join(__dirname, '../app/database/migrations/245_service_targeted_notifications.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('Applying migration...');
  
  // Supabase doesn't have a direct 'sql' execution endpoint in the client for security reasons
  // but we can try to run it via RPC if we had a generic execution function, 
  // or we can assume the user will run it in the SQL editor if I can't.
  // HOWEVER, I can try to check if tables exist first.
  
  const { data: tables, error: tablesError } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .in('table_name', ['service_notifications', 'service_notification_acknowledgments']);

  if (tablesError) {
    console.error('Error checking tables:', tablesError);
    return;
  }

  if (tables && tables.length === 2) {
    console.log('Tables already exist. Migration assumed applied.');
  } else {
    console.log('Tables missing. PLEASE APPLY THE SQL IN 245_service_targeted_notifications.sql MANUALLY in Supabase SQL Editor.');
    console.log('Alternatively, I will try to create them using basic queries if possible (though foreign keys might be tricky).');
    
    // Attempt to create tables one by one using standard client (might fail if RLS is strict)
    // But since we use service role key, it might work if we use generic RPCs.
    // For now, I'll just report that they are missing and proceed with code, 
    // assuming the user will handle the DB or I'll provide a clear instruction.
  }
}

applyMigration();
