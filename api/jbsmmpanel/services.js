// Vercel Serverless Function for JB SMM Panel Services
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
    const JBSMMPANEL_API_URL = process.env.JBSMMPANEL_API_URL || 'https://jbsmmpanel.com/api/v2';
    const JBSMMPANEL_API_KEY = process.env.JBSMMPANEL_API_KEY;

    if (!JBSMMPANEL_API_KEY) {
      console.error('JB SMM Panel API key not configured');
      return res.status(500).json({ 
        error: 'JB SMM Panel API key not configured. Set JBSMMPANEL_API_KEY in Vercel environment variables.',
        configIssue: true
      });
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      // Call JB SMM Panel API
      // Using POST with action parameter
      const response = await fetch(JBSMMPANEL_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          key: JBSMMPANEL_API_KEY,
          action: 'services'
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Log response status
      console.log('JB SMM Panel API Response:', {
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

        console.error('JB SMM Panel API Error:', {
          status: response.status,
          errorData
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
        console.error('JB SMM Panel Response Parse Error:', parseError);
        return res.status(500).json({ 
          error: 'Invalid JSON response from JB SMM Panel API',
          parseError: parseError.message
        });
      }

      // Log full response for debugging
      console.log('JB SMM Panel API Full Response:', JSON.stringify(data, null, 2));

      // Validate response structure
      if (typeof data !== 'object' || data === null) {
        console.error('JB SMM Panel returned invalid response format:', typeof data);
        return res.status(500).json({ 
          error: 'JB SMM Panel API returned invalid response format',
          responseType: typeof data
        });
      }

      const duration = Date.now() - startTime;
      console.log(`JB SMM Panel services fetched successfully in ${duration}ms`);

      return res.status(200).json(data);
    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError.name === 'AbortError') {
        console.error('JB SMM Panel request timeout after', REQUEST_TIMEOUT, 'ms');
        return res.status(504).json({ 
          error: `Request timeout after ${REQUEST_TIMEOUT}ms`,
          timeout: true
        });
      }

      // Handle network errors (DNS, connection refused, etc.)
      if (fetchError.message?.includes('fetch failed') || fetchError.code === 'ENOTFOUND' || fetchError.code === 'ECONNREFUSED') {
        console.error('JB SMM Panel network error:', {
          error: fetchError.message,
          code: fetchError.code,
          url: JBSMMPANEL_API_URL
        });
        return res.status(500).json({ 
          error: `Failed to connect to JB SMM Panel API at ${JBSMMPANEL_API_URL}. Please verify JBSMMPANEL_API_URL is correct and the API is accessible.`,
          networkError: true,
          url: JBSMMPANEL_API_URL,
          details: fetchError.message
        });
      }

      throw fetchError;
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('JB SMM Panel services error:', {
      error: error.message,
      errorName: error.name,
      duration: `${duration}ms`,
      stack: error.stack,
      code: error.code
    });

    // Check for network-related errors
    if (error.message?.includes('fetch failed') || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return res.status(500).json({ 
        error: `Network error: Failed to connect to JB SMM Panel API. Please verify JBSMMPANEL_API_URL is correct.`,
        networkError: true,
        details: error.message
      });
    }

    return res.status(500).json({ 
      error: error.message || 'Failed to fetch services',
      errorName: error.name,
      details: error.code || error.message
    });
  }
}
