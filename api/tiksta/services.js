import { getCached, setCached } from '../utils/redisClient.js';
import { setCorsHeaders } from '../utils/corsHeaders.js';
import { verifyAdmin } from '../utils/auth.js';
import { getConfig } from '../utils/config.js';

const REQUEST_TIMEOUT = 30000;

export default async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { isAdmin } = await verifyAdmin(req).catch(() => ({ isAdmin: false }));
        if (!isAdmin) return res.status(403).json({ error: 'Unauthorized' });

        const cacheKey = 'smm:provider:tiksta:services';
        const cachedServices = await getCached(cacheKey);
        if (cachedServices) return res.status(200).json(cachedServices);

        const TIKSTA_API_URL = await getConfig('TIKSTA_API_URL', 'https://tiksta.com/api/v2');
        const TIKSTA_API_KEY = await getConfig('TIKSTA_API_KEY');

        if (!TIKSTA_API_KEY || TIKSTA_API_KEY.includes('PLACEHOLDER')) {
            return res.status(500).json({ error: 'Tiksta API key not configured', configIssue: true });
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        try {
            const response = await fetch(TIKSTA_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ key: TIKSTA_API_KEY, action: 'services' }).toString(),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const data = await response.json();

            await setCached(cacheKey, data, 600);
            return res.status(200).json(data);
        } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                return res.status(504).json({ error: `Request timeout after ${REQUEST_TIMEOUT}ms`, timeout: true });
            }
            return res.status(500).json({ error: 'Network Error' });
        }
    } catch (error) {
        return res.status(500).json({ error: 'Server Error' });
    }
}
