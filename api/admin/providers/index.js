import { setCorsHeaders } from '../../utils/corsHeaders.js';
import { verifyAdmin, getServiceRoleClient } from '../../utils/auth.js';
import { 
    testDynamicConnection, 
    generateProviderSlug, 
    invalidateDynamicProviderCache 
} from '../../utils/dynamicProviderClient.js';

export default async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { isAdmin } = await verifyAdmin(req).catch(() => ({ isAdmin: false }));
        if (!isAdmin) {
            return res.status(403).json({ error: 'Unauthorized: Admin access required' });
        }

        const supabase = getServiceRoleClient();

        // GET: List all dynamic providers
        if (req.method === 'GET') {
            const { data, error } = await supabase
                .from('smm_providers')
                .select('*')
                .order('priority', { ascending: true })
                .order('created_at', { ascending: true });

            if (error) throw error;
            return res.status(200).json({ success: true, providers: data || [] });
        }

        // POST: Add new dynamic provider
        if (req.method === 'POST') {
            const { name, api_url, api_key, priority, skipTest } = req.body;

            if (!name || typeof name !== 'string' || !name.trim()) {
                return res.status(400).json({ error: 'Provider name is required' });
            }
            if (!api_url || typeof api_url !== 'string' || !api_url.trim()) {
                return res.status(400).json({ error: 'API URL is required' });
            }
            if (!api_key || typeof api_key !== 'string' || !api_key.trim()) {
                return res.status(400).json({ error: 'API Key is required' });
            }

            const cleanName = name.trim();
            const cleanUrl = api_url.trim();
            const cleanKey = api_key.trim();
            const priorityNum = parseInt(priority, 10) || 100;

            let baseSlug = generateProviderSlug(cleanName);
            if (!baseSlug) baseSlug = `provider${Date.now()}`;

            // Ensure slug uniqueness
            let uniqueSlug = baseSlug;
            let counter = 1;
            while (true) {
                const { data: existing } = await supabase
                    .from('smm_providers')
                    .select('id')
                    .eq('slug', uniqueSlug)
                    .maybeSingle();

                if (!existing) break;
                uniqueSlug = `${baseSlug}${counter++}`;
            }

            // Test connection unless explicitly skipped
            let balance = 0;
            let currency = 'USD';
            if (!skipTest) {
                try {
                    const testRes = await testDynamicConnection(cleanUrl, cleanKey);
                    balance = testRes.balance || 0;
                    currency = testRes.currency || 'USD';
                } catch (testErr) {
                    return res.status(400).json({
                        error: `Provider connection failed: ${testErr.message}`,
                        connectionFailed: true
                    });
                }
            }

            const { data: newProvider, error: insertError } = await supabase
                .from('smm_providers')
                .insert({
                    name: cleanName,
                    slug: uniqueSlug,
                    api_url: cleanUrl,
                    api_key: cleanKey,
                    status: 'active',
                    priority: priorityNum,
                    balance,
                    currency,
                    last_balance_check: new Date().toISOString()
                })
                .select()
                .single();

            if (insertError) throw insertError;

            await invalidateDynamicProviderCache(uniqueSlug);
            return res.status(201).json({ success: true, provider: newProvider });
        }

        // PUT: Update dynamic provider
        if (req.method === 'PUT') {
            const { id, name, api_url, api_key, status, priority } = req.body;
            if (!id) return res.status(400).json({ error: 'Provider ID is required' });

            const updates = { updated_at: new Date().toISOString() };
            if (name) updates.name = name.trim();
            if (api_url) updates.api_url = api_url.trim();
            if (api_key) updates.api_key = api_key.trim();
            if (status && ['active', 'disabled'].includes(status)) updates.status = status;
            if (priority !== undefined) updates.priority = parseInt(priority, 10) || 100;

            const { data: updatedProvider, error: updateError } = await supabase
                .from('smm_providers')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (updateError) throw updateError;

            await invalidateDynamicProviderCache(updatedProvider?.slug);
            return res.status(200).json({ success: true, provider: updatedProvider });
        }

        // DELETE: Delete dynamic provider
        if (req.method === 'DELETE') {
            const { id } = req.body || req.query;
            if (!id) return res.status(400).json({ error: 'Provider ID is required' });

            const { data: provider } = await supabase
                .from('smm_providers')
                .select('slug, name')
                .eq('id', id)
                .single();

            if (!provider) {
                return res.status(404).json({ error: 'Provider not found' });
            }

            // Check if there are active orders associated with this dynamic provider
            const { count: orderCount } = await supabase
                .from('orders')
                .select('id', { count: 'exact', head: true })
                .eq('dynamic_provider', provider.slug)
                .in('status', ['pending', 'processing', 'in progress']);

            if (orderCount && orderCount > 0) {
                return res.status(400).json({
                    error: `Cannot delete provider '${provider.name}': There are ${orderCount} pending/processing orders associated with it. Please complete or refund them first, or disable the provider instead.`
                });
            }

            const { error: deleteError } = await supabase
                .from('smm_providers')
                .delete()
                .eq('id', id);

            if (deleteError) throw deleteError;

            await invalidateDynamicProviderCache(provider.slug);
            return res.status(200).json({ success: true, message: 'Provider deleted successfully' });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('[API Providers Error]:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
