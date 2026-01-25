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

        // Insert into exceptions table
        const { error: insertError } = await supabase
            .from('ledger_balance_exceptions')
            .upsert({
                user_id: userId,
                reason: reason,
                created_by: adminUser.id
            });

        if (insertError) throw insertError;

        // Log the action
        await supabase.rpc('log_system_event', {
            p_type: 'anomaly_ignored',
            p_severity: 'info',
            p_source: 'admin-dashboard',
            p_description: `Admin ignored balance anomaly for user ${userId}`,
            p_metadata: { reason, admin_id: adminUser.id },
            p_entity_type: 'user',
            p_entity_id: userId
        });

        return res.status(200).json({ success: true, message: 'Anomaly ignored successfully' });

    } catch (error) {
        console.error('Ignore Anomaly API Error:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}
