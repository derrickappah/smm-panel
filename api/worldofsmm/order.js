// Vercel Serverless Function for World of SMM Orders

import { verifyAdmin } from '../utils/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { setCorsHeaders } from '../utils/corsHeaders.js';

const REQUEST_TIMEOUT = 30000; // 30 seconds

export default async function handler(req, res) {
    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Rate Limiting
    const rateLimitResult = await rateLimit(req, res);
    if (rateLimitResult.blocked) {
        return res.status(429).json({ error: rateLimitResult.message });
    }

    const startTime = Date.now();

    try {
        // SECURITY: Only admins can call this direct proxy endpoint
        // Standard users must use /api/place-order
        const { isAdmin } = await verifyAdmin(req).catch(() => ({ isAdmin: false }));
        if (!isAdmin) {
            return res.status(403).json({ error: 'Unauthorized: Direct provider access restricted to admins' });
        }

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

        const WORLDOFSMM_API_URL = process.env.WORLDOFSMM_API_URL || 'https://worldofsmm.com/api/v2';
        const WORLDOFSMM_API_KEY = process.env.WORLDOFSMM_API_KEY;

        if (!WORLDOFSMM_API_KEY) {
            return res.status(500).json({ error: 'World of SMM API key not configured' });
        }

        // Create abort controller for timeout
        let controller = new AbortController();
        let timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        try {
            const formData = new URLSearchParams({
                key: WORLDOFSMM_API_KEY,
                action: 'add',
                service: String(service).trim(),
                link: link.trim(),
                quantity: String(quantity)
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
                    error: errorData.error || errorData.message || `Failed to place order: ${response.status}`,
                    status: response.status,
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
        return res.status(500).json({ error: error.message || 'Failed to place order' });
    }
}
