import { getCached, setCached } from '../utils/redisClient.js';
import { setCorsHeaders } from '../utils/corsHeaders.js';
import { verifyAdmin } from '../utils/auth.js';

const REQUEST_TIMEOUT = 30000; // 30 seconds

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { isAdmin } = await verifyAdmin(req).catch(() => ({ isAdmin: false }));
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: Direct provider access restricted to admins' });
    }

    const startTime = Date.now();
    const cacheKey = 'smm:provider:smmcost:services';

    const cachedServices = await getCached(cacheKey);
    if (cachedServices) {
      return res.status(200).json(cachedServices);
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
          // Alternative header names: 'Authorization', 'API-Key', 'apikey'
        },
        body: JSON.stringify({
          action: 'services',
          key: SMMCOST_API_KEY // Some APIs also require key in body
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Log response status
      console.log('SMMCost API Response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        url: `${SMMCOST_API_URL}/api/services`
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
          url: `${SMMCOST_API_URL}/api/services`
        });

        return res.status(response.status).json({ 
          error: errorData.error || errorData.message || `Failed to fetch services: ${response.status}`,
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

      const duration = Date.now() - startTime;
      console.log(`SMMCost services fetched successfully in ${duration}ms`);

      await setCached(cacheKey, data, 600);

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
          url: `${SMMCOST_API_URL}/api/services`
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
    console.error('SMMCost services error:', {
      error: error.message,
      errorName: error.name,
      duration: `${duration}ms`,
      stack: error.stack,
      code: error.code
    });

    return res.status(500).json({ 
      error: 'Failed to fetch services from provider. Please try again later.'
    });
  }
}
