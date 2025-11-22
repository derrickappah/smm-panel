// SMMGen Direct API Integration (without proxy)
// WARNING: This exposes your API key in the frontend code
// Only use this if SMMGen API allows CORS and you're okay with exposing the key
// RECOMMENDED: Use Vercel serverless functions instead (see api/smmgen.js)

const SMMGEN_API_URL = process.env.REACT_APP_SMMGEN_API_URL || 'https://smmgen.com/api/v2';
const SMMGEN_API_KEY = process.env.REACT_APP_SMMGEN_API_KEY || '';

// Check if direct API is configured
const isDirectAPIConfigured = () => {
  return SMMGEN_API_KEY && 
         !SMMGEN_API_KEY.includes('your-smmgen') && 
         !SMMGEN_API_KEY.includes('xxxxxxxx');
};

/**
 * Fetch all services directly from SMMGen API
 * @returns {Promise<Array>} Array of services
 */
export const fetchSMMGenServicesDirect = async () => {
  if (!isDirectAPIConfigured()) {
    throw new Error('SMMGen API key not configured. Set REACT_APP_SMMGEN_API_KEY in your .env file.');
  }

  try {
    const response = await fetch(SMMGEN_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        key: SMMGEN_API_KEY,
        action: 'services'
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || errorData.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Transform SMMGen service format to our format
    if (Array.isArray(data)) {
      return data.map(service => ({
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
    console.error('SMMGen Direct API Error:', error);
    
    // Check for CORS errors
    if (error.message.includes('CORS') || error.message.includes('Access-Control-Allow-Origin')) {
      throw new Error('CORS error: SMMGen API does not allow direct browser calls. Use a proxy server or Vercel serverless functions.');
    }
    
    throw error;
  }
};

/**
 * Place an order directly via SMMGen API
 */
export const placeSMMGenOrderDirect = async (serviceId, link, quantity) => {
  if (!isDirectAPIConfigured()) {
    throw new Error('SMMGen API key not configured.');
  }

  try {
    const response = await fetch(SMMGEN_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        key: SMMGEN_API_KEY,
        action: 'add',
        service: serviceId,
        link: link,
        quantity: quantity
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || errorData.message || `Order failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('SMMGen Direct Order Error:', error);
    
    if (error.message.includes('CORS') || error.message.includes('Access-Control-Allow-Origin')) {
      throw new Error('CORS error: SMMGen API does not allow direct browser calls. Use a proxy server or Vercel serverless functions.');
    }
    
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
  fetchSMMGenServicesDirect,
  placeSMMGenOrderDirect,
  isDirectAPIConfigured
};

