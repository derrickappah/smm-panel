// Vercel Serverless Function for SMMCost Balance
// This replaces the need for a separate backend server

const REQUEST_TIMEOUT = 20000; // 20 seconds

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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
      // NOTE: API endpoint and request format may need adjustment based on actual API documentation
      // Common patterns: GET /api/balance, GET /api/v1/balance, or POST with action parameter
      const response = await fetch(`${SMMCOST_API_URL}/api/balance`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': SMMCOST_API_KEY, // API key in header (adjust header name if needed)
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Log response status
      console.log('SMMCost Balance API Response:', {
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

        console.error('SMMCost Balance API Error:', {
          status: response.status,
          errorData
        });

        return res.status(response.status).json({ 
          error: errorData.error || errorData.message || `Failed to get balance: ${response.status}`,
          status: response.status,
          details: errorData
        });
      }

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('SMMCost Balance Response Parse Error:', parseError);
        return res.status(500).json({ 
          error: 'Invalid JSON response from SMMCost API',
          parseError: parseError.message
        });
      }

      // Log full response for debugging
      console.log('SMMCost Balance API Full Response:', JSON.stringify(data, null, 2));

      // Validate response structure
      if (typeof data !== 'object' || data === null) {
        console.error('SMMCost returned invalid response format:', typeof data);
        return res.status(500).json({ 
          error: 'SMMCost API returned invalid response format',
          responseType: typeof data
        });
      }

      const duration = Date.now() - startTime;
      console.log(`SMMCost balance fetched successfully in ${duration}ms`);

      return res.status(200).json(data);
    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError.name === 'AbortError') {
        console.error('SMMCost balance request timeout after', REQUEST_TIMEOUT, 'ms');
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
          url: `${SMMCOST_API_URL}/api/balance`
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
    console.error('SMMCost balance error:', {
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
      error: error.message || 'Failed to get balance',
      errorName: error.name,
      details: error.code || error.message
    });
  }
}
