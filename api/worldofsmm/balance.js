// Vercel Serverless Function for World of SMM Balance

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
        const WORLDOFSMM_API_URL = process.env.WORLDOFSMM_API_URL || 'https://worldofsmm.com/api/v2';
        const WORLDOFSMM_API_KEY = process.env.WORLDOFSMM_API_KEY;

        if (!WORLDOFSMM_API_KEY) {
            return res.status(400).json({
                error: 'World of SMM API key not configured'
            });
        }

        const formData = new URLSearchParams({
            key: WORLDOFSMM_API_KEY,
            action: 'balance'
        });

        const response = await fetch(WORLDOFSMM_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            return res.status(response.status).json({
                error: errorData.error || errorData.message || 'Failed to get balance'
            });
        }

        const data = await response.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error('World of SMM balance error:', error);
        return res.status(500).json({
            error: error.message || 'Failed to get balance'
        });
    }
}
