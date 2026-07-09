import { verifyAdmin } from '../utils/auth.js';
import zlib from 'zlib';

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        // 1. Verify Admin access
        const { supabase, isAdmin } = await verifyAdmin(req);
        if (!isAdmin) return res.status(403).json({ error: 'Unauthorized' });

        const { segment = 'all', search = '' } = req.body;

        // Fetch ALL users in this segment (limit 200,000 for full export)
        const { data, error } = await supabase.rpc('get_users_by_segment', {
            p_segment: segment,
            p_search: search,
            p_limit: 200000,
            p_offset: 0,
            p_sort_field: 'created_at',
            p_sort_order: 'desc'
        });

        if (error) throw error;

        // Generate CSV content
        const headers = ['Name', 'Email', 'Phone', 'Role', 'Balance (₵)', 'Spend (₵)', 'Deposits', 'Orders', 'Joined Date', 'Last Active'];
        const csvRows = [headers.join(',')];

        for (const u of data) {
            const row = [
                u.name || 'N/A',
                u.email || 'N/A',
                u.phone_number || 'N/A',
                u.role || 'user',
                u.balance !== null && u.balance !== undefined ? parseFloat(u.balance).toFixed(2) : '0.00',
                u.total_spend !== null && u.total_spend !== undefined ? parseFloat(u.total_spend).toFixed(2) : '0.00',
                u.approved_deposits_count || 0,
                u.total_orders_count || 0,
                u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A',
                u.last_active ? new Date(u.last_active).toLocaleString() : 'Never'
            ];
            // Escape double quotes and wrap in quotes to prevent CSV parsing injection or syntax bugs
            const escapedRow = row.map(cell => `"${String(cell).replace(/"/g, '""')}"`);
            csvRows.push(escapedRow.join(','));
        }

        const csvContent = csvRows.join('\n');

        // Compress CSV using native Gzip (bypasses Vercel response payload limits)
        const gzipped = zlib.gzipSync(Buffer.from(csvContent, 'utf-8'));

        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=users_${segment}_export.csv`);
        
        return res.status(200).send(gzipped);

    } catch (error) {
        console.error('[EXPORT API ERROR]:', error);
        return res.status(error.status || 500).json({
            error: error.message || 'Internal server error'
        });
    }
}
