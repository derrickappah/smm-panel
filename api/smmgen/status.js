// Vercel Serverless Function for SMMGen Order Status

const REQUEST_TIMEOUT = 20000; // 20 seconds

// Function to test if an endpoint is reachable
async function testEndpoint(url, timeout = 5000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    return { url, reachable: response.status !== 404, status: response.status };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { url, reachable: false, error: 'Timeout', timeout: true };
    }
    return { url, reachable: false, error: error.message };
  }
}

// Function to find working endpoint
async function findWorkingEndpoint(endpoints) {
  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint);
    console.log('Endpoint test result:', result);
    if (result.reachable) {
      return endpoint;
    }
  }
  return null;
}

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
  let timeoutId;
  let controller;
  let workingEndpoint;

  try {
    try {
      // Parse JSON body if needed (Vercel sometimes doesn't auto-parse)
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (parseError) {
          console.error('Failed to parse JSON body:', parseError);
          return res.status(400).json({
            error: 'Invalid JSON in request body',
            parseError: parseError.message
          });
        }
      }

      // Log the parsed request for debugging
      console.log('SMMGen Status Request Debug:', {
        method: req.method,
        contentType: req.headers['content-type'],
        body,
        bodyType: typeof body,
        hasOrder: body && 'order' in body
      });

      const { order } = body;

      // Input validation with detailed error messages
      if (!order) {
        console.error('SMMGen Status: Missing order field', { body });
        return res.status(400).json({
          error: 'Missing required field: order (SMMGen order ID is required)',
          field: 'order',
          receivedBody: body
        });
      }

      if (typeof order !== 'string' || order.trim() === '') {
        console.error('SMMGen Status: Invalid order field', { order, orderType: typeof order });
        return res.status(400).json({
          error: 'Invalid order: must be a non-empty string',
          field: 'order',
          received: typeof order,
          receivedValue: order
        });
      }

      const SMMGEN_API_URL = process.env.SMMGEN_API_URL || 'https://smmgen.com/api/v2';
      const SMMGEN_API_KEY = process.env.SMMGEN_API_KEY;

      // Alternative endpoints to try if primary fails
      const FALLBACK_ENDPOINTS = [
        'https://smmgen.com/api/v2',
        'https://api.smmgen.com/v2',
        'https://smmgen.com/api'
      ];

      // Test primary endpoint first
      const primaryEndpointTest = await testEndpoint(SMMGEN_API_URL);
      workingEndpoint = SMMGEN_API_URL;

      if (!primaryEndpointTest.reachable) {
        console.warn('Primary SMMGen endpoint not reachable, trying fallbacks...');
        const fallbackEndpoint = await findWorkingEndpoint(FALLBACK_ENDPOINTS.filter(ep => ep !== SMMGEN_API_URL));

        if (fallbackEndpoint) {
          console.log('Found working fallback endpoint:', fallbackEndpoint);
          workingEndpoint = fallbackEndpoint;
        } else {
          console.error('No working SMMGen endpoints found');
          return res.status(503).json({
            error: 'SMMGen API is not reachable',
            details: 'All configured endpoints are returning 404 or unreachable',
            suggestion: 'Contact SMMGen support or check if the service is still available',
            endpointTests: await Promise.all(FALLBACK_ENDPOINTS.map(ep => testEndpoint(ep)))
          });
        }
      }

      if (!SMMGEN_API_KEY) {
        console.error('SMMGen API key not configured');
        return res.status(500).json({
          error: 'SMMGen API key not configured. Set SMMGEN_API_KEY in Vercel environment variables.',
          configIssue: true
        });
      }

      // Validate API key format (should be a string)
      if (typeof SMMGEN_API_KEY !== 'string' || SMMGEN_API_KEY.trim().length === 0) {
        console.error('SMMGen API key is invalid:', typeof SMMGEN_API_KEY);
        return res.status(500).json({
          error: 'SMMGen API key is invalid. Check SMMGEN_API_KEY in Vercel environment variables.',
          configIssue: true
        });
      }

      // Log request details
      console.log('SMMGen Status Request:', {
        order: order.trim(),
        apiUrl: workingEndpoint,
        primaryEndpoint: SMMGEN_API_URL,
        endpointChanged: workingEndpoint !== SMMGEN_API_URL,
        timestamp: new Date().toISOString()
      });

      // Create abort controller for timeout
      controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      // Test basic connectivity first
      console.log('Testing SMMGen API connectivity...');
      try {
        const baseUrl = workingEndpoint.replace(/\/api.*$/, '');
        const testController = new AbortController();
        const testTimeoutId = setTimeout(() => testController.abort(), 5000);

        try {
          const testResponse = await fetch(baseUrl, {
            method: 'HEAD',
            signal: testController.signal
          });
          console.log('SMMGen domain connectivity test:', {
            url: baseUrl,
            status: testResponse.status,
            ok: testResponse.ok
          });
        } finally {
          clearTimeout(testTimeoutId);
        }
      } catch (connectError) {
        console.warn('SMMGen connectivity test failed:', connectError.message);
      }

      // Prepare order ID - try as number first, then string
      let orderId = order.trim();
      const numericOrder = parseInt(orderId, 10);
      if (!isNaN(numericOrder) && numericOrder.toString() === orderId) {
        orderId = numericOrder;
      }

      // Log the request being prepared for SMMGen
      console.log('Preparing request to SMMGen:', {
        url: workingEndpoint,
        order: orderId,
        orderType: typeof orderId,
        originalOrder: order.trim(),
        hasApiKey: !!SMMGEN_API_KEY,
        apiKeyLength: SMMGEN_API_KEY ? SMMGEN_API_KEY.length : 0
      });

      // Try form-encoded format first (many SMM APIs expect this)
      const formData = new URLSearchParams({
        key: SMMGEN_API_KEY,
        action: 'status',
        order: orderId.toString()
      });
      const formDataString = formData.toString();

      console.log('Attempting form-encoded request to SMMGen');

      let response;
      try {
        response = await fetch(workingEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'BoostUp-GH-Serverless/1.0'
          },
          body: formDataString,
          signal: controller.signal
        });
      } catch (formError) {
        console.warn('Form-encoded request failed, trying JSON format:', formError.message);
        // Fallback to JSON format with manual timeout
        const fallbackController = new AbortController();
        const fallbackTimeoutId = setTimeout(() => fallbackController.abort(), REQUEST_TIMEOUT - 1000);

        try {
          response = await fetch(workingEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'BoostUp-GH-Serverless/1.0'
            },
            body: JSON.stringify({
              key: SMMGEN_API_KEY,
              action: 'status',
              order: orderId
            }),
            signal: fallbackController.signal
          });
        } finally {
          clearTimeout(fallbackTimeoutId);
        }
      }

      clearTimeout(timeoutId);

      // Log response status
      console.log('SMMGen Status API Response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        url: response.url
      });

      // Check for endpoint not found
      if (response.status === 404) {
        console.error('SMMGen API endpoint not found (404). The API may have changed or been moved.');
        return res.status(503).json({
          error: 'SMMGen API endpoint not found',
          details: 'The configured API endpoint returned 404 Not Found',
          suggestion: 'Verify the correct SMMGen API endpoint URL',
          apiUrl: workingEndpoint,
          primaryUrl: SMMGEN_API_URL,
          endpointIssue: true
        });
      }

      if (!response.ok) {
        let errorData;
        let rawResponseText = '';
        try {
          rawResponseText = await response.text();
          try {
            errorData = JSON.parse(rawResponseText);
          } catch (jsonParseError) {
            errorData = { error: rawResponseText || `HTTP ${response.status}: ${response.statusText}` };
          }
        } catch (textParseError) {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
        }

        console.error('SMMGen Status API Error:', {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          errorData,
          rawResponse: rawResponseText,
          order: order.trim(),
          apiUrl: workingEndpoint
        });

        return res.status(response.status).json({
          error: errorData.error || errorData.message || `Failed to get order status: ${response.status}`,
          status: response.status,
          details: errorData,
          apiUrl: workingEndpoint
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

      // Enhanced error diagnostics
      console.error('SMMGen fetch error details:', {
        name: fetchError.name,
        message: fetchError.message,
        code: fetchError.code,
        cause: fetchError.cause,
        stack: fetchError.stack,
        apiUrl: SMMGEN_API_URL,
        isTypeError: fetchError instanceof TypeError
      });

      // Provide specific error messages based on error type
      if (fetchError.message === 'fetch failed' || fetchError instanceof TypeError) {
        return res.status(503).json({
          error: 'Network error: Unable to connect to SMMGen API',
          details: 'This may indicate the API endpoint is unreachable or has changed',
          suggestion: 'Check if the SMMGen API is still available at the configured endpoint',
          errorType: 'network_error',
          apiUrl: workingEndpoint,
          primaryUrl: SMMGEN_API_URL
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

