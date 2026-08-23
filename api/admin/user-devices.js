/**
 * Admin API Endpoint to List Devices for a User
 * 
 * Path: /api/admin/user-devices
 */

import { verifyAdmin, getServiceRoleClient } from '../utils/auth.js';
import { setCorsHeaders } from '../utils/corsHeaders.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await verifyAdmin(req);

    const userId = req.method === 'POST' ? req.body.userId : req.query.userId;
    if (!userId) {
      return res.status(400).json({ error: 'Missing required field: userId' });
    }

    const supabase = getServiceRoleClient();

    const { data: devices, error } = await supabase
      .from('user_devices')
      .select('id, user_id, device_id_hash, first_seen_at, last_seen_at, is_banned, banned_at, ban_reason, user_agent, ip_address, created_at')
      .eq('user_id', userId)
      .order('last_seen_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Mask the device_id_hash so full hash is not exposed
    const sanitizedDevices = (devices || []).map((dev) => ({
      id: dev.id,
      user_id: dev.user_id,
      device_preview: dev.device_id_hash ? `${dev.device_id_hash.substring(0, 8)}...${dev.device_id_hash.substring(dev.device_id_hash.length - 6)}` : 'N/A',
      first_seen_at: dev.first_seen_at,
      last_seen_at: dev.last_seen_at,
      is_banned: dev.is_banned,
      banned_at: dev.banned_at,
      ban_reason: dev.ban_reason,
      user_agent: dev.user_agent,
      ip_address: dev.ip_address ? dev.ip_address.split('.').slice(0, 3).join('.') + '.*' : 'N/A',
      created_at: dev.created_at
    }));

    return res.status(200).json({
      success: true,
      devices: sanitizedDevices
    });
  } catch (error) {
    console.error('Error fetching user devices:', error);
    return res.status(500).json({
      error: 'Failed to fetch user devices',
      message: error.message
    });
  }
}
