const API_BASE = '/api/quickmedia';

export async function getQuickMediaServices() {
    try {
        const response = await fetch(`${API_BASE}/services`, { method: 'POST' });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Failed to fetch services: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('QuickMedia services error:', error);
        throw error;
    }
}

export async function getQuickMediaBalance() {
    try {
        const response = await fetch(`${API_BASE}/balance`, { method: 'POST' });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Failed to fetch balance: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('QuickMedia balance error:', error);
        throw error;
    }
}

export async function placeQuickMediaOrder(orderData) {
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
        console.error('QuickMedia order error:', error);
        throw error;
    }
}

export async function getQuickMediaStatus(orderId) {
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
        console.error('QuickMedia status error:', error);
        throw error;
    }
}
