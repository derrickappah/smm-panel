// JB SMM Panel API Integration
// This service handles all interactions with JB SMM Panel API via backend proxy

// Backend proxy URL (to avoid CORS issues)
// Priority: 1. Vercel serverless functions (same domain), 2. Custom backend URL, 3. Localhost
const BACKEND_PROXY_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

// Check if we're in production (Vercel)
// In production, hostname will be something like 'smm-panel-ten.vercel.app'
const isProduction = process.env.NODE_ENV === 'production' ||
  (typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1' &&
    !window.location.hostname.includes('localhost'));

// Cache for serverless function availability check
let serverlessFunctionAvailable = null;
let availabilityCheckTime = 0;
const AVAILABILITY_CHECK_TTL = 60000; // Check every 60 seconds

/**
 * Check if serverless functions are available
 * @returns {Promise<boolean>} True if serverless functions are available
 */
const checkServerlessFunctionAvailability = async () => {
  const now = Date.now();

  // Return cached result if still valid
  if (serverlessFunctionAvailable !== null && (now - availabilityCheckTime) < AVAILABILITY_CHECK_TTL) {
    return serverlessFunctionAvailable;
  }

  // Only check in development
  if (isProduction) {
    serverlessFunctionAvailable = true;
    availabilityCheckTime = now;
    return true;
  }

  try {
    // Try a simple OPTIONS request to check if serverless function exists
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout

    const response = await fetch('/api/jbsmmpanel/order', {
      method: 'OPTIONS',
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    serverlessFunctionAvailable = true;
    availabilityCheckTime = now;
    return true;
  } catch (error) {
    // Serverless function not available
    serverlessFunctionAvailable = false;
    availabilityCheckTime = now;
    console.warn('Serverless functions not available, will try backend server if configured:', error.message);
    return false;
  }
};

// Get JB SMM Panel config from environment variables
const getJBSMMPanelConfig = async () => {
  let backendUrl;
  let useServerlessFunctions = false; // Forced to false to use backend server
  let isConfigured = true;

  // Always prefer the backend server
  const customBackendUrl = process.env.REACT_APP_BACKEND_URL;

  if (customBackendUrl) {
    backendUrl = customBackendUrl;
    useServerlessFunctions = false;
    // console.log('Using backend server:', customBackendUrl);
  } else {
    // Fallback to searching for serverless functions if no backend configured
    // This ensures it still works if the env var is missing, but warns the admin

    // Check if serverless functions are available
    const serverlessAvailable = await checkServerlessFunctionAvailability();

    if (serverlessAvailable) {
      backendUrl = '/api/jbsmmpanel';
      useServerlessFunctions = true;
    } else {
      isConfigured = false;
      console.warn('Neither backend server (REACT_APP_BACKEND_URL) nor serverless functions are available');
    }
  }

  return { backendUrl, isConfigured, useServerlessFunctions };
};

// Helper function to build the correct API endpoint URL
const buildApiUrl = async (endpoint) => {
  const { backendUrl, useServerlessFunctions } = await getJBSMMPanelConfig();

  // Remove any trailing slashes from backendUrl and leading slashes from endpoint
  let cleanBackendUrl = (backendUrl || '').replace(/\/+$/, '');
  const cleanEndpoint = (endpoint || '').replace(/^\/+/, '');

  if (useServerlessFunctions) {
    // Serverless functions: /api/jbsmmpanel/order, /api/jbsmmpanel/services, etc.
    // backendUrl should be '/api/jbsmmpanel', endpoint should be 'order'
    // Result: '/api/jbsmmpanel/order'

    // Safety check: if endpoint already contains /api/jbsmmpanel, don't duplicate it
    if (cleanEndpoint.includes('/api/jbsmmpanel')) {
      // Endpoint already has full path, use it as-is
      return cleanEndpoint.startsWith('/') ? cleanEndpoint : `/${cleanEndpoint}`;
    }

    const url = `${cleanBackendUrl}/${cleanEndpoint}`.replace(/\/+/g, '/');
    // Ensure it starts with / for relative URLs
    return url.startsWith('/') ? url : `/${url}`;
  } else {
    // Backend proxy: http://localhost:5000/api/jbsmmpanel/order
    // Ensure backendUrl is a full URL (starts with http:// or https://)
    // If it doesn't have a protocol, add http:// (for development)
    if (!cleanBackendUrl.startsWith('http://') && !cleanBackendUrl.startsWith('https://')) {
      // If it's just a hostname like 'localhost:5000', add http://
      if (cleanBackendUrl.includes(':') || cleanBackendUrl.includes('.')) {
        cleanBackendUrl = `http://${cleanBackendUrl}`;
      } else {
        // Fallback: assume it's a relative path
        console.warn('Backend URL format unclear, using relative path:', cleanBackendUrl);
        const url = `/api/jbsmmpanel/${cleanEndpoint}`.replace(/\/+/g, '/');
        return url;
      }
    }

    // Construct the full URL
    const url = `${cleanBackendUrl}/api/jbsmmpanel/${cleanEndpoint}`.replace(/\/+/g, '/');

    // Final validation: ensure it's a valid absolute URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      console.error('Invalid URL constructed:', url, 'from backendUrl:', backendUrl);
      throw new Error(`Invalid backend URL configuration: ${backendUrl}`);
    }

    return url;
  }
};

/**
 * Fetch all services from JB SMM Panel API
 * @returns {Promise<Array>} Array of services
 */
export const fetchJBSMMPanelServices = async () => {
  try {
    const { backendUrl, isConfigured } = await getJBSMMPanelConfig();

    if (!isConfigured) {
      console.warn('JB SMM Panel backend not configured. Skipping service fetch.');
      return [];
    }

    const apiUrl = await buildApiUrl('services');

    console.log('Fetching JB SMM Panel services from:', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (parseError) {
        errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const errorMessage = errorData.error || errorData.message || `Failed to fetch services: ${response.status}`;

      // Check if it's a configuration issue
      if (errorData.configIssue || errorMessage.includes('not configured')) {
        throw new Error('JB SMM Panel API is not configured. Please set JBSMMPANEL_API_KEY and JBSMMPANEL_API_URL in Vercel environment variables.');
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();

    // Check for error in response
    if (data.error) {
      console.warn('JB SMM Panel API returned error:', data.error);
      return [];
    }

    // Validate response structure
    if (!Array.isArray(data) && (!data.services || !Array.isArray(data.services))) {
      console.warn('JB SMM Panel API returned unexpected response format. Expected array or object with services array. Received:', {
        type: typeof data,
        isArray: Array.isArray(data),
        hasServices: data && typeof data === 'object' && 'services' in data,
        keys: data && typeof data === 'object' ? Object.keys(data) : null,
        sample: data
      });
      return [];
    }

    // Return services array (handle both direct array and wrapped in object)
    return Array.isArray(data) ? data : data.services || [];
  } catch (error) {
    console.error('JB SMM Panel services error:', error);
    throw error;
  }
};

/**
 * Extract order ID from JB SMM Panel API response
 * Matches the extraction logic used in API endpoints to ensure consistency
 * @param {Object} response - API response object
 * @returns {string|number|null} Extracted order ID or null if not found
 */
export const extractJBSMMPanelOrderId = (response) => {
  if (!response || typeof response !== 'object') {
    return null;
  }

  // Check for order ID in various formats (matches API endpoint logic)
  const orderId = response.order ||
    response.order_id ||
    response.orderId ||
    response.id ||
    response.Order ||
    response.OrderID ||
    response.OrderId ||
    (response.data && (response.data.order || response.data.order_id || response.data.id)) ||
    null;

  // Validate order ID - must be truthy and not empty string
  // For JB SMM Panel, order IDs are typically numeric and must be > 0
  if (orderId !== null && orderId !== undefined && orderId !== '') {
    // Convert to string for consistency
    const orderIdString = String(orderId);
    // Validate: must parse to a positive integer
    const num = parseInt(orderIdString, 10);
    if (!isNaN(num) && num > 0) {
      // Log extraction for debugging
      console.log('JB SMM Panel Order ID extracted:', {
        orderId: orderIdString,
        orderIdType: typeof orderId,
        extractedFrom: Object.keys(response).find(key => {
          const val = response[key];
          return val === orderId || (response.data && response.data[key] === orderId);
        }) || 'nested'
      });
      return orderIdString;
    } else {
      // Invalid order ID (zero, negative, or non-numeric)
      console.warn('JB SMM Panel order ID validation failed - invalid value:', {
        orderId,
        orderIdString,
        parsedNumber: num
      });
    }
  }

  // Log failure with full response for debugging
  console.warn('JB SMM Panel response does not contain order ID in expected format:', {
    response,
    checkedFields: ['order', 'order_id', 'orderId', 'id', 'Order', 'OrderID', 'OrderId', 'data.order', 'data.order_id', 'data.id']
  });

  return null;
};

/**
 * Place order to JB SMM Panel API with retry logic and comprehensive error handling
 * @param {number|string} serviceId - JB SMM Panel service ID (numeric)
 * @param {string} link - Target URL
 * @param {number} quantity - Quantity to order
 * @param {number} retryCount - Internal parameter for retry attempts (default: 0)
 * @returns {Promise<Object>} Order response from JB SMM Panel
 */
export const placeJBSMMPanelOrder = async (serviceId, link, quantity, retryCount = 0) => {
  const MAX_RETRIES = 3;
  const INITIAL_RETRY_DELAY = 1000; // 1 second
  const REQUEST_TIMEOUT = 30000; // 30 seconds

  // Input validation
  const serviceIdNum = typeof serviceId === 'string' ? parseInt(serviceId, 10) : serviceId;
  if (!serviceIdNum || isNaN(serviceIdNum) || serviceIdNum <= 0) {
    const error = new Error('Invalid service ID: serviceId is required and must be a positive integer');
    console.error('JB SMM Panel Order Validation Error:', error);
    throw error;
  }

  if (!link || typeof link !== 'string' || link.trim() === '') {
    const error = new Error('Invalid link: link is required and must be a non-empty string');
    console.error('JB SMM Panel Order Validation Error:', error);
    throw error;
  }

  if (!quantity || typeof quantity !== 'number' || quantity <= 0 || !Number.isInteger(quantity)) {
    const error = new Error(`Invalid quantity: quantity must be a positive integer, got ${quantity}`);
    console.error('JB SMM Panel Order Validation Error:', error);
    throw error;
  }

  try {
    const { backendUrl, isConfigured, useServerlessFunctions } = await getJBSMMPanelConfig();

    // Log configuration for debugging
    console.log('JB SMM Panel Configuration:', {
      backendUrl,
      isConfigured,
      useServerlessFunctions,
      isProduction,
      hasBackendUrl: !!process.env.REACT_APP_BACKEND_URL
    });

    // If backend is not configured, skip JB SMM Panel integration
    if (!isConfigured) {
      console.warn('JB SMM Panel backend not configured. Skipping JB SMM Panel order placement.');
      return null; // Return null to indicate JB SMM Panel was skipped
    }

    const apiUrl = await buildApiUrl('order');

    // Comprehensive logging
    console.log('JB SMM Panel Order Request:', {
      attempt: retryCount + 1,
      maxRetries: MAX_RETRIES,
      serviceId: serviceIdNum,
      link: link.trim(),
      quantity: quantity,
      backendUrl,
      apiUrl,
      isConfigured,
      timestamp: new Date().toISOString()
    });

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          service: serviceIdNum,
          link: link.trim(),
          quantity: quantity
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Log response status
      console.log('JB SMM Panel API Response Status:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        url: apiUrl
      });

      if (!response.ok) {
        // Handle 404 specifically - likely means serverless functions aren't running
        if (response.status === 404) {
          const errorMessage = `API endpoint not found (404). Make sure you're running 'vercel dev' to start serverless functions, or the endpoint is deployed correctly.`;
          const fullError = new Error(errorMessage);
          fullError.status = response.status;
          fullError.isConfigurationError = true;
          console.error('JB SMM Panel API 404 Error - Serverless functions may not be running:', {
            status: response.status,
            url: apiUrl,
            hint: 'Run "vercel dev" in the project root to start serverless functions locally'
          });
          throw fullError;
        }

        // Read response text first to get full error details
        let responseText;
        try {
          responseText = await response.text();
        } catch (textError) {
          responseText = `Failed to read response: ${textError.message}`;
        }

        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch (parseError) {
          // If not JSON, use the raw text
          errorData = {
            error: `HTTP ${response.status}: ${response.statusText}`,
            rawResponse: responseText.substring(0, 500)
          };
        }

        const errorMessage = errorData.error || errorData.message || `Order failed: ${response.status}`;
        const fullError = new Error(errorMessage);
        fullError.status = response.status;
        fullError.responseData = errorData;
        fullError.rawResponse = responseText;

        console.error('JB SMM Panel API Error Response:', {
          status: response.status,
          statusText: response.statusText,
          errorMessage,
          errorData,
          rawResponse: responseText.substring(0, 500),
          serviceId: serviceIdNum,
          link,
          quantity,
          url: apiUrl
        });

        // Check for duplicate order errors - don't retry these
        const errorMessageLower = errorMessage.toLowerCase();
        if (errorMessageLower.includes('duplicate') ||
          errorMessageLower.includes('already exists') ||
          errorMessageLower.includes('already placed')) {
          console.warn('JB SMM Panel returned duplicate order error - not retrying:', errorMessage);
          throw fullError;
        }

        // For 4xx errors (client errors), don't retry - these are permanent failures
        // This includes 400 Bad Request which indicates the API rejected the request
        if (response.status >= 400 && response.status < 500) {
          console.error('JB SMM Panel client error (4xx) - not retrying:', {
            status: response.status,
            error: errorMessage,
            details: errorData
          });
          throw fullError;
        }

        // For 5xx errors (server errors), retry if we haven't exceeded max retries
        if (response.status >= 500 && retryCount < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
          console.warn(`JB SMM Panel server error (${response.status}), retrying in ${delay}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return placeJBSMMPanelOrder(serviceId, link, quantity, retryCount + 1);
        }

        throw fullError;
      }

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('JB SMM Panel Response Parse Error:', parseError);
        throw new Error('Invalid JSON response from JB SMM Panel API');
      }

      // Log full response for debugging
      console.log('JB SMM Panel API Full Response:', JSON.stringify(data, null, 2));

      // Extract order ID using standardized utility function
      const orderId = extractJBSMMPanelOrderId(data);

      // Check for error in response even if status was 200
      // Only check actual error fields, not keywords in message strings
      if (data.error) {
        const errorMessage = data.error || 'Unknown error from JB SMM Panel';
        console.error('JB SMM Panel returned error in response body:', {
          error: errorMessage,
          response: data,
          serviceId: serviceIdNum,
          link,
          quantity
        });

        // If we have an order ID despite the error, log it but still return the error
        if (orderId) {
          console.warn('JB SMM Panel returned error but also provided order ID. This may indicate a partial success:', orderId);
        }

        // Don't retry on client errors (4xx-like errors in response body)
        if (errorMessage.toLowerCase().includes('duplicate') ||
          errorMessage.toLowerCase().includes('already exists') ||
          errorMessage.toLowerCase().includes('invalid')) {
          throw new Error(errorMessage);
        }
      }

      if (orderId) {
        // Log successful order placement
        console.log('JB SMM Panel order successfully placed:', {
          orderId,
          serviceId: serviceIdNum,
          link: link.trim(),
          quantity,
          timestamp: new Date().toISOString()
        });
      }

      // Validate response is an object
      if (typeof data !== 'object' || data === null) {
        throw new Error('JB SMM Panel API returned invalid response format');
      }

      return data;
    } catch (fetchError) {
      clearTimeout(timeoutId);

      // Handle timeout
      if (fetchError.name === 'AbortError') {
        const timeoutError = new Error(`Request timeout after ${REQUEST_TIMEOUT}ms`);
        timeoutError.isTimeout = true;

        // Retry timeout errors if we haven't exceeded max retries
        if (retryCount < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
          console.warn(`JB SMM Panel request timeout, retrying in ${delay}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return placeJBSMMPanelOrder(serviceId, link, quantity, retryCount + 1);
        }

        throw timeoutError;
      }

      throw fetchError;
    }
  } catch (error) {
    // Check if this is a network/connection error that should be retried
    const isNetworkError = error.name === 'TypeError' &&
      (error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError') ||
        error.message.includes('ERR_CONNECTION_REFUSED') ||
        error.message.includes('ERR_NETWORK') ||
        error.message.includes('ERR_INTERNET_DISCONNECTED'));

    const isCorsError = error.message.includes('CORS');

    // Retry network errors if we haven't exceeded max retries
    if ((isNetworkError || isCorsError) && retryCount < MAX_RETRIES) {
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
      console.warn(`JB SMM Panel network error (${error.message}), retrying in ${delay}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return placeJBSMMPanelOrder(serviceId, link, quantity, retryCount + 1);
    }

    // Log error details
    console.error('JB SMM Panel Order Error:', {
      error: error.message,
      errorName: error.name,
      status: error.status,
      responseData: error.responseData,
      isNetworkError,
      isCorsError,
      retryCount,
      serviceId,
      link,
      quantity,
      stack: error.stack
    });

    // For network errors after all retries, return null to allow graceful degradation
    if (isNetworkError || isCorsError) {
      if (!isProduction) {
        console.debug('JB SMM Panel backend unavailable after retries. Continuing with local order only.');
      }
      return null; // Return null to allow graceful degradation
    }

    // For all other errors (API errors, validation errors, etc.), throw them
    // These should be handled by the caller to show appropriate error messages
    throw error;
  }
};

/**
 * Get order status from JB SMM Panel API with retry logic and comprehensive error handling
 * @param {number|string} orderId - JB SMM Panel order ID (numeric)
 * @param {number} retryCount - Internal parameter for retry attempts (default: 0)
 * @returns {Promise<Object>} Order status
 */
export const getJBSMMPanelOrderStatus = async (orderId, retryCount = 0) => {
  const MAX_RETRIES = 3;
  const INITIAL_RETRY_DELAY = 1000; // 1 second
  const REQUEST_TIMEOUT = 20000; // 20 seconds (shorter than order placement)

  // Skip status check for failure messages (must happen before numeric parsing)
  if (typeof orderId === 'string' && orderId.toLowerCase().includes('not placed')) {
    console.warn('Skipping JB SMM Panel status check for failed order:', orderId);
    return null;
  }

  // Input validation
  const orderIdNum = typeof orderId === 'string' ? parseInt(orderId, 10) : orderId;
  if (!orderIdNum || isNaN(orderIdNum) || orderIdNum <= 0) {
    const error = new Error('Invalid order ID: orderId is required and must be a positive integer');
    console.error('JB SMM Panel Status Validation Error:', error);
    throw error;
  }

  try {
    const { backendUrl, isConfigured, useServerlessFunctions } = await getJBSMMPanelConfig();

    if (!isConfigured) {
      console.warn('JB SMM Panel backend not configured. Skipping status check.');
      return null;
    }

    const apiUrl = await buildApiUrl('status');

    console.log('[jbsmmpanel] Status Request:', {
      attempt: retryCount + 1,
      maxRetries: MAX_RETRIES,
      orderId: orderIdNum,
      apiUrl,
      backendUrl,
      useServerlessFunctions,
      isConfigured,
      timestamp: new Date().toISOString()
    });

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          order: orderIdNum
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (parseError) {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
        }

        const errorMessage = errorData.error || errorData.message || `Status check failed: ${response.status}`;

        // Log detailed error information
        console.error('[jbsmmpanel] Status API error:', {
          orderId: orderIdNum,
          apiUrl,
          status: response.status,
          statusText: response.statusText,
          errorData,
          errorMessage,
          retryCount,
          maxRetries: MAX_RETRIES
        });

        // Retry on server errors
        if (response.status >= 500 && retryCount < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
          console.warn(`JB SMM Panel status server error (${response.status}), retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return getJBSMMPanelOrderStatus(orderId, retryCount + 1);
        }

        // For 404 errors, provide more context
        if (response.status === 404) {
          throw new Error(`API endpoint not found (404): ${apiUrl}. Please verify the serverless function is deployed.`);
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('JB SMM Panel Status Response:', data);
      return data;
    } catch (fetchError) {
      clearTimeout(timeoutId);

      // Log fetch errors with more detail
      console.error('[jbsmmpanel] Status fetch error:', {
        orderId: orderIdNum,
        apiUrl,
        errorName: fetchError.name,
        errorMessage: fetchError.message,
        errorStack: fetchError.stack,
        retryCount,
        maxRetries: MAX_RETRIES
      });

      if (fetchError.name === 'AbortError') {
        if (retryCount < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
          console.warn(`JB SMM Panel status timeout, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return getJBSMMPanelOrderStatus(orderId, retryCount + 1);
        }
        throw new Error(`Request timeout after ${REQUEST_TIMEOUT}ms`);
      }

      throw fetchError;
    }
  } catch (error) {
    console.error('JB SMM Panel Status Error:', {
      error: error.message,
      orderId,
      retryCount,
      stack: error.stack
    });

    // Don't throw for network errors - just return null
    const isNetworkError = error.name === 'TypeError' &&
      (error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError'));

    if (isNetworkError && retryCount < MAX_RETRIES) {
      const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
      console.warn(`JB SMM Panel status network error, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return getJBSMMPanelOrderStatus(orderId, retryCount + 1);
    }

    if (isNetworkError) {
      return null; // Return null for network errors after retries
    }

    throw error;
  }
};

/**
 * Get account balance from JB SMM Panel API
 * @returns {Promise<Object>} Balance information
 */
export const getJBSMMPanelBalance = async () => {
  try {
    const { backendUrl, isConfigured } = await getJBSMMPanelConfig();

    if (!isConfigured) {
      console.warn('JB SMM Panel backend not configured. Skipping balance fetch.');
      return null;
    }

    const apiUrl = await buildApiUrl('balance');

    console.log('Fetching JB SMM Panel balance from:', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (parseError) {
        errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
      }

      const errorMessage = errorData.error || errorData.message || `Failed to fetch balance: ${response.status}`;

      // Check if it's a configuration issue
      if (errorData.configIssue || errorMessage.includes('not configured')) {
        throw new Error('JB SMM Panel API is not configured. Please set JBSMMPANEL_API_KEY and JBSMMPANEL_API_URL in Vercel environment variables.');
      }

      // Check if it's a network error
      if (errorData.networkError || errorMessage.includes('Failed to connect') || errorMessage.includes('Network error')) {
        throw new Error(`Network error: ${errorMessage}. Please verify JBSMMPANEL_API_URL is correct in Vercel environment variables.`);
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('JB SMM Panel Balance Response:', data);
    return data;
  } catch (error) {
    console.error('JB SMM Panel balance error:', error);

    // Handle network errors
    if (error.message?.includes('fetch failed') || error.message?.includes('Network error')) {
      throw new Error(`Network error: Failed to connect to JB SMM Panel API. Please verify JBSMMPANEL_API_URL is correct in Vercel environment variables.`);
    }

    throw error;
  }
};

export default {
  fetchJBSMMPanelServices,
  placeJBSMMPanelOrder,
  getJBSMMPanelOrderStatus,
  getJBSMMPanelBalance
};
