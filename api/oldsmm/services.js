// Vercel Serverless Function for OldSMM Services

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
        const OLDSMM_API_URL = process.env.OLDSMM_API_URL || 'https://oldsmm.com/api/v2';
        const OLDSMM_API_KEY = process.env.OLDSMM_API_KEY;

        if (!OLDSMM_API_KEY) {
            return res.status(500).json({ error: 'OldSMM API key not configured' });
        }

        const formData = new URLSearchParams({
            key: OLDSMM_API_KEY,
            action: 'services'
        });

        const response = await fetch(OLDSMM_API_URL, {
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
        console.error('OldSMM services error:', error);
        return res.status(500).json({
            error: error.message || 'Failed to fetch services'
        });
    }
}
