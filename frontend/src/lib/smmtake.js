const API_BASE = '/api/smmtake';

export async function getSmmTakeServices() {
    try {
        const response = await fetch(`${API_BASE}/services`, { method: 'POST' });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Failed to fetch services: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('SMM Take services error:', error);
        throw error;
    }
}

export async function getSmmTakeBalance() {
    try {
        const response = await fetch(`${API_BASE}/balance`, { method: 'POST' });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Failed to fetch balance: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('SMM Take balance error:', error);
        throw error;
    }
}

export async function placeSmmTakeOrder(orderData) {
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
        console.error('SMM Take order error:', error);
        throw error;
    }
}

export async function getSmmTakeStatus(orderId) {
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
        console.error('SMM Take status error:', error);
        throw error;
    }
}
