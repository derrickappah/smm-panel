// Vercel Serverless Function for SMMCost Services
// This replaces the need for a separate backend server
// API keys are kept secure on the server side

const REQUEST_TIMEOUT = 30000; // 30 seconds

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
      // Common patterns: /api/services, /api/v1/services, or POST with action parameter
      const response = await fetch(`${SMMCOST_API_URL}/api/services`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': SMMCOST_API_KEY, // API key in header (adjust header name if needed)
          // Alternative header names: 'Authorization', 'API-Key', 'apikey'
        },
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

      throw fetchError;
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('SMMCost services error:', {
      error: error.message,
      errorName: error.name,
      duration: `${duration}ms`,
      stack: error.stack
    });

    return res.status(500).json({ 
      error: error.message || 'Failed to fetch services',
      errorName: error.name
    });
  }
}
