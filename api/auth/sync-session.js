/**
 * Sync Session API Endpoint
 * 
 * Sets a secure, HttpOnly cookie containing the Supabase access token.
 * This ensures the session persists across page refreshes even if LocalStorage is slow to load.
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

    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { access_token, expires_in } = req.body;

        if (!access_token) {
            // If no token is provided, clear the cookie
            res.setHeader('Set-Cookie', [
                `sb-access-token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Domain=.boostupgh.com`,
                `sb-access-token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` // Also clear on current domain
            ]);
            return res.status(200).json({ success: true, message: 'Session cleared' });
        }

        // Set the cookie
        // Use host header to detect production more accurately
        const host = req.headers.host || '';
        const isProd = host.includes('boostupgh.com') && !host.includes('localhost');
        const domain = isProd ? '; Domain=.boostupgh.com' : '';
        const maxAge = expires_in || 3600;

        res.setHeader('Set-Cookie', `sb-access-token=${access_token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}${domain}`);

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error in sync-session:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
