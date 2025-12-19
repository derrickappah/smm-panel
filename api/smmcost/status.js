// Vercel Serverless Function for SMMCost Order Status

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
        error: 'Missing required field: order (SMMCost order ID is required)',
        field: 'order'
      });
    }

    const orderId = typeof order === 'string' ? parseInt(order, 10) : order;
    if (isNaN(orderId) || orderId <= 0) {
      return res.status(400).json({ 
        error: 'Invalid order ID: must be a positive integer',
        field: 'order',
        received: order
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
    console.log('SMMCost Status Request:', {
      order: orderId,
      apiUrl: SMMCOST_API_URL,
      timestamp: new Date().toISOString()
    });

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      // Call SMMCost API
      // NOTE: API endpoint and request format may need adjustment based on actual API documentation
      const response = await fetch(`${SMMCOST_API_URL}/api/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': SMMCOST_API_KEY, // API key in header (adjust header name if needed)
        },
        body: JSON.stringify({
          order: orderId
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Log response status
      console.log('SMMCost Status API Response:', {
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

        console.error('SMMCost Status API Error:', {
          status: response.status,
          errorData,
          order: orderId
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
        console.error('SMMCost Status Response Parse Error:', parseError);
        return res.status(500).json({ 
          error: 'Invalid JSON response from SMMCost API',
          parseError: parseError.message
        });
      }

      // Log full response for debugging
      console.log('SMMCost Status API Full Response:', JSON.stringify(data, null, 2));

      // Validate response structure
      if (typeof data !== 'object' || data === null) {
        console.error('SMMCost returned invalid response format:', typeof data);
        return res.status(500).json({ 
          error: 'SMMCost API returned invalid response format',
          responseType: typeof data
        });
      }

      // Check for status field in various formats
      const status = data.status || data.Status || data.STATUS || null;
      if (!status) {
        console.warn('SMMCost status response does not contain status field:', {
          response: data,
          checkedFields: ['status', 'Status', 'STATUS']
        });
        // Don't fail - return the response anyway, let the client handle it
      } else {
        console.log('SMMCost Order Status extracted:', status);
      }

      const duration = Date.now() - startTime;
      console.log(`SMMCost status check completed in ${duration}ms`);

      return res.status(200).json(data);
    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError.name === 'AbortError') {
        console.error('SMMCost status request timeout after', REQUEST_TIMEOUT, 'ms');
        return res.status(504).json({ 
          error: `Request timeout after ${REQUEST_TIMEOUT}ms`,
          timeout: true
        });
      }

      throw fetchError;
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('SMMCost status error:', {
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
