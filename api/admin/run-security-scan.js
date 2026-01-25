import { verifyAdmin } from '../utils/auth.js';
import { runGhostOrderDetection } from './detect-ghost-orders.js';
import { runSuspiciousActivityDetection } from './detect-suspicious-activity.js';

/**
 * Security Deep Scan Endpoint
 * Triggers Ghost Order Detection + Suspicious Activity Analysis
 */
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { isAdmin } = await verifyAdmin(req);
        if (!isAdmin) return res.status(403).json({ error: 'Unauthorized' });

        // Run both scans in parallel
        const [ghostResult, abuseResult] = await Promise.all([
            runGhostOrderDetection(),
            runSuspiciousActivityDetection()
        ]);

        return res.status(200).json({
            success: true,
            timestamp: new Date().toISOString(),
            ghost_orders: ghostResult.ghost_orders,
            spam_clusters: abuseResult.spam,
            volume_spikes: abuseResult.spikes
        });

    } catch (error) {
        console.error('Security Scan Error:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}
