// Vercel Serverless Function for OldSMM Status

const REQUEST_TIMEOUT = 10000; // 10 seconds for status check

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { order } = req.body;

        if (!order) {
            return res.status(400).json({ error: 'Order ID is required' });
        }

        const OLDSMM_API_URL = process.env.OLDSMM_API_URL || 'https://oldsmm.com/api/v2';
        const OLDSMM_API_KEY = process.env.OLDSMM_API_KEY;

        if (!OLDSMM_API_KEY) {
            return res.status(500).json({ error: 'OldSMM API key not configured' });
        }

        // Create abort controller for timeout
        let controller = new AbortController();
        let timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        try {
            const formData = new URLSearchParams({
                key: OLDSMM_API_KEY,
                action: 'status',
                order: String(order)
            });

            const response = await fetch(OLDSMM_API_URL, {
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
                    error: errorData.error || errorData.message || 'Failed to check status',
                    details: errorData
                });
            }

            const data = await response.json();
            return res.status(200).json(data);
        } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                return res.status(504).json({ error: 'Request timeout', timeout: true });
            }
            throw fetchError;
        }
    } catch (error) {
        console.error('OldSMM status check error:', error);
        return res.status(500).json({
            error: error.message || 'Failed to check status'
        });
    }
}
