const API_BASE = '/api/smmraja';

export async function getSmmRajaServices() {
    try {
        const response = await fetch(`${API_BASE}/services`, { method: 'POST' });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Failed to fetch services: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('SMM Raja services error:', error);
        throw error;
    }
}

export async function getSmmRajaBalance() {
    try {
        const response = await fetch(`${API_BASE}/balance`, { method: 'POST' });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Failed to fetch balance: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('SMM Raja balance error:', error);
        throw error;
    }
}

export async function placeSmmRajaOrder(orderData) {
    try {
        const response = await fetch(`${API_BASE}/order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Failed to place order: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('SMM Raja order error:', error);
        throw error;
    }
}

export async function getSmmRajaStatus(orderId) {
    try {
        const response = await fetch(`${API_BASE}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: orderId })
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Failed to check status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('SMM Raja status error:', error);
        throw error;
    }
}
