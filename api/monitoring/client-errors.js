import { setCorsHeaders } from '../utils/corsHeaders.js';
import { getOrCreateRequestId, sanitizeData, recordIncident, recordApiMetric } from '../utils/monitoring.js';
import { redis } from '../utils/redisClient.js';

/**
 * Client-Side Error Ingestion Endpoint
 * POST /api/monitoring/client-errors
 * 
 * Captures unhandled React exceptions, script errors, and unhandled promise rejections.
 * Strict rate limiting, secret sanitization, and incident tracking.
 */
export default async function handler(req, res) {
    setCorsHeaders(req, res);
    const requestId = getOrCreateRequestId(req, res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
        const rateLimitKey = `smm:ratelimit:client_errors:${clientIp}`;

        // Rate limit: Max 30 client errors per 5 minutes per IP
        if (redis) {
            try {
                const count = await redis.incr(rateLimitKey);
                if (count === 1) await redis.expire(rateLimitKey, 300);
                if (count > 30) {
                    return res.status(429).json({ error: 'Rate limit exceeded' });
                }
            } catch { }
        }

        const body = req.body || {};
        const {
            message = 'Unknown client error',
            stack = null,
            componentStack = null,
            url = null,
            type = 'javascript_error'
        } = body;

        // Scrub sensitive form inputs or tokens
        const sanitizedDetails = sanitizeData({
            message: String(message).slice(0, 500),
            stack: stack ? String(stack).slice(0, 1500) : null,
            componentStack: componentStack ? String(componentStack).slice(0, 1500) : null,
            url: url ? String(url).slice(0, 200) : null,
            userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 200) : null,
            ip: clientIp
        });

        // Record telemetry metric for Frontend error
        recordApiMetric({
            endpoint: sanitizedDetails.url || '/frontend',
            method: 'CLIENT_ERROR',
            statusCode: 500,
            durationMs: 0,
            requestId,
            component: 'Frontend'
        }).catch(() => {});

        // Record to incident system with deduplication
        await recordIncident({
            severity: 'ERROR',
            type: 'FRONTEND_JS_EXCEPTION',
            component: 'Frontend',
            lastError: `${type}: ${sanitizedDetails.message} at ${sanitizedDetails.url || 'unknown'}`,
            metadata: sanitizedDetails
        });

        return res.status(200).json({
            success: true,
            logged: true,
            request_id: requestId
        });

    } catch (err) {
        return res.status(500).json({
            error: 'Failed to ingest client error',
            request_id: requestId
        });
    }
}
