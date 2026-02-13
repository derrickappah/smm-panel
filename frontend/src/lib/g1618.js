// G1618 API Client

const API_BASE = '/api/g1618';

/**
 * Fetch services from G1618
 * @returns {Promise<Array>} List of services
 */
export async function getG1618Services() {
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
        console.error('G1618 services error:', error);
        throw error;
    }
}

/**
 * Get G1618 account balance
 * @returns {Promise<Object>} { balance, currency }
 */
export async function getG1618Balance() {
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
        console.error('G1618 balance error:', error);
        throw error;
    }
}

/**
 * Place a test order (or manual order) on G1618
 * @param {Object} orderData { service, link, quantity }
 * @returns {Promise<Object>} { order: "123" }
 */
export async function placeG1618Order(orderData) {
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
        console.error('G1618 order error:', error);
        throw error;
    }
}

/**
 * Check order status
 * @param {string|number} orderId 
 * @returns {Promise<Object>} Status details
 */
export async function getG1618Status(orderId) {
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
        console.error('G1618 status error:', error);
        throw error;
    }
}
