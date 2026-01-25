import { verifyAdmin, getServiceRoleClient } from '../utils/auth.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { isAdmin, user: adminUser } = await verifyAdmin(req);
        if (!isAdmin) return res.status(403).json({ error: 'Unauthorized' });

        const supabase = getServiceRoleClient();
        const { userId, reason } = req.body;

        if (!userId || !reason) {
            return res.status(400).json({ error: 'User ID and reason are required' });
        }

        // Support for Bulk Ignore
        const userIds = Array.isArray(userId) ? userId : [userId];

        // Prepare batch upsert
        const upsertData = userIds.map(uid => ({
            user_id: uid,
            reason: reason,
            created_by: adminUser.id
        }));

        const { error: insertError } = await supabase
            .from('ledger_balance_exceptions')
            .upsert(upsertData);

        if (insertError) throw insertError;

        // Log the action (Summary log for bulk)
        await supabase.rpc('log_system_event', {
            p_type: 'anomaly_ignored_bulk',
            p_severity: 'info',
            p_source: 'admin-dashboard',
            p_description: `Admin ignored balance anomalies for ${userIds.length} users`,
            p_metadata: { reason, count: userIds.length, user_ids: userIds, admin_id: adminUser.id }
        });

        return res.status(200).json({ success: true, message: `Ignored ${userIds.length} anomalies` });

    } catch (error) {
        console.error('Ignore Anomaly API Error:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}
