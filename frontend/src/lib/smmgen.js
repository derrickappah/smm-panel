// SMMGen API Integration
// This service handles all interactions with SMMGen API via backend proxy

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

    const response = await fetch('/api/smmgen/order', {
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

// Get SMMGen config from environment variables
const getSMMGenConfig = async () => {
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
    // Fallback to searching for serverless functions if no backend configured (legacy behavior)
    // But for this requirement we want to prefer backend. 
    // If no backend URL, we might fail or default to serverless if available.
    // However, the prompt implies "make normal users use the server". 
    // So we should warn if REACT_APP_BACKEND_URL is missing.

    // Check if serverless functions are available as a fallback
    const serverlessAvailable = await checkServerlessFunctionAvailability();

    if (serverlessAvailable) {
      backendUrl = '/api/smmgen';
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
  const { backendUrl, useServerlessFunctions } = await getSMMGenConfig();

  // Remove any trailing slashes from backendUrl and leading slashes from endpoint
  let cleanBackendUrl = (backendUrl || '').replace(/\/+$/, '');
  const cleanEndpoint = (endpoint || '').replace(/^\/+/, '');

  if (useServerlessFunctions) {
    // Serverless functions: /api/smmgen/order, /api/smmgen/services, etc.
    // backendUrl should be '/api/smmgen', endpoint should be 'order'
    // Result: '/api/smmgen/order'

    // Safety check: if endpoint already contains /api/smmgen, don't duplicate it
    if (cleanEndpoint.includes('/api/smmgen')) {
      // Endpoint already has full path, use it as-is
      return cleanEndpoint.startsWith('/') ? cleanEndpoint : `/${cleanEndpoint}`;
    }

    const url = `${cleanBackendUrl}/${cleanEndpoint}`.replace(/\/+/g, '/');
    // Ensure it starts with / for relative URLs
    return url.startsWith('/') ? url : `/${url}`;
  } else {
    // Backend proxy: http://localhost:5000/api/smmgen/order
    // Ensure backendUrl is a full URL (starts with http:// or https://)
    // If it doesn't have a protocol, add http:// (for development)
    if (!cleanBackendUrl.startsWith('http://') && !cleanBackendUrl.startsWith('https://')) {
      // If it's just a hostname like 'localhost:5000', add http://
      if (cleanBackendUrl.includes(':') || cleanBackendUrl.includes('.')) {
        cleanBackendUrl = `http://${cleanBackendUrl}`;
      } else {
        // Fallback: assume it's a relative path
        console.warn('Backend URL format unclear, using relative path:', cleanBackendUrl);
        const url = `/api/smmgen/${cleanEndpoint}`.replace(/\/+/g, '/');
        return url;
      }
    }

    // Construct the full URL
    const url = `${cleanBackendUrl}/api/smmgen/${cleanEndpoint}`.replace(/\/+/g, '/');

    // Final validation: ensure it's a valid absolute URL
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      console.error('Invalid URL constructed:', url, 'from backendUrl:', backendUrl);
      throw new Error(`Invalid backend URL configuration: ${backendUrl}`);
    }

    return url;
  }
};

/**
 * Fetch all services from SMMGen API
 * @returns {Promise<Array>} Array of services
 */
export const fetchSMMGenServices = async () => {
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      const errorMsg = errorData.error || errorData.message || `API error: ${response.status}`;
      // If backend is not running, provide helpful message
      if (response.status === 0 || errorMsg.includes('Failed to fetch')) {
        throw new Error('Backend proxy server not running. Please start the backend server (cd backend && npm start)');
      }
      throw new Error(errorMsg);
    }

    const data = await response.json();

    // Transform SMMGen service format to our format
    // SMMGen typically returns: { service: id, name, type, category, rate, min, max, ... }
    if (Array.isArray(data)) {
      return data.map(service => ({
        id: service.service || service.id,
        smmgen_service_id: service.service || service.id, // Keep original SMMGen ID
        platform: mapCategoryToPlatform(service.category || service.type || ''),
        service_type: service.type || service.name || '',
        name: service.name || `${service.category} ${service.type}`,
        rate: parseFloat(service.rate || 0),
        min_quantity: parseInt(service.min || 0),
        max_quantity: parseInt(service.max || 0),
        description: service.description || `${service.name} - High quality service`,
        category: service.category || '',
        // Store original SMMGen data for reference
        smmgen_data: service
      }));
    }

    // If SMMGen returns object with services array
    if (data.services && Array.isArray(data.services)) {
      return data.services.map(service => ({
        id: service.service || service.id,
        smmgen_service_id: service.service || service.id,
        platform: mapCategoryToPlatform(service.category || service.type || ''),
        service_type: service.type || service.name || '',
        name: service.name || `${service.category} ${service.type}`,
        rate: parseFloat(service.rate || 0),
        min_quantity: parseInt(service.min || 0),
        max_quantity: parseInt(service.max || 0),
        description: service.description || `${service.name} - High quality service`,
        category: service.category || '',
        smmgen_data: service
      }));
    }

    return [];
  } catch (error) {
    console.error('SMMGen API Error:', error);
    throw error;
  }
};

