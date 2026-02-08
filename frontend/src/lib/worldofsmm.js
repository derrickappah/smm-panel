// World of SMM API Integration
// This service handles all interactions with World of SMM API via backend proxy

const BACKEND_PROXY_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

const isProduction = process.env.NODE_ENV === 'production' ||
    (typeof window !== 'undefined' &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1');

/**
 * Helper to build API URL
 */
const buildApiUrl = (endpoint) => {
    const customBackendUrl = process.env.REACT_APP_BACKEND_URL;
    if (customBackendUrl) {
        return `${customBackendUrl.replace(/\/+$/, '')}/api/worldofsmm/${endpoint}`;
    }
    return `/api/worldofsmm/${endpoint}`;
};

/**
 * Fetch all services from World of SMM API
 */
export const fetchWorldOfSMMServices = async () => {
    try {
        const apiUrl = buildApiUrl('services');
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `API error: ${response.status}`);
        }

        const data = await response.json();
        if (Array.isArray(data)) {
            return data.map(service => ({
                id: service.service,
                worldofsmm_service_id: service.service,
                name: service.name,
                type: service.type,
                category: service.category,
                rate: parseFloat(service.rate),
                min_quantity: parseInt(service.min),
                max_quantity: parseInt(service.max),
                description: `${service.name} - ${service.category}`,
                refill: service.refill,
                cancel: service.cancel
            }));
        }
        return [];
    } catch (error) {
        console.error('World of SMM API Error:', error);
        throw error;
    }
};

/**
 * Place an order via World of SMM API
 */
export const placeWorldOfSMMOrder = async (serviceId, link, quantity) => {
    try {
        const apiUrl = buildApiUrl('order');
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                service: serviceId,
                link: link,
                quantity: quantity
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `Order failed: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('World of SMM Order Error:', error);
        throw error;
    }
};

/**
 * Get order status from World of SMM
 */
export const getWorldOfSMMOrderStatus = async (orderId) => {
    try {
        const apiUrl = buildApiUrl('status');
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: orderId })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `Status check failed: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('World of SMM Status Error:', error);
        throw error;
    }
};

/**
 * Get user balance from World of SMM
 */
export const getWorldOfSMMBalance = async () => {
    try {
        const apiUrl = buildApiUrl('balance');
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `Balance check failed: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('World of SMM Balance Error:', error);
        throw error;
    }
};
