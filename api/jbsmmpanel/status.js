// Vercel Serverless Function for JB SMM Panel Order Status

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
        error: 'Missing required field: order (JB SMM Panel order ID is required)',
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

    const JBSMMPANEL_API_URL = process.env.JBSMMPANEL_API_URL || 'https://jbsmmpanel.com/api/v2';
    const JBSMMPANEL_API_KEY = process.env.JBSMMPANEL_API_KEY;

    if (!JBSMMPANEL_API_KEY) {
      console.error('JB SMM Panel API key not configured');
      return res.status(500).json({
        error: 'JB SMM Panel API key not configured. Set JBSMMPANEL_API_KEY in Vercel environment variables.',
        configIssue: true
      });
    }

    // Prepare form data for JB SMM Panel API
    // API is very strict: requires x-www-form-urlencoded format, not JSON
    const formData = new URLSearchParams({
      key: JBSMMPANEL_API_KEY,
      action: 'status',
      order: orderId.toString()
    });
    const formDataString = formData.toString();

    // Log request details (without exposing API key)
    console.log('JB SMM Panel Status Request:', {
      order: orderId,
      apiUrl: JBSMMPANEL_API_URL,
      action: 'status',
      hasApiKey: !!JBSMMPANEL_API_KEY,
      formDataLength: formDataString.length,
      formDataPreview: formDataString.replace(/key=[^&]+/, 'key=***'),
      contentType: 'application/x-www-form-urlencoded',
      timestamp: new Date().toISOString()
    });

    let timeoutId = null;
    let controller = null;

    try {
      // Create abort controller for timeout
      controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      // Call JB SMM Panel API
      // Using POST with action parameter
      // API requires x-www-form-urlencoded format, not JSON
      // Must be called from backend (serverless function), not directly from frontend
      const response = await fetch(JBSMMPANEL_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formDataString,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Log response status
      console.log('JB SMM Panel Status API Response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (!response.ok) {
        // Try to get response body as text first to see what the API actually returned
        let responseText;
        let errorData;
        try {
          responseText = await response.text();
          console.error('JB SMM Panel Status API Error - Raw Response:', {
            status: response.status,
            statusText: response.statusText,
            responseText,
            order: orderId,
            contentType: response.headers.get('content-type')
          });

          // Try to parse as JSON
          try {
            errorData = JSON.parse(responseText);
          } catch (parseError) {
            // If not JSON, use the text as error message
            errorData = { error: responseText || `HTTP ${response.status}: ${response.statusText}` };
          }
        } catch (textError) {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
        }

        console.error('JB SMM Panel Status API Error:', {
          status: response.status,
          statusText: response.statusText,
          errorData,
          order: orderId,
          apiUrl: JBSMMPANEL_API_URL
        });

        return res.status(response.status).json({
          error: errorData.error || errorData.message || `Failed to get order status: ${response.status}`,
          status: response.status,
          details: errorData
        });
      }

      // Get response body - API might return JSON or other formats
      let data;
      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');

      try {
        if (isJson) {
          data = await response.json();
        } else {
          // Try to parse as JSON anyway (some APIs don't set content-type correctly)
          const responseText = await response.text();
          console.log('JB SMM Panel Status Response (non-JSON):', {
            contentType,
            responseText: responseText.substring(0, 500), // First 500 chars
            length: responseText.length
          });

          try {
            data = JSON.parse(responseText);
          } catch (parseError) {
            // If not JSON, wrap in an object
            console.warn('JB SMM Panel returned non-JSON response, treating as error');
            return res.status(500).json({
              error: 'JB SMM Panel API returned non-JSON response',
              contentType,
              responsePreview: responseText.substring(0, 200),
              parseError: parseError.message
            });
          }
        }
      } catch (parseError) {
        console.error('JB SMM Panel Status Response Parse Error:', {
          error: parseError.message,
          contentType,
          order: orderId
        });
        return res.status(500).json({
          error: 'Invalid response from JB SMM Panel API',
          parseError: parseError.message,
          contentType
        });
      }

      // Log full response for debugging
      console.log('JB SMM Panel Status API Full Response:', JSON.stringify(data, null, 2));

      // Check for errors in response body (API might return errors with 200 status)
      if (data && typeof data === 'object' && data.error) {
        console.error('JB SMM Panel Status API returned error in response:', data.error);
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

      // Check for status field in various formats
      const status = data.status || data.Status || data.STATUS || null;
      if (!status) {
        console.warn('JB SMM Panel status response does not contain status field:', {
          response: data,
          checkedFields: ['status', 'Status', 'STATUS']
        });
        // Don't fail - return the response anyway, let the client handle it
      } else {
        console.log('JB SMM Panel Order Status extracted:', status);
      }

      const duration = Date.now() - startTime;
      console.log(`JB SMM Panel status check completed in ${duration}ms`);

      return res.status(200).json(data);
    } catch (fetchError) {
      if (timeoutId) clearTimeout(timeoutId);

      if (fetchError.name === 'AbortError') {
        console.error('JB SMM Panel status request timeout after', REQUEST_TIMEOUT, 'ms');
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
    if (timeoutId) clearTimeout(timeoutId);
    const duration = Date.now() - startTime;
    console.error('JB SMM Panel status error:', {
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
      error: error.message || 'Failed to get order status',
      errorName: error.name,
      details: error.code || error.message
    });
  }
}
