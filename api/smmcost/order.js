// Vercel Serverless Function for SMMCost Orders
// This replaces the need for a separate backend server
import { verifyAdmin } from '../utils/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const REQUEST_TIMEOUT = 30000; // 30 seconds

export default async function handler(req, res) {
  // Enable CORS - restricted to app domain only
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://yourdomain.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 🔴 SECURITY PATCH: Global Rate Limiting
  const rateLimitResult = await rateLimit(req, res);
  if (rateLimitResult.blocked) {
    return res.status(429).json({ error: rateLimitResult.message });
  }

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();

  try {
    // SECURITY: Only admins can call this direct proxy endpoint
    // Standard users must use /api/order/create
    const { isAdmin } = await verifyAdmin(req).catch(() => ({ isAdmin: false }));
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: Direct provider access restricted to admins' });
    }
    const { service, link, quantity } = req.body;

    // Input validation with detailed error messages
    if (!service) {
      return res.status(400).json({
        error: 'Missing required field: service (SMMCost service ID is required)',
        field: 'service'
      });
    }

    if (typeof service !== 'number' && typeof service !== 'string') {
      return res.status(400).json({
        error: 'Invalid service: must be a number or numeric string',
        field: 'service',
        received: typeof service
      });
    }

    const serviceId = typeof service === 'string' ? parseInt(service, 10) : service;
    if (isNaN(serviceId) || serviceId <= 0) {
      return res.status(400).json({
        error: 'Invalid service ID: must be a positive integer',
        field: 'service',
        received: service
      });
    }

    if (!link) {
      return res.status(400).json({
        error: 'Missing required field: link (target URL is required)',
        field: 'link'
      });
    }

    if (typeof link !== 'string' || link.trim() === '') {
      return res.status(400).json({
        error: 'Invalid link: must be a non-empty string',
        field: 'link',
        received: typeof link
      });
    }

    if (quantity === undefined || quantity === null) {
      return res.status(400).json({
        error: 'Missing required field: quantity',
        field: 'quantity'
      });
    }

    const quantityNum = Number(quantity);
    if (isNaN(quantityNum) || quantityNum <= 0 || !Number.isInteger(quantityNum)) {
      return res.status(400).json({
        error: `Invalid quantity: must be a positive integer, got ${quantity}`,
        field: 'quantity',
        received: quantity,
        type: typeof quantity
      });
    }

    const SMMCOST_API_URL = process.env.SMMCOST_API_URL || 'https://api.smmcost.com';
    const SMMCOST_API_KEY = process.env.SMMCOST_API_KEY;

    if (!SMMCOST_API_KEY) {
      console.error('SMMCost API key not configured');
      return res.status(500).json({
        error: 'SMMCost API key not configured. Set SMMCOST_API_KEY in Vercel environment variables.',
        configIssue: true
      });
    }

    // Log request details
    console.log('SMMCost Order Request:', {
      service: serviceId,
      link: link.trim(),
      quantity: quantityNum,
      apiUrl: SMMCOST_API_URL,
      timestamp: new Date().toISOString()
    });

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      // Call SMMCost API
      // Using POST with action parameter (similar to SMMGen pattern)
      // If SMMCost uses different endpoints, adjust SMMCOST_API_URL accordingly
      const response = await fetch(SMMCOST_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': SMMCOST_API_KEY, // API key in header (adjust header name if needed)
        },
        body: JSON.stringify({
          action: 'add', // or 'order' depending on SMMCost API
          key: SMMCOST_API_KEY, // Some APIs also require key in body
          service: serviceId,
          link: link.trim(),
          quantity: quantityNum
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Log response status
      console.log('SMMCost API Response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (parseError) {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
        }

        console.error('SMMCost API Error:', {
          status: response.status,
          errorData,
          service: serviceId,
          link: link.trim(),
          quantity: quantityNum
        });

        return res.status(response.status).json({
          error: errorData.error || errorData.message || `Failed to place order: ${response.status}`,
          status: response.status,
          details: errorData
        });
      }

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('SMMCost Response Parse Error:', parseError);
        return res.status(500).json({
          error: 'Invalid JSON response from SMMCost API',
          parseError: parseError.message
        });
      }

      // Log full response for debugging
      console.log('SMMCost API Full Response:', JSON.stringify(data, null, 2));

      // Validate response structure
      if (typeof data !== 'object' || data === null) {
        console.error('SMMCost returned invalid response format:', typeof data);
        return res.status(500).json({
          error: 'SMMCost API returned invalid response format',
          responseType: typeof data
        });
      }

      // Check for order ID in various formats (expecting numeric ID)
      const orderId = data.order ||
        data.order_id ||
        data.orderId ||
        data.id ||
        data.Order ||
        data.OrderID ||
        data.OrderId ||
        (data.data && (data.data.order || data.data.order_id || data.data.id)) ||
        null;

      if (!orderId) {
        console.warn('SMMCost response does not contain order ID in expected format:', {
          response: data,
          checkedFields: ['order', 'order_id', 'orderId', 'id', 'Order', 'OrderID', 'OrderId', 'data.order', 'data.order_id', 'data.id']
        });
        // Don't fail - return the response anyway, let the client handle it
      } else {
        console.log('SMMCost Order ID extracted:', orderId);
      }

      const duration = Date.now() - startTime;
      console.log(`SMMCost order placed successfully in ${duration}ms`);

      return res.status(200).json(data);
    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError.name === 'AbortError') {
        console.error('SMMCost request timeout after', REQUEST_TIMEOUT, 'ms');
        return res.status(504).json({
          error: `Request timeout after ${REQUEST_TIMEOUT}ms`,
          timeout: true
        });
      }

      // Handle network errors (DNS, connection refused, etc.)
      if (fetchError.message?.includes('fetch failed') || fetchError.code === 'ENOTFOUND' || fetchError.code === 'ECONNREFUSED') {
        console.error('SMMCost network error:', {
          error: fetchError.message,
          code: fetchError.code,
          url: `${SMMCOST_API_URL}/api/order`
        });
        return res.status(500).json({
          error: `Failed to connect to SMMCost API at ${SMMCOST_API_URL}. Please verify SMMCOST_API_URL is correct and the API is accessible.`,
          networkError: true,
          url: SMMCOST_API_URL,
          details: fetchError.message
        });
      }

      throw fetchError;
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('SMMCost order error:', {
      error: error.message,
      errorName: error.name,
      duration: `${duration}ms`,
      stack: error.stack,
      code: error.code
    });

    // Check for network-related errors
    if (error.message?.includes('fetch failed') || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return res.status(500).json({
        error: `Network error: Failed to connect to SMMCost API. Please verify SMMCOST_API_URL is correct.`,
        networkError: true,
        details: error.message
      });
    }

    return res.status(500).json({
      error: error.message || 'Failed to place order',
      errorName: error.name,
      details: error.code || error.message
    });
  }
}
