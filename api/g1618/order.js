// Vercel Serverless Function for G1618 Orders

const REQUEST_TIMEOUT = 30000; // 30 seconds

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { service, link, quantity } = req.body;

        // Input validation
        if (!service) {
            return res.status(400).json({ error: 'Missing required field: service', field: 'service' });
        }
        if (!link) {
            return res.status(400).json({ error: 'Missing required field: link', field: 'link' });
        }
        if (quantity === undefined || quantity === null) {
            return res.status(400).json({ error: 'Missing required field: quantity', field: 'quantity' });
        }

        const G1618_API_URL = process.env.G1618_API_URL || 'https://g1618.com/api/v2';
        const G1618_API_KEY = process.env.G1618_API_KEY;

        if (!G1618_API_KEY) {
            return res.status(500).json({ error: 'G1618 API key not configured' });
        }

        // Create abort controller for timeout
        let controller = new AbortController();
        let timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        try {
            const formData = new URLSearchParams({
                key: G1618_API_KEY,
                action: 'add',
                service: String(service).trim(),
                link: link.trim(),
                quantity: String(quantity)
            });

            const response = await fetch(G1618_API_URL, {
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
                    error: errorData.error || errorData.message || `Failed to place order: ${response.status}`,
                    status: response.status,
                    details: errorData
                });
            }

            const data = await response.json();

            // Check for API-level errors in 200 OK response
            if (data.error) {
                return res.status(400).json({
                    error: data.error,
                    details: data
                });
            }

            return res.status(200).json(data);
        } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                return res.status(504).json({ error: `Request timeout after ${REQUEST_TIMEOUT}ms`, timeout: true });
            }
            throw fetchError;
        }
    } catch (error) {
        return res.status(500).json({ error: error.message || 'Failed to place order' });
    }
}