/**
 * Check if an error message indicates a duplicate/active order error
 * @param {string} errorMessage - Error message to check
 * @returns {boolean} True if error is a duplicate/active order error
 */
export const isDuplicateOrderError = (errorMessage) => {
  if (!errorMessage || typeof errorMessage !== 'string') {
    return false;
  }

  const errorMessageLower = errorMessage.toLowerCase();
  return errorMessageLower.includes('duplicate') ||
    errorMessageLower.includes('already exists') ||
    errorMessageLower.includes('already placed') ||
    errorMessageLower.includes('active order') ||
    errorMessageLower.includes('wait until');
};

/**
 * Get user-friendly error message for duplicate/active order errors
 * @param {string} errorMessage - Original error message from SMMGen
 * @returns {string} User-friendly error message
 */
export const getDuplicateOrderErrorMessage = (errorMessage) => {
  if (!errorMessage || typeof errorMessage !== 'string') {
    return 'An order with this link already exists. Please check your order history.';
  }

  const errorMessageLower = errorMessage.toLowerCase();

  if (errorMessageLower.includes('active order') || errorMessageLower.includes('wait until')) {
    return 'You already have an active order with this link. Please wait until it completes.';
  }

  if (errorMessageLower.includes('duplicate') || errorMessageLower.includes('already exists')) {
    return 'An order with this link already exists. Please check your order history.';
  }

  // Return original message if we can't map it
  return errorMessage;
};

/**
 * Extract order ID from SMMGen API response
 * Matches the extraction logic used in API endpoints to ensure consistency
 * @param {Object} response - API response object
 * @returns {string|number|null} Extracted order ID or null if not found
 */
export const extractSMMGenOrderId = (response) => {
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
  if (orderId !== null && orderId !== undefined && orderId !== '') {
    // Log extraction for debugging
    console.log('SMMGen Order ID extracted:', {
      orderId,
      orderIdType: typeof orderId,
      extractedFrom: Object.keys(response).find(key => {
        const val = response[key];
        return val === orderId || (response.data && response.data[key] === orderId);
      }) || 'nested'
    });
    return orderId;
  }

  // Log failure with full response for debugging
  console.warn('SMMGen response does not contain order ID in expected format:', {
    response,
    checkedFields: ['order', 'order_id', 'orderId', 'id', 'Order', 'OrderID', 'OrderId', 'data.order', 'data.order_id', 'data.id']
  });

  return null;
};

/**
 * Place an order via SMMGen API with retry logic and comprehensive error handling
 * @param {string} serviceId - SMMGen service ID
 * @param {string} link - Target URL/link
 * @param {number} quantity - Quantity to order
 * @param {number} retryCount - Internal parameter for retry attempts (default: 0)
 * @returns {Promise<Object>} Order response from SMMGen
 */
