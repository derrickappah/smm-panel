/**
 * Admin API Endpoint to Unban a Specific Device
 * 
 * Path: /api/admin/unban-device
 */

import { verifyAdmin } from '../utils/auth.js';
import { setCorsHeaders } from '../utils/corsHeaders.js';
import { unbanDeviceInDatabase } from '../utils/deviceAuth.js';
import { logAdminAction } from '../utils/activityLogger.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user: adminUser } = await verifyAdmin(req);
    const { deviceId, userId = null } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: 'Missing required field: deviceId' });
    }

    const unbanResult = await unbanDeviceInDatabase({
      deviceId,
      adminId: adminUser.id,
      userId
    });

    await logAdminAction({
      user_id: adminUser.id,
      action_type: 'admin_unbanned_device',
      entity_type: 'device',
      entity_id: deviceId,
      description: `Unbanned device ${deviceId.substring(0, 8)}...`,
      metadata: {
        device_id: deviceId,
        associated_user_id: userId
      },
      req
    });

    return res.status(200).json({
      success: true,
      message: 'Device restriction removed successfully.',
      updatedCount: unbanResult.updatedCount
    });
  } catch (error) {
    console.error('Error unbanning device:', error);
    return res.status(500).json({
      error: 'Failed to unban device',
      message: error.message
    });
  }
}
