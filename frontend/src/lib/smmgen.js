// SMMGen API Integration
// This service handles all interactions with SMMGen API via backend proxy

// Backend proxy URL (to avoid CORS issues)
// Priority: 1. Vercel serverless functions (same domain), 2. Custom backend URL, 3. Localhost
const BACKEND_PROXY_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

// Check if we're in production (Vercel)
const isProduction = process.env.NODE_ENV === 'production' || window.location.hostname !== 'localhost';

// Get SMMGen config from environment variables
const getSMMGenConfig = () => {
  // In production (Vercel), use serverless functions on the same domain
  // This avoids CORS issues and doesn't require a separate backend
  let backendUrl;
  let useServerlessFunctions = false;
  
  if (isProduction) {
    // Use Vercel serverless functions (same domain, no CORS)
    // These are in the /api/smmgen folder
    backendUrl = '/api/smmgen';
    useServerlessFunctions = true;
  } else if (BACKEND_PROXY_URL && !BACKEND_PROXY_URL.includes('localhost')) {
    // Use custom backend URL if provided
    backendUrl = BACKEND_PROXY_URL;
    useServerlessFunctions = false;
  } else {
    // Development: use localhost backend
    backendUrl = 'http://localhost:5000';
    useServerlessFunctions = false;
  }
  
  // In production, serverless functions are always available
  const isConfigured = isProduction 
    ? true // Serverless functions are always available in Vercel
    : (BACKEND_PROXY_URL && BACKEND_PROXY_URL.includes('localhost')); // Check if local backend is running
  
  return { backendUrl, isConfigured, useServerlessFunctions };
};

// Helper function to build the correct API endpoint URL
const buildApiUrl = (endpoint) => {
  const { backendUrl, useServerlessFunctions } = getSMMGenConfig();
  
  if (useServerlessFunctions) {
    // Serverless functions: /api/smmgen/order, /api/smmgen/services, etc.
    return `${backendUrl}/${endpoint}`;
  } else {
    // Backend proxy: http://localhost:5000/api/smmgen/order
    return `${backendUrl}/api/smmgen/${endpoint}`;
  }
};

/**
 * Fetch all services from SMMGen API
 * @returns {Promise<Array>} Array of services
 */
export const fetchSMMGenServices = async () => {
  try {
    const apiUrl = buildApiUrl('services');

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
 * Place an order via SMMGen API
 * @param {string} serviceId - SMMGen service ID
 * @param {string} link - Target URL/link
 * @param {number} quantity - Quantity to order
 * @returns {Promise<Object>} Order response from SMMGen
 */
export const placeSMMGenOrder = async (serviceId, link, quantity) => {
  try {
    const { backendUrl, isConfigured } = getSMMGenConfig();

    // If backend is not configured in production, skip SMMGen integration
    if (!isConfigured && isProduction) {
      console.warn('SMMGen backend not configured. Skipping SMMGen order placement.');
      return null; // Return null to indicate SMMGen was skipped
    }

    const apiUrl = buildApiUrl('order');
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        service: serviceId,
        link: link,
        quantity: quantity
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || errorData.message || `Order failed: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    // If it's a network error (CORS, connection failed), return null instead of throwing
    // This allows the app to continue with local order creation
    if (error.message.includes('Failed to fetch') || 
        error.message.includes('CORS') || 
        error.message.includes('ERR_CONNECTION_REFUSED') ||
        error.message.includes('NetworkError')) {
      // Only log in development, suppress in production
      if (!isProduction) {
        console.debug('SMMGen backend unavailable (expected in dev). Continuing with local order only.');
      }
      return null; // Return null to allow graceful degradation
    }
    // For other errors, log and throw
    console.error('SMMGen Order Error:', error);
    throw error;
  }
};

/**
 * Get order status from SMMGen API
 * @param {string} orderId - SMMGen order ID
 * @returns {Promise<Object>} Order status
 */
export const getSMMGenOrderStatus = async (orderId) => {
  try {
    const { backendUrl } = getSMMGenConfig();

    const apiUrl = buildApiUrl('status');
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        order: orderId
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || errorData.message || `Status check failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('SMMGen Status Error:', error);
    throw error;
  }
};

/**
 * Get user balance from SMMGen API
 * @returns {Promise<number>} User balance
 */
export const getSMMGenBalance = async () => {
  try {
    const { backendUrl } = getSMMGenConfig();

    const apiUrl = buildApiUrl('balance');
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