export const placeSMMGenOrder = async (serviceId, link, quantity, retryCount = 0) => {
  const MAX_RETRIES = 3;
  const INITIAL_RETRY_DELAY = 1000; // 1 second
  const REQUEST_TIMEOUT = 30000; // 30 seconds

  // Input validation
  if (!serviceId || typeof serviceId !== 'string' || serviceId.trim() === '') {
    const error = new Error('Invalid service ID: serviceId is required and must be a non-empty string');
    console.error('SMMGen Order Validation Error:', error);
    throw error;
  }

  if (!link || typeof link !== 'string' || link.trim() === '') {
    const error = new Error('Invalid link: link is required and must be a non-empty string');
    console.error('SMMGen Order Validation Error:', error);
    throw error;
  }

  if (!quantity || typeof quantity !== 'number' || quantity <= 0 || !Number.isInteger(quantity)) {
    const error = new Error(`Invalid quantity: quantity must be a positive integer, got ${quantity}`);
    console.error('SMMGen Order Validation Error:', error);
    throw error;
  }

  try {
    const { backendUrl, isConfigured, useServerlessFunctions } = await getSMMGenConfig();

    // Log configuration for debugging
    console.log('SMMGen Configuration:', {
      backendUrl,
      isConfigured,
      useServerlessFunctions,
      isProduction,
      hasBackendUrl: !!process.env.REACT_APP_BACKEND_URL
    });

    // If backend is not configured, skip SMMGen integration
    if (!isConfigured) {
      console.warn('SMMGen backend not configured. Skipping SMMGen order placement.');
      return null; // Return null to indicate SMMGen was skipped
    }

    const apiUrl = await buildApiUrl('order');

    // Comprehensive logging
    console.log('SMMGen Order Request:', {
      attempt: retryCount + 1,
      maxRetries: MAX_RETRIES,
      serviceId: serviceId.trim(),
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
        body: JSON.stringify({
          service: serviceId.trim(),
          link: link.trim(),
          quantity: quantity
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Log response status
      console.log('SMMGen API Response Status:', {
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
          console.error('SMMGen API 404 Error - Serverless functions may not be running:', {
            status: response.status,
            url: apiUrl,
            hint: 'Run "vercel dev" in the project root to start serverless functions locally'
          });
          throw fullError;
        }

        let errorData;
        try {
          errorData = await response.json();
        } catch (parseError) {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
        }

        const errorMessage = errorData.error || errorData.message || `Order failed: ${response.status}`;
        const fullError = new Error(errorMessage);
        fullError.status = response.status;
        fullError.responseData = errorData;

        console.error('SMMGen API Error Response:', {
          status: response.status,
          errorMessage,
          errorData,
          serviceId,
          link,
          quantity
        });

        // Check for duplicate order errors - don't retry these
        const errorMessageLower = errorMessage.toLowerCase();
        if (errorMessageLower.includes('duplicate') ||
          errorMessageLower.includes('already exists') ||
          errorMessageLower.includes('already placed')) {
          console.warn('SMMGen returned duplicate order error - not retrying:', errorMessage);
          throw fullError;
        }

        // For 4xx errors (client errors), don't retry - these are permanent failures
        if (response.status >= 400 && response.status < 500) {
          throw fullError;
        }

        // For 5xx errors (server errors), retry if we haven't exceeded max retries
        if (response.status >= 500 && retryCount < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
          console.warn(`SMMGen server error (${response.status}), retrying in ${delay}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
          console.log('Retry attempt details:', {
            serviceId: serviceId.trim(),
            link: link.trim(),
            quantity,
            retryCount: retryCount + 1,
            maxRetries: MAX_RETRIES
          });
          await new Promise(resolve => setTimeout(resolve, delay));
          return placeSMMGenOrder(serviceId, link, quantity, retryCount + 1);
        }

        throw fullError;
      }

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('SMMGen Response Parse Error:', parseError);
        throw new Error('Invalid JSON response from SMMGen API');
      }

      // Log full response for debugging
      console.log('SMMGen API Full Response:', JSON.stringify(data, null, 2));

      // Extract order ID using standardized utility function
      const orderId = extractSMMGenOrderId(data);

      // Check for error in response even if status was 200
      // Only check actual error fields, not keywords in message strings
      if (data.error) {
        const errorMessage = data.error || 'Unknown error from SMMGen';
        console.error('SMMGen returned error in response body:', {
          error: errorMessage,
          response: data,
          serviceId,
          link,
          quantity
        });

        // If we have an order ID despite the error, log it but still return the error
        if (orderId) {
          console.warn('SMMGen returned error but also provided order ID. This may indicate a partial success:', orderId);
        }

        // Don't retry on client errors (4xx-like errors in response body)
        // Check for duplicate/active order errors
        const errorMessageLower = errorMessage.toLowerCase();
        if (errorMessageLower.includes('duplicate') ||
          errorMessageLower.includes('already exists') ||
          errorMessageLower.includes('already placed') ||
          errorMessageLower.includes('active order') ||
          errorMessageLower.includes('wait until') ||
          errorMessageLower.includes('invalid')) {
          throw new Error(errorMessage);
        }
      }

      if (orderId) {
        // Log successful order placement to help track duplicates
        console.log('SMMGen order successfully placed:', {
          orderId,
          serviceId: serviceId.trim(),
          link: link.trim(),
          quantity,
          timestamp: new Date().toISOString()
        });
      }

      // Validate response is an object
      if (typeof data !== 'object' || data === null) {
        throw new Error('SMMGen API returned invalid response format');
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
          console.warn(`SMMGen request timeout, retrying in ${delay}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return placeSMMGenOrder(serviceId, link, quantity, retryCount + 1);
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
      console.warn(`SMMGen network error (${error.message}), retrying in ${delay}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return placeSMMGenOrder(serviceId, link, quantity, retryCount + 1);
    }

    // Log error details
    console.error('SMMGen Order Error:', {
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
        console.debug('SMMGen backend unavailable after retries. Continuing with local order only.');
      }
      return null; // Return null to allow graceful degradation
    }

    // For all other errors (API errors, validation errors, etc.), throw them
    // These should be handled by the caller to show appropriate error messages
    throw error;
  }
};

/**
 * Get order status from SMMGen API with retry logic and comprehensive error handling
 * @param {string} orderId - SMMGen order ID
 * @param {number} retryCount - Internal parameter for retry attempts (default: 0)
 * @returns {Promise<Object>} Order status
 */
export const getSMMGenOrderStatus = async (orderId, retryCount = 0) => {
  const MAX_RETRIES = 3;
  const INITIAL_RETRY_DELAY = 1000; // 1 second
  const REQUEST_TIMEOUT = 20000; // 20 seconds (shorter than order placement)

  // Input validation
  if (!orderId || typeof orderId !== 'string' || orderId.trim() === '') {
    const error = new Error('Invalid order ID: orderId is required and must be a non-empty string');
    console.error('SMMGen Status Validation Error:', error);
    throw error;
  }

  // Skip status check for failure messages
  if (orderId === "order not placed at smm gen") {
    console.warn('Skipping status check for order with failure message');
    throw new Error('Cannot check status for order that was not placed at SMMGen');
  }

  try {
    const { backendUrl, isConfigured } = await getSMMGenConfig();

    if (!isConfigured) {
      console.warn('SMMGen backend not configured. Cannot check order status.');
      throw new Error('SMMGen backend not configured');
    }

    const apiUrl = await buildApiUrl('status');

    // Comprehensive logging
    console.log('SMMGen Status Request:', {
      attempt: retryCount + 1,
      maxRetries: MAX_RETRIES,
      orderId: orderId.trim(),
      backendUrl,
      apiUrl,
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
        body: JSON.stringify({
          order: orderId.trim()
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Log response status
      console.log('SMMGen Status API Response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        url: apiUrl
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (parseError) {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
        }

        const errorMessage = errorData.error || errorData.message || `Status check failed: ${response.status}`;
        const fullError = new Error(errorMessage);
        fullError.status = response.status;
        fullError.responseData = errorData;

        console.error('SMMGen Status API Error Response:', {
          status: response.status,
          errorMessage,
          errorData,
          orderId
        });

        // For 4xx errors (client errors), don't retry - these are permanent failures
        if (response.status >= 400 && response.status < 500) {
          throw fullError;
        }

        // For 5xx errors (server errors), retry if we haven't exceeded max retries
        if (response.status >= 500 && retryCount < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
          console.warn(`SMMGen status server error (${response.status}), retrying in ${delay}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return getSMMGenOrderStatus(orderId, retryCount + 1);
        }

        throw fullError;
      }

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        console.error('SMMGen Status Response Parse Error:', parseError);
        throw new Error('Invalid JSON response from SMMGen status API');
      }

      // Log full response for debugging
      console.log('SMMGen Status API Full Response:', JSON.stringify(data, null, 2));

      // Validate response structure
      if (typeof data !== 'object' || data === null) {
        throw new Error('SMMGen status API returned invalid response format');
      }

      // Check for status field in various formats
      const status = data.status || data.Status || data.STATUS || null;
      if (!status) {
        console.warn('SMMGen status response does not contain status field:', {
          response: data,
          checkedFields: ['status', 'Status', 'STATUS']
        });
        // Don't throw - return the response anyway, let the caller handle it
      } else {
        console.log('SMMGen Order Status extracted:', status);
      }

      return data;
    } catch (fetchError) {
      clearTimeout(timeoutId);

      // Handle timeout
      if (fetchError.name === 'AbortError') {
        const timeoutError = new Error(`Status check timeout after ${REQUEST_TIMEOUT}ms`);
        timeoutError.isTimeout = true;

        // Retry timeout errors if we haven't exceeded max retries
        if (retryCount < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
          console.warn(`SMMGen status request timeout, retrying in ${delay}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return getSMMGenOrderStatus(orderId, retryCount + 1);
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
      console.warn(`SMMGen status network error (${error.message}), retrying in ${delay}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return getSMMGenOrderStatus(orderId, retryCount + 1);
    }

    // Log error details
    console.error('SMMGen Status Error:', {
      error: error.message,
      errorName: error.name,
      status: error.status,
      responseData: error.responseData,
      isNetworkError,
      isCorsError,
      retryCount,
      orderId,
      stack: error.stack
    });

    // Re-throw the error so caller can handle it
    throw error;
  }
};

/**
 * Get user balance from SMMGen API
 * @returns {Promise<number>} User balance
 */
export const getSMMGenBalance = async () => {
  try {
    const { backendUrl } = await getSMMGenConfig();

    const apiUrl = await buildApiUrl('balance');
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || errorData.message || `Balance check failed: ${response.status}`);
    }

    const data = await response.json();
    // SMMGen might return balance in different formats
    return parseFloat(data.balance || data.amount || 0);
  } catch (error) {
    console.error('SMMGen Balance Error:', error);
    throw error;
  }
};

/**
 * Map SMMGen category to our platform format
 */
const mapCategoryToPlatform = (category) => {
  const categoryLower = (category || '').toLowerCase();

  if (categoryLower.includes('instagram') || categoryLower.includes('ig')) {
    return 'instagram';
  }
  if (categoryLower.includes('tiktok') || categoryLower.includes('tt')) {
    return 'tiktok';
  }
  if (categoryLower.includes('youtube') || categoryLower.includes('yt')) {
    return 'youtube';
  }
  if (categoryLower.includes('facebook') || categoryLower.includes('fb')) {
    return 'facebook';
  }
  if (categoryLower.includes('twitter') || categoryLower.includes('x.com')) {
    return 'twitter';
  }

  return categoryLower || 'other';
};

export default {
  fetchSMMGenServices,
  placeSMMGenOrder,
  getSMMGenOrderStatus,
  getSMMGenBalance
};

