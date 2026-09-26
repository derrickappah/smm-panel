import { getCached, setCached } from '../utils/redisClient.js';
import { setCorsHeaders } from '../utils/corsHeaders.js';
import { verifyAdmin } from '../utils/auth.js';
import { getConfig } from '../utils/config.js';

const REQUEST_TIMEOUT = 20000;

export default async function handler(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { isAdmin } = await verifyAdmin(req).catch(() => ({ isAdmin: false }));
        if (!isAdmin) return res.status(403).json({ error: 'Unauthorized' });

        const cacheKey = 'smm:provider:quickmedia:balance';
        const cachedBalance = await getCached(cacheKey);
        if (cachedBalance) return res.status(200).json(cachedBalance);

        const QUICKMEDIA_API_URL = await getConfig('QUICKMEDIA_API_URL', 'https://thequickmediasoft.com/api/v2');
        const QUICKMEDIA_API_KEY = await getConfig('QUICKMEDIA_API_KEY');

        if (!QUICKMEDIA_API_KEY || QUICKMEDIA_API_KEY.includes('PLACEHOLDER')) {
            return res.status(500).json({ error: 'QuickMedia API key not configured', configIssue: true });
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        try {
            const response = await fetch(QUICKMEDIA_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ key: QUICKMEDIA_API_KEY, action: 'balance' }).toString(),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            if (data.error) return res.status(400).json({ error: data.error });

            await setCached(cacheKey, data, 180);
            return res.status(200).json(data);
        } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                return res.status(504).json({ error: `Request timeout after ${REQUEST_TIMEOUT}ms`, timeout: true });
            }
            return res.status(500).json({ error: fetchError.message });
        }
    } catch (error) {
        return res.status(500).json({ error: 'Failed to retrieve balance from QuickMedia.' });
    }
}
