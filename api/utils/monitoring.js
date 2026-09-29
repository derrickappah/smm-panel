/**
/**
 * Production Monitoring, Telemetry, and Reliability Core Utility
 * 
 * Provides:
 * 1. Request correlation ID generation & injection (X-Request-ID)
 * 2. Structured, sanitized production logging (zero secret leakage)
 * 3. Incident deduplication & recording (via record_or_update_incident RPC)
 * 4. Latency & performance telemetry tracking (production_metrics table)
 * 5. Configurable anomaly thresholds with app_settings overrides
 * 6. Access control for internal/admin diagnostic endpoints
 * 7. Failure-safe execution (monitoring never crashes business transactions)
 */

import crypto from 'crypto';
import { getServiceRoleClient, verifyAdmin } from './auth.js';
import { getConfig } from './config.js';

// Default Configurable Thresholds
export const MONITORING_THRESHOLDS = {
    ERROR_RATE_WARNING: 5,        // 5% error rate
    ERROR_RATE_CRITICAL: 15,     // 15% error rate
    P95_LATENCY_WARNING: 1500,   // 1500ms
    P95_LATENCY_CRITICAL: 3000,  // 3000ms
    JOB_TIMEOUT_MS: 60000,       // 60 seconds
    PAYMENT_FAILURE_RATE: 20,    // 20% failure rate
    STUCK_ORDER_PENDING_MINS: 15,// 15 minutes in pending
    STUCK_ORDER_PROC_HOURS: 24,  // 24 hours in processing
};

/**
 * Sensitive field patterns to redact from logs and diagnostics
 */
const SENSITIVE_KEY_PATTERNS = [
    /pass(word)?/i,
    /secret/i,
    /token/i,
    /key/i,
    /auth/i,
    /bearer/i,
    /credit[_-]?card/i,
    /cvv/i,
    /pan/i,
    /hash/i,
    /cookie/i
];

/**
 * Recursively sanitize objects to prevent accidental secret leakage
 * @param {any} data
 * @param {number} depth
 * @returns {any}
 */
export function sanitizeData(data, depth = 0) {
    if (depth > 6) return '[MAX_DEPTH]';
    if (data === null || data === undefined) return data;
    if (typeof data !== 'object') {
        if (typeof data === 'string') {
            // Check for JWT token pattern
            if (/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(data)) {
                return '[REDACTED_JWT]';
            }
        }
        return data;
    }

    if (Array.isArray(data)) {
        return data.map(item => sanitizeData(item, depth + 1));
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
        const isSensitive = SENSITIVE_KEY_PATTERNS.some(p => p.test(key));
        if (isSensitive) {
            sanitized[key] = '[REDACTED]';
        } else {
            sanitized[key] = sanitizeData(value, depth + 1);
        }
    }
    return sanitized;
}

/**
 * Extract or generate Request Correlation ID
 * Format: req_<timestamp>_<randomHex>
 * Injects into response header X-Request-ID
 * @param {Object} req
 * @param {Object} [res]
 * @returns {string}
 */
export function getOrCreateRequestId(req, res = null) {
    if (!req) return `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    let reqId = req.headers ? (req.headers['x-request-id'] || req.headers['x-correlation-id']) : null;

    if (!reqId || typeof reqId !== 'string' || reqId.trim().length < 6) {
        reqId = `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    } else {
        reqId = reqId.trim().slice(0, 64);
    }

    req.requestId = reqId;

    if (res && typeof res.setHeader === 'function') {
        res.setHeader('X-Request-ID', reqId);
    }

    return reqId;
}

/**
 * Structured, secret-safe logger
 * @param {string} level - 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL'
 * @param {string} service - e.g. 'payments', 'orders', 'database', 'auth'
 * @param {string} event - e.g. 'order_created', 'payment_verified', 'query_slow'
 * @param {Object} [context] - Context data (will be strictly sanitized)
 */
export function logStructured(level, service, event, context = {}) {
    const timestamp = new Date().toISOString();
    const requestId = context.request_id || context.req?.requestId || null;

    // Remove raw request object before sanitization
    const { req, res, ...restContext } = context;
    const sanitizedContext = sanitizeData(restContext);

    const logEntry = {
        timestamp,
        level: level.toUpperCase(),
        service,
        event,
        request_id: requestId,
        ...sanitizedContext
    };

    const serialized = JSON.stringify(logEntry);

    switch (level.toUpperCase()) {
        case 'CRITICAL':
        case 'ERROR':
            console.error(serialized);
            break;
        case 'WARN':
            console.warn(serialized);
            break;
        default:
            console.log(serialized);
            break;
    }

    return logEntry;
}

/**
 * Record an incident with atomic deduplication
 * @param {Object} params
 * @param {'INFO'|'WARNING'|'ERROR'|'CRITICAL'} params.severity
 * @param {string} params.type - e.g. 'PAYMENT_CREDIT_FAILURE', 'DATABASE_DEGRADED'
 * @param {'Application'|'Database'|'Authentication'|'Payments'|'Orders'|'External APIs'|'Cron Jobs'|'Frontend'} params.component
 * @param {string} params.lastError - Diagnostic message
 * @param {Object} [params.metadata] - Additional non-sensitive context
 * @returns {Promise<Object|null>}
 */
