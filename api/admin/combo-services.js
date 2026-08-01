import { verifyAuth, getServiceRoleClient } from '../utils/auth.js';

export default async function handler(req, res) {
  // CORS Headers
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://boostupgh.com',
    'https://www.boostupgh.com',
    'http://localhost:3000'
  ];
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://boostupgh.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let user;
  try {
    const authResult = await verifyAuth(req);
    user = authResult.user;
  } catch (authError) {
    return res.status(401).json({ error: 'Authentication required', message: authError.message });
  }

  const supabase = getServiceRoleClient();

  // Check if user is admin
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'superadmin')) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // ----------------------------------------------------
  // GET: List all combo services with child items
  // ----------------------------------------------------
  if (req.method === 'GET') {
    try {
      const { data: combos, error: comboErr } = await supabase
        .from('combo_services')
        .select(`
          *,
          items:combo_service_items(*)
        `)
        .order('created_at', { ascending: false });

      if (comboErr) throw comboErr;

      return res.status(200).json({ success: true, combos: combos || [] });
    } catch (err) {
      console.error('[ComboServices GET] Error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ----------------------------------------------------
  // POST: Create a new Combo Service
  // ----------------------------------------------------
  if (req.method === 'POST') {
    try {
      const { name, description, selling_price, category, min_order, max_order, status, child_services } = req.body;

      if (!name || name.trim() === '') {
        return res.status(400).json({ error: 'Combo Service Name is required' });
      }
      const priceNum = Number(selling_price);
      if (isNaN(priceNum) || priceNum < 0) {
        return res.status(400).json({ error: 'Valid selling_price is required' });
      }
      if (!Array.isArray(child_services) || child_services.length === 0) {
        return res.status(400).json({ error: 'At least one child service is required' });
      }

      // Calculate total provider cost and profit
      let totalProviderCost = 0;
      const formattedItems = child_services.map((item, idx) => {
        const cost = Number(item.estimated_cost || 0);
        totalProviderCost += cost;
        return {
          provider: item.provider || 'smmgen',
          provider_service_id: String(item.provider_service_id || ''),
          service_type: item.service_type || 'Likes',
          fixed_quantity: Number(item.fixed_quantity || 1000),
          estimated_cost: cost,
          delay_seconds: Number(item.delay_seconds || 0),
          enabled: item.enabled !== false,
          display_order: idx
        };
      });

      const profit = Math.round((priceNum - totalProviderCost + Number.EPSILON) * 100) / 100;
      totalProviderCost = Math.round((totalProviderCost + Number.EPSILON) * 100) / 100;

      // 1. Insert into combo_services
      const { data: newCombo, error: insertErr } = await supabase
        .from('combo_services')
        .insert({
          name: name.trim(),
          description: description ? description.trim() : '',
          selling_price: priceNum,
          category: category ? category.trim() : 'Combo Packages',
          min_order: Number(min_order || 1),
          max_order: Number(max_order || 100000),
          status: status === 'inactive' ? 'inactive' : 'active',
          total_provider_cost: totalProviderCost,
          profit: profit
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      // 2. Insert child items
      const itemsToInsert = formattedItems.map(item => ({
        ...item,
        combo_service_id: newCombo.id
      }));

      const { data: createdItems, error: itemsErr } = await supabase
        .from('combo_service_items')
        .insert(itemsToInsert)
        .select();

      if (itemsErr) throw itemsErr;

      // 3. Upsert linked entry in main services table so customer can purchase via store UI
      const { data: serviceRecord, error: serviceErr } = await supabase
        .from('services')
        .insert({
          name: newCombo.name,
          platform: 'combo',
          category: newCombo.category,
          rate: newCombo.selling_price,
          min_quantity: newCombo.min_order,
          max_quantity: newCombo.max_order,
          description: newCombo.description,
          enabled: newCombo.status === 'active',
          is_combo: true,
          combo_service_id: newCombo.id
        })
        .select()
        .single();

      if (serviceErr) {
        console.warn('[ComboServices POST] Failed to mirror to services table:', serviceErr);
      } else if (serviceRecord) {
        // Link service_id back to combo_services
        await supabase
          .from('combo_services')
          .update({ service_id: serviceRecord.id })
          .eq('id', newCombo.id);
      }

      return res.status(201).json({
        success: true,
        combo: {
          ...newCombo,
          items: createdItems
        }
      });
    } catch (err) {
      console.error('[ComboServices POST] Error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ----------------------------------------------------
  // PUT: Update an existing Combo Service
  // ----------------------------------------------------
  if (req.method === 'PUT') {
    try {
      const { id, name, description, selling_price, category, min_order, max_order, status, child_services } = req.body;

      if (!id) return res.status(400).json({ error: 'Combo Service ID is required' });
      if (!name || name.trim() === '') return res.status(400).json({ error: 'Combo Service Name is required' });
      const priceNum = Number(selling_price);
      if (isNaN(priceNum) || priceNum < 0) return res.status(400).json({ error: 'Valid selling_price is required' });
      if (!Array.isArray(child_services) || child_services.length === 0) {
        return res.status(400).json({ error: 'At least one child service is required' });
      }

      let totalProviderCost = 0;
      const formattedItems = child_services.map((item, idx) => {
        const cost = Number(item.estimated_cost || 0);
        totalProviderCost += cost;
        return {
          combo_service_id: id,
          provider: item.provider || 'smmgen',
          provider_service_id: String(item.provider_service_id || ''),
          service_type: item.service_type || 'Likes',
          fixed_quantity: Number(item.fixed_quantity || 1000),
          estimated_cost: cost,
          delay_seconds: Number(item.delay_seconds || 0),
          enabled: item.enabled !== false,
          display_order: idx
        };
      });

      const profit = Math.round((priceNum - totalProviderCost + Number.EPSILON) * 100) / 100;
      totalProviderCost = Math.round((totalProviderCost + Number.EPSILON) * 100) / 100;

      // Update combo_services definition
      const { data: updatedCombo, error: updateErr } = await supabase
        .from('combo_services')
        .update({
          name: name.trim(),
          description: description ? description.trim() : '',
          selling_price: priceNum,
          category: category ? category.trim() : 'Combo Packages',
          min_order: Number(min_order || 1),
          max_order: Number(max_order || 100000),
          status: status === 'inactive' ? 'inactive' : 'active',
          total_provider_cost: totalProviderCost,
          profit: profit,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (updateErr) throw updateErr;

      // Replace items for this combo service
      await supabase.from('combo_service_items').delete().eq('combo_service_id', id);
      const { data: newItems, error: itemsErr } = await supabase
        .from('combo_service_items')
        .insert(formattedItems)
        .select();

      if (itemsErr) throw itemsErr;

      // Update corresponding entry in services table if it exists
      if (updatedCombo.service_id) {
        await supabase
          .from('services')
          .update({
            name: updatedCombo.name,
            category: updatedCombo.category,
            rate: updatedCombo.selling_price,
            min_quantity: updatedCombo.min_order,
            max_quantity: updatedCombo.max_order,
            description: updatedCombo.description,
            enabled: updatedCombo.status === 'active'
          })
          .eq('id', updatedCombo.service_id);
      }

      return res.status(200).json({
        success: true,
        combo: {
          ...updatedCombo,
          items: newItems
        }
      });
    } catch (err) {
      console.error('[ComboServices PUT] Error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ----------------------------------------------------
  // DELETE: Delete a Combo Service
  // ----------------------------------------------------
  if (req.method === 'DELETE') {
    try {
      const { id } = req.body || req.query;
      if (!id) return res.status(400).json({ error: 'Combo Service ID required' });

      // Get service_id before deletion
      const { data: combo } = await supabase.from('combo_services').select('service_id').eq('id', id).single();

      if (combo && combo.service_id) {
        await supabase.from('services').delete().eq('id', combo.service_id);
      }

      const { error: delErr } = await supabase.from('combo_services').delete().eq('id', id);
      if (delErr) throw delErr;

      return res.status(200).json({ success: true, message: 'Combo service deleted' });
    } catch (err) {
      console.error('[ComboServices DELETE] Error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
