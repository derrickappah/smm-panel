import { redis } from '../utils/redisClient.js';

// Fallback in-memory maps for when Redis is unavailable or unconfigured
const ipRequestCounts = new Map();
const userRequestCounts = new Map();

// Cleanup interval for in-memory fallback (every minute)
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        ipRequestCounts.clear();
        userRequestCounts.clear();
    }, 60000);
}

/**
 * Distributed Rate Limiting Middleware powered by Upstash Redis
 * Performs IP rate limiting (30 req/min) and User rate limiting (10 req/min)
 */
export async function rateLimit(req, res) {
    const rawIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const ip = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : 'unknown';
    const userId = req.body?.user_id || (req.user ? req.user.id : null);

    // If Upstash Redis is active, perform distributed atomic rate-limiting
    if (redis) {
        try {
            const ipKey = `smm:ratelimit:ip:${ip}`;
            const currentIpCount = await redis.incr(ipKey);
            if (currentIpCount === 1) {
                await redis.expire(ipKey, 60);
            }

            if (currentIpCount > 30) {
                return {
                    blocked: true,
                    message: 'Too many requests from this IP. Please try again later.'
                };
            }

            if (userId) {
                const userKey = `smm:ratelimit:user:${userId}`;
                const currentUserCount = await redis.incr(userKey);
                if (currentUserCount === 1) {
                    await redis.expire(userKey, 60);
                }

                if (currentUserCount > 10) {
                    return {
                        blocked: true,
                        message: 'Too many order requests. Limit is 10 per minute.'
                    };
                }
            }

            return { blocked: false };
        } catch (err) {
            console.error('[REDIS RATE LIMIT ERROR]: Fallback to in-memory', err.message);
        }
    }

    // In-memory fallback if Redis is unavailable
    const currentIpCount = ipRequestCounts.get(ip) || 0;
    if (currentIpCount >= 30) {
        return {
            blocked: true,
            message: 'Too many requests from this IP. Please try again later.'
        };
    }
    ipRequestCounts.set(ip, currentIpCount + 1);

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

