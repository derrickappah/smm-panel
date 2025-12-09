// Vercel Serverless Function for SMMGen Order Status

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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();

  try {
    const { order } = req.body;

    // Input validation with detailed error messages
    if (!order) {
      return res.status(400).json({ 
        error: 'Missing required field: order (SMMGen order ID is required)',
        field: 'order'
      });
    }

    if (typeof order !== 'string' || order.trim() === '') {
      return res.status(400).json({ 
        error: 'Invalid order: must be a non-empty string',
        field: 'order',
        received: typeof order
      });
    }

    const SMMGEN_API_URL = process.env.SMMGEN_API_URL || 'https://smmgen.com/api/v2';
    const SMMGEN_API_KEY = process.env.SMMGEN_API_KEY;

    if (!SMMGEN_API_KEY) {
      console.error('SMMGen API key not configured');
      return res.status(500).json({ 
        error: 'SMMGen API key not configured. Set SMMGEN_API_KEY in Vercel environment variables.',
        configIssue: true
      });
    }

    // Log request details
    console.log('SMMGen Status Request:', {
      order: order.trim(),
      apiUrl: SMMGEN_API_URL,
      timestamp: new Date().toISOString()
    });

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch(SMMGEN_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          key: SMMGEN_API_KEY,
          action: 'status',
          order: order.trim()
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Log response status
      console.log('SMMGen Status API Response:', {
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

        console.error('SMMGen Status API Error:', {
          status: response.status,
          errorData,
          order: order.trim()
        });

        return res.status(response.status).json({ 
          error: errorData.error || errorData.message || `Failed to get order status: ${response.status}`,
          status: response.status,
          details: errorData
        });
      }

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('SMMGen Status Response Parse Error:', parseError);
        return res.status(500).json({ 
          error: 'Invalid JSON response from SMMGen API',
          parseError: parseError.message
        });
      }

      // Log full response for debugging
      console.log('SMMGen Status API Full Response:', JSON.stringify(data, null, 2));

      // Validate response structure
      if (typeof data !== 'object' || data === null) {
        console.error('SMMGen returned invalid response format:', typeof data);
        return res.status(500).json({ 
          error: 'SMMGen API returned invalid response format',
          responseType: typeof data
        });
      }

      // Check for status field in various formats
      const status = data.status || data.Status || data.STATUS || null;
      if (!status) {
        console.warn('SMMGen status response does not contain status field:', {
          response: data,
          checkedFields: ['status', 'Status', 'STATUS']
        });
        // Don't fail - return the response anyway, let the client handle it
      } else {
        console.log('SMMGen Order Status extracted:', status);
      }

      const duration = Date.now() - startTime;
      console.log(`SMMGen status check completed in ${duration}ms`);

      return res.status(200).json(data);
    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError.name === 'AbortError') {
        console.error('SMMGen status request timeout after', REQUEST_TIMEOUT, 'ms');
        return res.status(504).json({ 
          error: `Request timeout after ${REQUEST_TIMEOUT}ms`,
          timeout: true
        });
      }

      throw fetchError;
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('SMMGen status error:', {
      error: error.message,
      errorName: error.name,
      duration: `${duration}ms`,
      stack: error.stack
    });

    return res.status(500).json({ 
      error: error.message || 'Failed to get order status',
      errorName: error.name
    });
  }
}

