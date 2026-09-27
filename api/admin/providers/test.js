import { setCorsHeaders } from '../../utils/corsHeaders.js';
import { verifyAdmin } from '../../utils/auth.js';
import { testDynamicConnection } from '../../utils/dynamicProviderClient.js';

export default async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { isAdmin } = await verifyAdmin(req).catch(() => ({ isAdmin: false }));
        if (!isAdmin) {
            return res.status(403).json({ error: 'Unauthorized: Admin access required' });
        }

        const { api_url, api_key } = req.body;

        if (!api_url || typeof api_url !== 'string') {
            return res.status(400).json({ error: 'API URL is required' });
        }
        if (!api_key || typeof api_key !== 'string') {
            return res.status(400).json({ error: 'API Key is required' });
        }

        const testResult = await testDynamicConnection(api_url, api_key);
        return res.status(200).json(testResult);
    } catch (err) {
        return res.status(400).json({
            success: false,
            error: err.message || 'Connection test failed'
        });
    }
}
