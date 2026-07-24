// ApiOwner SMM API Client

const API_BASE = '/api/apiowner';

/**
 * Fetch services from ApiOwner
 * @returns {Promise<Array>} List of services
 */
export async function getApiOwnerServices() {
    try {
        const response = await fetch(`${API_BASE}/services`, {
            method: 'POST',
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Failed to fetch services: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('ApiOwner services error:', error);
        throw error;
    }
}

/**
 * Get ApiOwner account balance
 * @returns {Promise<Object>} { balance, currency }
 */
export async function getApiOwnerBalance() {
    try {
        const response = await fetch(`${API_BASE}/balance`, {
            method: 'POST',
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Failed to fetch balance: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('ApiOwner balance error:', error);
        throw error;
    }
}

/**
 * Place an order on ApiOwner
 * @param {Object} orderData { service, link, quantity }
 * @returns {Promise<Object>} { order: 23501 }
 */
export async function placeApiOwnerOrder(orderData) {
    try {
        const response = await fetch(`${API_BASE}/order`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(orderData)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Failed to place order: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('ApiOwner order error:', error);
        throw error;
    }
}

/**
 * Check order status
 * @param {string|number} orderId 
 * @returns {Promise<Object>} Status details
 */
export async function getApiOwnerStatus(orderId) {
    try {
        const response = await fetch(`${API_BASE}/status`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ order: orderId })
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Failed to check status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('ApiOwner status error:', error);
        throw error;
    }
}
