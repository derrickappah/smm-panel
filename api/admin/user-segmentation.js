import { verifyAdmin, getServiceRoleClient } from '../utils/auth.js';

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        // 1. Verify Admin access
        const { isAdmin } = await verifyAdmin(req);
        if (!isAdmin) return res.status(403).json({ error: 'Unauthorized' });

        const { action } = req.body;
        const supabase = getServiceRoleClient();

        if (action === 'stats') {
            // Get user segmentation dashboard counts
            const { data, error } = await supabase.rpc('get_admin_user_segmentation_stats');
            if (error) throw error;
            return res.status(200).json({ success: true, stats: data });

        } else if (action === 'list') {
            // Get paginated, sorted, filtered users in a specific segment
            const { 
                segment = 'all', 
                search = '', 
                limit = 50, 
                offset = 0, 
                sortField = 'created_at', 
                sortOrder = 'desc' 
            } = req.body;

            const { data, error } = await supabase.rpc('get_users_by_segment', {
                p_segment: segment,
                p_search: search,
                p_limit: parseInt(limit, 10),
                p_offset: parseInt(offset, 10),
                p_sort_field: sortField,
                p_sort_order: sortOrder
            });

            if (error) throw error;

            // Extract total count from the first item if available
            const total = data.length > 0 ? parseInt(data[0].total_count, 10) : 0;

            return res.status(200).json({ 
                success: true, 
                users: data,
                total
            });

        } else {
            return res.status(400).json({ error: 'Invalid action parameter' });
        }

    } catch (error) {
        console.error('[SEGMENTATION API ERROR]:', error);
        return res.status(error.status || 500).json({
            error: error.message || 'Internal server error'
        });
    }
}
