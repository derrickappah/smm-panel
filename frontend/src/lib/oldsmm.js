// OldSMM API Client

const API_BASE = '/api/oldsmm';

/**
 * Fetch services from OldSMM
 * @returns {Promise<Array>} List of services
 */
export async function getOldSMMServices() {
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
        console.error('OldSMM services error:', error);
        throw error;
    }
}

/**
 * Get OldSMM account balance
 * @returns {Promise<Object>} { balance, currency }
 */
export async function getOldSMMBalance() {
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
        console.error('OldSMM balance error:', error);
        throw error;
    }
}

/**
 * Place a test order (or manual order) on OldSMM
 * @param {Object} orderData { service, link, quantity }
 * @returns {Promise<Object>} { order: "123" }
 */
export async function placeOldSMMOrder(orderData) {
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
        console.error('OldSMM order error:', error);
        throw error;
    }
}

/**
 * Check order status
 * @param {string|number} orderId 
 * @returns {Promise<Object>} Status details
 */
export async function getOldSMMStatus(orderId) {
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
        console.error('OldSMM status error:', error);
        throw error;
    }
}
