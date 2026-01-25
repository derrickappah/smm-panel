import { getServiceRoleClient } from '../utils/auth.js';

/**
 * Traffic Analysis & Abuse Detection
 * Scans recent local orders for spam patterns and volume spikes.
 */
export async function runSuspiciousActivityDetection() {
    console.log('[SECURITY] Starting Abuse Pattern Detection...');
    const supabase = getServiceRoleClient();

    // 1. DUPLICATE SPAM DETECTION
    // Same Link + Same Service > 3 times in last 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    // We use a raw query logic here via JS aggregation (since Supabase select grouping is limited via client)
    const { data: recentOrders } = await supabase
        .from('orders')
        .select('user_id, service_id, link, created_at, id')
        .gt('created_at', tenMinutesAgo);

    const spamMap = new Map(); // key: link+service, val: [orders]

    recentOrders?.forEach(order => {
        const key = `${order.link}|${order.service_id}`;
        if (!spamMap.has(key)) spamMap.set(key, []);
        spamMap.get(key).push(order);
    });

    let detectedSpam = 0;
    for (const [key, orders] of spamMap.entries()) {
        if (orders.length >= 4) { // Threshold: 4+ orders
            const { user_id, link, service_id } = orders[0];

            // Log it
            const { error } = await supabase.from('security_suspicious_activity').insert({
                activity_type: 'duplicate_spam',
                user_id: user_id,
                link: link,
                service_id: service_id,
                event_count: orders.length,
                severity: 'medium',
                details: { order_ids: orders.map(o => o.id) }
            });

            if (!error) {
                console.warn(`[SECURITY] Spam detected: ${link} (${orders.length}x)`);
                detectedSpam++;
            }
        }
    }

    // 2. VOLUME SPIKE DETECTION
    // Single User > 20 orders in last 10 minutes
    const userVolumeMap = new Map(); // key: user_id, val: count
    recentOrders?.forEach(order => {
        userVolumeMap.set(order.user_id, (userVolumeMap.get(order.user_id) || 0) + 1);
    });

    let detectedSpikes = 0;
    for (const [userId, count] of userVolumeMap.entries()) {
        if (count > 20) {
            const { error } = await supabase.from('security_suspicious_activity').insert({
                activity_type: 'volume_spike',
                user_id: userId,
                event_count: count,
                severity: 'high',
                details: { timeframe: '10m' }
            });

            if (!error) {
                console.warn(`[SECURITY] Volume spike: User ${userId} placed ${count} orders`);
                detectedSpikes++;
            }
        }
    }

    if (detectedSpam > 0 || detectedSpikes > 0) {
        await supabase.rpc('log_system_event', {
            p_type: 'suspicious_activity_detected',
            p_severity: 'warning',
            p_source: 'security-scanner',
            p_description: `Detected ${detectedSpam} spam clusters and ${detectedSpikes} volume spikes.`,
            p_metadata: { spam: detectedSpam, spikes: detectedSpikes }
        });
    }

    console.log(`[SECURITY] Complete. Spam: ${detectedSpam}, Spikes: ${detectedSpikes}`);
    return { spam: detectedSpam, spikes: detectedSpikes };
}
