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

async function fixVisibility() {
  console.log('--- Fixing services table seller_only and platform visibility ---');
  
  // 1. Update services where seller_only IS NULL or is_combo = true
  const { data, error } = await supabase
    .from('services')
    .update({ seller_only: false })
    .or('seller_only.is.null,is_combo.eq.true');

  if (error) {
    console.error('Error updating services seller_only:', error.message);
  } else {
    console.log('✅ Successfully updated services seller_only to false for visibility!');
  }
}

fixVisibility();
