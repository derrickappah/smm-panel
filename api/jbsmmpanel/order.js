// Vercel Serverless Function for JB SMM Panel Orders
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
        error: 'Missing required field: service (JB SMM Panel service ID is required)',
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

    const JBSMMPANEL_API_URL = process.env.JBSMMPANEL_API_URL || 'https://jbsmmpanel.com/api/v2';
    const JBSMMPANEL_API_KEY = process.env.JBSMMPANEL_API_KEY;

    if (!JBSMMPANEL_API_KEY) {
      console.error('JB SMM Panel API key not configured');
      return res.status(500).json({ 
        error: 'JB SMM Panel API key not configured. Set JBSMMPANEL_API_KEY in Vercel environment variables.',
        configIssue: true
      });
    }

    // Log request details
    console.log('JB SMM Panel Order Request:', {
      service: serviceId,
      link: link.trim(),
      quantity: quantityNum,
      apiUrl: JBSMMPANEL_API_URL,
      timestamp: new Date().toISOString()
    });

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      // Call JB SMM Panel API
      // Using POST with action parameter
      // API requires x-www-form-urlencoded format, not JSON
      const response = await fetch(JBSMMPANEL_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          key: JBSMMPANEL_API_KEY,
          action: 'add',
          service: serviceId.toString(),
          link: link.trim(),
          quantity: quantityNum.toString()
        }).toString(),
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
        console.error('JB SMM Panel Response Parse Error:', parseError);
        return res.status(500).json({ 
          error: 'Invalid JSON response from JB SMM Panel API',
          parseError: parseError.message
        });
      }

      // Log full response for debugging
      console.log('JB SMM Panel API Full Response:', JSON.stringify(data, null, 2));

      // Check for errors in response body (API might return errors with 200 status)
      if (data && typeof data === 'object' && data.error) {
        console.error('JB SMM Panel Order API returned error in response:', data.error);
        return res.status(400).json({ 
          error: data.error || 'Incorrect request',
          details: data,
          apiError: true
        });
      }

      // Validate response structure
      if (typeof data !== 'object' || data === null) {
        console.error('JB SMM Panel returned invalid response format:', typeof data);
        return res.status(500).json({ 
          error: 'JB SMM Panel API returned invalid response format',
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
        console.warn('JB SMM Panel response does not contain order ID in expected format:', {
          response: data,
          checkedFields: ['order', 'order_id', 'orderId', 'id', 'Order', 'OrderID', 'OrderId', 'data.order', 'data.order_id', 'data.id']
        });
        // Don't fail - return the response anyway, let the client handle it
      } else {
        console.log('JB SMM Panel Order ID extracted:', orderId);
      }

      const duration = Date.now() - startTime;
      console.log(`JB SMM Panel order placed successfully in ${duration}ms`);

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
    console.error('JB SMM Panel order error:', {
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
      error: error.message || 'Failed to place order',
      errorName: error.name,
      details: error.code || error.message
    });
  }
}