export async function recordIncident({ severity, type, component, lastError, metadata = {} }) {
    try {
        const supabase = getServiceRoleClient();
        const sanitizedMeta = sanitizeData(metadata);

        const { data, error } = await supabase.rpc('record_or_update_incident', {
            p_severity: severity,
            p_type: type,
            p_component: component,
            p_last_error: String(lastError || 'Unknown error').slice(0, 1000),
            p_metadata: sanitizedMeta
        });

        if (error) {
            console.warn('[MONITORING] Failed to record incident RPC:', error.message);
            return null;
        }

        logStructured(severity === 'CRITICAL' ? 'CRITICAL' : 'ERROR', component.toLowerCase(), 'incident_recorded', {
            incident_type: type,
            incident_code: data?.incident_code,
            action: data?.action,
            occurrences: data?.occurrence_count,
            error: lastError
        });

        return data;
    } catch (err) {
        console.warn('[MONITORING] Exception in recordIncident (non-blocking):', err.message);
        return null;
    }
}

/**
 * Record API request performance telemetry
 * Non-blocking, fails gracefully
 * @param {Object} params
 * @param {string} params.endpoint
 * @param {string} params.method
 * @param {number} params.statusCode
 * @param {number} params.durationMs
 * @param {string} params.requestId
 * @param {string} params.component
 */
export async function recordApiMetric({ endpoint, method, statusCode, durationMs, requestId, component }) {
    try {
        const supabase = getServiceRoleClient();
        await supabase
            .from('production_metrics')
            .insert({
                endpoint: endpoint.slice(0, 100),
                method: (method || 'GET').toUpperCase().slice(0, 10),
                status_code: statusCode,
                duration_ms: Math.round(durationMs),
                request_id: requestId ? String(requestId).slice(0, 64) : null,
                component: component || 'Application',
                created_at: new Date().toISOString()
            });
    } catch (err) {
        // Telemetry failure must never disrupt application execution
    }
}

/**
 * Verify administrative or secret-header access for internal monitoring endpoints
 * @param {Object} req
 * @returns {Promise<boolean>}
 */
export async function verifyMonitoringAccess(req) {
    if (!req) return false;

    // 1. Check secret header keys (constant-time check)
    const clientKey = req.headers['x-dev-monitor-key'] || req.headers['x-cron-secret'];
    const devMonitorKey = process.env.DEV_MONITOR_KEY;
    const cronSecret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (clientKey && typeof clientKey === 'string') {
        const keysToCheck = [devMonitorKey, cronSecret].filter(Boolean);
        for (const secret of keysToCheck) {
            try {
                const k1 = Buffer.from(clientKey, 'utf8');
                const k2 = Buffer.from(secret, 'utf8');
                if (k1.length === k2.length && crypto.timingSafeEqual(k1, k2)) {
                    return true;
                }
            } catch { }
        }
    }

    // 2. Check Bearer token matching CRON_SECRET or Service Role Key
    const authHeader = req.headers['authorization'] || '';
    if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '').trim();
        if (cronSecret && token === cronSecret) return true;
        if (process.env.SUPABASE_SERVICE_ROLE_KEY && token === process.env.SUPABASE_SERVICE_ROLE_KEY) return true;
    }

    // 3. Fallback: Authenticate Supabase Admin User
    try {
        const { isAdmin } = await verifyAdmin(req);
        if (isAdmin) return true;
    } catch { }

    return false;
}

/**
 * Higher-order wrapper for API route handlers to provide:
 * - Correlation ID injection
 * - Execution duration tracking
 * - Telemetry metric recording
 * - Automatic 500 error detection & incident reporting
 * - Sanitized response error shielding
 * @param {Function} handler
 * @param {Object} options
 * @param {string} options.component - 'Application' | 'Payments' | 'Orders' | 'Database' | 'Authentication'
 * @param {string} options.serviceName
 */
export function withMonitoring(handler, { component = 'Application', serviceName = 'api' } = {}) {
    return async function monitoredHandler(req, res) {
        const startTime = Date.now();
        const requestId = getOrCreateRequestId(req, res);

        // Intercept response end to capture status code & record telemetry
        const originalEnd = res.end;
        let isEnded = false;

        res.end = function (...args) {
            if (!isEnded) {
                isEnded = true;
                const durationMs = Date.now() - startTime;
                const statusCode = res.statusCode || 200;

                // Asynchronously record telemetry (non-blocking)
                recordApiMetric({
                    endpoint: req.url || 'unknown',
                    method: req.method || 'GET',
                    statusCode,
                    durationMs,
                    requestId,
                    component
                }).catch(() => {});

                // Log slow queries or requests (> 3000ms)
                if (durationMs > 3000) {
                    logStructured('WARN', serviceName, 'high_latency_request', {
                        endpoint: req.url,
                        duration_ms: durationMs,
                        status_code: statusCode,
                        request_id: requestId
                    });
                }
            }
            return originalEnd.apply(res, args);
        };

        try {
            return await handler(req, res);
        } catch (error) {
            const durationMs = Date.now() - startTime;
            const statusCode = error.statusCode || 500;

            logStructured('ERROR', serviceName, 'unhandled_api_exception', {
                error: error.message,
                stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
                duration_ms: durationMs,
                request_id: requestId,
                endpoint: req.url
            });

            // If 5xx, record to incident system
            if (statusCode >= 500) {
                recordIncident({
                    severity: 'ERROR',
                    type: 'API_500_EXCEPTION',
                    component,
                    lastError: `${req.method} ${req.url} -> ${error.message}`,
                    metadata: {
                        endpoint: req.url,
                        method: req.method,
                        request_id: requestId,
                        duration_ms: durationMs
                    }
                }).catch(() => {});
            }

            if (!res.headersSent) {
                return res.status(statusCode).json({
                    error: statusCode >= 500 ? 'Internal server error' : error.message,
                    request_id: requestId
                });
            }
        }
    };
}
