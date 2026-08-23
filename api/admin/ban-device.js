/**
 * Admin API Endpoint to Ban a Specific Device
 * 
 * Path: /api/admin/ban-device
 */

import { verifyAdmin } from '../utils/auth.js';
import { setCorsHeaders } from '../utils/corsHeaders.js';
import { banDeviceInDatabase } from '../utils/deviceAuth.js';
import { logAdminAction } from '../utils/activityLogger.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user: adminUser } = await verifyAdmin(req);
    const { deviceId, reason = 'Restricted by administrator', userId = null } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'Missing required field: deviceId' });
    }

    const banResult = await banDeviceInDatabase({
      deviceId,
      reason,
      adminId: adminUser.id,
      userId
    });

    await logAdminAction({
      user_id: adminUser.id,
      action_type: 'admin_banned_device',
      entity_type: 'device',
      entity_id: deviceId,
      description: `Restricted device ${deviceId.substring(0, 8)}... for reason: ${reason}`,
      metadata: {
        device_id: deviceId,
        associated_user_id: userId,
        reason
      },
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Device successfully restricted.',
      updatedCount: banResult.updatedCount
    });
  } catch (error) {
    console.error('Error banning device:', error);
    return res.status(500).json({
      error: 'Failed to restrict device',
      message: error.message
    });
  }
}
