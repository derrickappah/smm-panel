/**
 * Restore Session API Endpoint
 * 
 * Retrieves the refresh token from the secure, HttpOnly cookie `sb-refresh-token`.
 * This allows the client to restore the Supabase session even if LocalStorage is wiped or unavailable.
 */

export default async function handler(req, res) {
    // Enable CORS
    const origin = req.headers.origin;
    const allowedOrigins = [
        'https://boostupgh.com',
        'https://www.boostupgh.com',
        'http://localhost:3000'
    ];

    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Get tokens from cookies
        const cookies = req.headers.cookie ?
            req.headers.cookie.split(';').reduce((acc, cookie) => {
                const [key, value] = cookie.trim().split('=');
                acc[key] = value;
                return acc;
            }, {}) : {};

        const refreshToken = cookies['sb-refresh-token'];
        const accessToken = cookies['sb-access-token'];

        if (!refreshToken) {
            return res.status(401).json({ error: 'No refresh token found' });
        }

        // Return the tokens
        return res.status(200).json({
            success: true,
            refresh_token: refreshToken,
            access_token: accessToken // Optional, but helps if we want to use it immediately
        });
    } catch (error) {
        console.error('Error in restore-session:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
