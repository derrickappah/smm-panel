import { getCached, setCached } from '../utils/redisClient.js';
import { setCorsHeaders } from '../utils/corsHeaders.js';
import { verifyAdmin } from '../utils/auth.js';

export default async function handler(req, res) {
    // Enable CORS
    setCorsHeaders(req, res);

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { isAdmin } = await verifyAdmin(req).catch(() => ({ isAdmin: false }));
        if (!isAdmin) {
            return res.status(403).json({ error: 'Unauthorized: Direct provider access restricted to admins' });
        }

        const cacheKey = 'smm:provider:g1618:services';
        const cachedServices = await getCached(cacheKey);
        if (cachedServices) {
            return res.status(200).json(cachedServices);
        }

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

        // Cache response in Redis for 10 minutes (600s)
        await setCached(cacheKey, data, 600);

        return res.status(200).json(data);
    } catch (error) {
        console.error('G1618 services error:', error);
        return res.status(500).json({
            error: error.message || 'Failed to fetch services'
        });
    }
}
