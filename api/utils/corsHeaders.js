/**
 * Centralized CORS Configuration
 * 
 * Single source of truth for CORS headers across all API endpoints.
 * Import this in every API handler instead of manually setting headers.
 */

const isDevelopment = process.env.NODE_ENV !== 'production' && process.env.VERCEL_ENV !== 'production';

const ALLOWED_ORIGINS = [
  'https://boostupgh.com',
  'https://www.boostupgh.com',
  ...(isDevelopment ? ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000'] : [])
];

/**
 * Set CORS headers on the response.
 * Only allows requests from whitelisted origins.
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
export function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // Default to primary domain (won't match browser origin check, so cross-origin requests are blocked)
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

/**
 * Handle CORS preflight and validate HTTP method.
 * Returns true if the request was handled (preflight or wrong method), false otherwise.
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {string[]} allowedMethods - Allowed HTTP methods (default: ['POST'])
 * @returns {boolean} - true if request was handled, false if caller should continue
 */
export function handlePreflight(req, res, allowedMethods = ['POST']) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }

  if (!allowedMethods.includes(req.method)) {
    res.status(405).json({ error: 'Method not allowed' });
    return true;
  }

  return false;
}
