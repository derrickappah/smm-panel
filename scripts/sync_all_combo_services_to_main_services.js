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

async function inspectAndSync() {
  console.log('--- Inspecting services table ---');
  const { data: sample, error: sampleErr } = await supabase.from('services').select('*').limit(1);
  if (sampleErr) {
    console.error('Error fetching sample service:', sampleErr.message);
    return;
  }
  if (sample && sample[0]) {
    console.log('Sample services table columns:', Object.keys(sample[0]));
  }

  // 1. Fetch all combo services
  const { data: combos, error: fetchErr } = await supabase
    .from('combo_services')
    .select('*');

  if (fetchErr) {
    console.error('Error fetching combo_services:', fetchErr.message);
    return;
  }

  console.log(`Found ${combos?.length || 0} combo service(s) in combo_services table.`);

  for (const combo of combos || []) {
    console.log(`Syncing Combo: ${combo.name} (ID: ${combo.id})`);
    
    // Check if already mirrored in services table
    const { data: existingSvc } = await supabase
      .from('services')
      .select('id')
      .eq('combo_service_id', combo.id)
      .single();

    const insertPayload = {
      name: combo.name,
      platform: 'tiktok',
      rate: combo.selling_price,
      min_quantity: combo.min_order,
      max_quantity: combo.max_order,
      description: combo.description,
      enabled: combo.status === 'active',
      seller_only: false,
      is_combo: true,
      combo_service_id: combo.id
    };

    if (existingSvc) {
      console.log(`  Updating existing main service ID: ${existingSvc.id}...`);
      const { error: updErr } = await supabase
        .from('services')
        .update(insertPayload)
        .eq('id', existingSvc.id);

      if (updErr) console.error('  Update error:', updErr.message);
      else console.log('  Updated successfully!');
    } else {
      console.log(`  Inserting new main service entry...`);
      const { data: newSvc, error: insErr } = await supabase
        .from('services')
        .insert(insertPayload)
        .select()
        .single();

      if (insErr) {
        console.error('  Insert error:', insErr.message);
      } else if (newSvc) {
        console.log(`  SUCCESS! Created main service entry ID: ${newSvc.id}!`);
        await supabase
          .from('combo_services')
          .update({ service_id: newSvc.id })
          .eq('id', combo.id);
      }
    }
  }
}

inspectAndSync();
