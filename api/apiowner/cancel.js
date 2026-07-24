const REQUEST_TIMEOUT = 30000;

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { order, orders } = req.body;

        if (!order && !orders) {
            return res.status(400).json({ error: 'Missing required field: order or orders' });
        }

        const APIOWNER_API_URL = process.env.APIOWNER_API_URL || 'https://apiowner.com/api/v2';
        const APIOWNER_API_KEY = process.env.APIOWNER_API_KEY;

        if (!APIOWNER_API_KEY || APIOWNER_API_KEY.includes('PLACEHOLDER')) {
            return res.status(400).json({ error: 'ApiOwner API key not configured' });
        }

        let controller = new AbortController();
        let timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        try {
            const params = {
                key: APIOWNER_API_KEY,
                action: 'cancel',
                orders: orders ? (Array.isArray(orders) ? orders.join(',') : String(orders)) : String(order)
            };

            const formData = new URLSearchParams(params);

            const response = await fetch(APIOWNER_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: formData.toString(),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                return res.status(response.status).json({
                    error: errorData.error || errorData.message || `Cancel request failed: ${response.status}`,
                    details: errorData
                });
            }

            const data = await response.json();
            return res.status(200).json(data);
        } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                return res.status(504).json({ error: `Request timeout after ${REQUEST_TIMEOUT}ms`, timeout: true });
            }
            throw fetchError;
        }
    } catch (error) {
        return res.status(500).json({ error: error.message || 'Failed to process cancel request' });
    }
}
