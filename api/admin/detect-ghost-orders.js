import { getServiceRoleClient } from '../utils/auth.js';
import { fetchProviderOrders } from '../utils/providers.js';

/**
 * Main Reconciliation Function
 * Compares Provider API orders vs Local DB to find "Ghost Orders".
 */
export async function runGhostOrderDetection() {
    console.log('[RECON] Starting Ghost Order Detection...');
    const supabase = getServiceRoleClient();
    const PROVIDERS = ['smmgen', 'jbsmmpanel', 'smmcost'];
    const CHECK_LIMIT = 200; // Check last 200 orders from each provider
    let totalGhostOrders = 0;

    for (const provider of PROVIDERS) {
        try {
            console.log(`[RECON] Fetching orders from ${provider}...`);
            const externalOrders = await fetchProviderOrders(provider, CHECK_LIMIT);
            console.log(`[RECON] ${provider} returned ${externalOrders?.length || 0} orders.`);

            if (!externalOrders || externalOrders.length === 0) {
                console.log(`[RECON] No orders found for ${provider} or API not supported.`);
                continue;
            }

            // Get local orders that might match these IDs
            const externalIds = externalOrders.map(o => o.id);
            const { data: localMatches } = await supabase
                .from('orders')
                .select('provider_order_id, link, quantity, service_id, created_at')
                .in('provider_order_id', externalIds);

            const localMap = new Map();
            localMatches?.forEach(o => localMap.set(o.provider_order_id, o));

            for (const extOrder of externalOrders) {
                // 1. Primary Check: Order ID
                if (localMap.has(extOrder.id)) {
                    // console.log(`[RECON] Matched ID ${extOrder.id}`); 
                    continue; // Match found, valid order
                }

                console.warn(`[RECON] No ID match for ${extOrder.id}. Checking fingerprint...`);

                // 2. Secondary Check: Fingerprint (Link + Qty + Service +/- Time)
                // If ID is missing, did we have a local order that matches the characteristics?
                // This covers cases where provider ID wasn't saved yet or manual placement.
                const { data: fingerprintMatch } = await supabase
                    .from('orders')
                    .select('id')
                    .eq('link', extOrder.link)
                    .eq('quantity', extOrder.quantity)
                    .gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24h
                    .limit(1);

                if (fingerprintMatch && fingerprintMatch.length > 0) {
                    // It's likely valid, just missing the ID linkage.
                    // We can optionally auto-heal this, but for now, skip marking as ghost.
                    continue;
                }

                // 3. CONFIRMED GHOST ORDER
                // No ID match, no fingerprint match.
                console.warn(`[GHOST] Detected ghost order at ${provider}: ${extOrder.id} (${extOrder.link})`);

                const { error } = await supabase.from('security_ghost_orders').insert({
                    provider_order_id: extOrder.id,
                    provider_name: provider,
                    service_id: extOrder.service,
                    link: extOrder.link,
                    quantity: extOrder.quantity,
                    charge: extOrder.charge,
                    status: extOrder.status,
                    provider_created_at: extOrder.date ? new Date(extOrder.date) : null,
                    is_resolved: false
                });

                if (!error) totalGhostOrders++;
            }

        } catch (err) {
            console.error(`[RECON] Failed to check ${provider}:`, err);
        }
    }

    if (totalGhostOrders > 0) {
        await supabase.rpc('log_system_event', {
            p_type: 'ghost_orders_detected',
            p_severity: 'critical',
            p_source: 'ghost-detection-job',
            p_description: `Detected ${totalGhostOrders} orders at providers with no local record.`,
            p_metadata: { count: totalGhostOrders }
        });
    }

    console.log(`[RECON] Complete. Found ${totalGhostOrders} ghost orders.`);
    return { ghost_orders: totalGhostOrders };
}
