import { getCached, setCached } from '../utils/redisClient.js';

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

    const cacheKey = 'smm:provider:apiowner:balance';

    try {
        const cachedBalance = await getCached(cacheKey);
        if (cachedBalance) {
            return res.status(200).json(cachedBalance);
        }

        const APIOWNER_API_URL = process.env.APIOWNER_API_URL || 'https://apiowner.com/api/v2';
        const APIOWNER_API_KEY = process.env.APIOWNER_API_KEY;

        if (!APIOWNER_API_KEY || APIOWNER_API_KEY.includes('PLACEHOLDER')) {
            return res.status(400).json({ error: 'ApiOwner API key not configured' });
        }

        const formData = new URLSearchParams({
            key: APIOWNER_API_KEY,
            action: 'balance'
        });

        const response = await fetch(APIOWNER_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            return res.status(response.status).json({
                error: errorData.error || errorData.message || 'Failed to fetch balance',
                details: errorData
            });
        }

        const data = await response.json();
        await setCached(cacheKey, data, 60); // 1 minute cache
        return res.status(200).json(data);
    } catch (error) {
        console.error('ApiOwner balance error:', error);
        return res.status(500).json({ error: error.message || 'Failed to fetch balance' });
    }
}
