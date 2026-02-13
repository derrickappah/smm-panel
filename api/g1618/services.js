// Vercel Serverless Function for G1618 Services

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const G1618_API_URL = process.env.G1618_API_URL || 'https://g1618.com/api/v2';
        const G1618_API_KEY = process.env.G1618_API_KEY;

        if (!G1618_API_KEY) {
            return res.status(500).json({ error: 'G1618 API key not configured' });
        }

        const formData = new URLSearchParams({
            key: G1618_API_KEY,
            action: 'services'
        });

        const response = await fetch(G1618_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            return res.status(response.status).json({
                error: errorData.error || errorData.message || 'Failed to fetch services',
                details: errorData
            });
        }

        const data = await response.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error('G1618 services error:', error);
        return res.status(500).json({
            error: error.message || 'Failed to fetch services'
        });
    }
}
