// Vercel Serverless Function for SMMGen Orders
// This replaces the need for a separate backend server

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
    const { service, link, quantity } = req.body;

    // Input validation with detailed error messages
    if (!service) {
      return res.status(400).json({ 
        error: 'Missing required field: service (SMMGen service ID is required)',
        field: 'service'
      });
    }

    if (typeof service !== 'string' || service.trim() === '') {
      return res.status(400).json({ 
        error: 'Invalid service: must be a non-empty string',
        field: 'service',
        received: typeof service
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
    console.log('SMMGen Order Request:', {
      service: service.trim(),
      link: link.trim(),
      quantity: quantityNum,
      apiUrl: SMMGEN_API_URL,
      timestamp: new Date().toISOString()
    });

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      // Call SMMGen API
      const response = await fetch(SMMGEN_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          key: SMMGEN_API_KEY,
          action: 'add',
          service: service.trim(),
          link: link.trim(),
          quantity: quantityNum
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Log response status
      console.log('SMMGen API Response:', {
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

        console.error('SMMGen API Error:', {
          status: response.status,
          errorData,
          service: service.trim(),
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
        console.error('SMMGen Response Parse Error:', parseError);
        return res.status(500).json({ 
          error: 'Invalid JSON response from SMMGen API',
          parseError: parseError.message
        });
      }

      // Log full response for debugging
      console.log('SMMGen API Full Response:', JSON.stringify(data, null, 2));

      // Validate response structure
      if (typeof data !== 'object' || data === null) {
        console.error('SMMGen returned invalid response format:', typeof data);
        return res.status(500).json({ 
          error: 'SMMGen API returned invalid response format',
          responseType: typeof data
        });
      }

      // Check for order ID in various formats
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
        console.warn('SMMGen response does not contain order ID in expected format:', {
          response: data,
          checkedFields: ['order', 'order_id', 'orderId', 'id', 'Order', 'OrderID', 'OrderId', 'data.order', 'data.order_id', 'data.id']
        });
        // Don't fail - return the response anyway, let the client handle it
      } else {
        console.log('SMMGen Order ID extracted:', orderId);
      }

      const duration = Date.now() - startTime;
      console.log(`SMMGen order placed successfully in ${duration}ms`);

      return res.status(200).json(data);
    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError.name === 'AbortError') {
        console.error('SMMGen request timeout after', REQUEST_TIMEOUT, 'ms');
        return res.status(504).json({ 
          error: `Request timeout after ${REQUEST_TIMEOUT}ms`,
          timeout: true
        });
      }

      throw fetchError;
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('SMMGen order error:', {
      error: error.message,
      errorName: error.name,
      duration: `${duration}ms`,
      stack: error.stack
    });

    return res.status(500).json({ 
      error: error.message || 'Failed to place order',
      errorName: error.name
    });
  }
}

