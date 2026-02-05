// Rate Limiter using a simple in-memory Map (works for warm lambdas)
// In production with high scale, this should use Redis/KV
// But this fulfills the immediate security requirement for locking down 
// automated attacks on a single container instance.

const ipRequestCounts = new Map();
const userRequestCounts = new Map();

// Cleanup interval (every minute)
setInterval(() => {
    ipRequestCounts.clear();
    userRequestCounts.clear();
}, 60000);

export async function rateLimit(req, res) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const userId = req.body?.user_id || (req.user ? req.user.id : null);

    // IP Limit: 30 requests per minute
    const currentIpCount = ipRequestCounts.get(ip) || 0;
    if (currentIpCount >= 30) {
        return {
            blocked: true,
            message: 'Too many requests from this IP. Please try again later.'
        };
    }
    ipRequestCounts.set(ip, currentIpCount + 1);

    // User Limit: 10 requests per minute (if authenticated)
    if (userId) {
        const currentUserCount = userRequestCounts.get(userId) || 0;
        if (currentUserCount >= 10) {
            return {
                blocked: true,
                message: 'Too many order requests. Limit is 10 per minute.'
            };
        }
        userRequestCounts.set(userId, currentUserCount + 1);
    }

    return { blocked: false };
}
