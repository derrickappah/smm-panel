// Vercel Serverless Function for World of SMM Order Status
import { setCorsHeaders } from '../utils/corsHeaders.js';
import { verifyAdmin } from '../utils/auth.js';

const REQUEST_TIMEOUT = 20000; // 20 seconds

export default async function handler(req, res) {
    setCorsHeaders(req, res);

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { isAdmin } = await verifyAdmin(req).catch(() => ({ isAdmin: false }));
    if (!isAdmin) {
        return res.status(403).json({ error: 'Unauthorized: Direct provider status access restricted to admins' });
    }

    try {
        const { order } = req.body;

        if (!order) {
            return res.status(400).json({ error: 'Missing required field: order' });
        }

        const WORLDOFSMM_API_URL = process.env.WORLDOFSMM_API_URL || 'https://worldofsmm.com/api/v2';
        const WORLDOFSMM_API_KEY = process.env.WORLDOFSMM_API_KEY;

        if (!WORLDOFSMM_API_KEY) {
            return res.status(500).json({ error: 'World of SMM API key not configured' });
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        try {
            const formData = new URLSearchParams({
                key: WORLDOFSMM_API_KEY,
                action: 'status',
                order: String(order).trim()
            });

            const response = await fetch(WORLDOFSMM_API_URL, {
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
                    error: errorData.error || errorData.message || 'Failed to get order status'
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
        return res.status(500).json({ error: error.message || 'Failed to get order status' });
    }
}
