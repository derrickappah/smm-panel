/**
 * SMM Provider Utility
 * 
 * Centralizes interaction with different SMM provider APIs.
 */

const REQUEST_TIMEOUT = 30000;

/**
 * Places an order with a specific provider
 * @param {string} provider - 'smmgen', 'jbsmmpanel', or 'smmcost'
 * @param {Object} params - { service, link, quantity }
 * @returns {Promise<Object>} Provider response
 */
export async function placeProviderOrder(provider, params) {
    const { service, link, quantity } = params;

    switch (provider.toLowerCase()) {
        case 'smmgen':
            return await placeSMMGenOrder(service, link, quantity);
        case 'jbsmmpanel':
            return await placeJBSMMPanelOrder(service, link, quantity);
        case 'smmcost':
            return await placeSMMCostOrder(service, link, quantity);
        default:
            throw new Error(`Unsupported provider: ${provider}`);
    }
}

/**
 * Fetches order status from a specific provider
 * @param {string} provider - 'smmgen', 'jbsmmpanel', or 'smmcost'
 * @param {string|number} providerOrderId - ID assigned by the provider
 * @returns {Promise<Object>} Status response
 */
export async function fetchProviderOrderStatus(provider, providerOrderId) {
    if (!providerOrderId) throw new Error('Provider Order ID is required');

    switch (provider.toLowerCase()) {
        case 'smmgen':
            return await fetchSMMGenStatus(providerOrderId);
        case 'jbsmmpanel':
            return await fetchJBSMMPanelStatus(providerOrderId);
        case 'smmcost':
            return await fetchSMMCostStatus(providerOrderId);
        default:
            throw new Error(`Unsupported status check provider: ${provider}`);
    }
}

async function fetchSMMGenStatus(providerOrderId) {
    const SMMGEN_API_URL = process.env.SMMGEN_API_URL || 'https://smmgen.com/api/v2';
    const SMMGEN_API_KEY = process.env.SMMGEN_API_KEY;

    if (!SMMGEN_API_KEY) throw new Error('SMMGen API key not configured');

    const response = await fetch(SMMGEN_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            key: SMMGEN_API_KEY,
            action: 'status',
            order: providerOrderId
        })
    });

    if (!response.ok) throw new Error(`SMMGen API error: ${response.status}`);
    return await response.json();
}

async function fetchJBSMMPanelStatus(providerOrderId) {
    const JBSMMPANEL_API_URL = process.env.JBSMMPANEL_API_URL || 'https://jbsmmpanel.com/api/v2';
    const JBSMMPANEL_API_KEY = process.env.JBSMMPANEL_API_KEY;

    if (!JBSMMPANEL_API_KEY) throw new Error('JBSMMPanel API key not configured');

    const requestBody = new URLSearchParams({
        key: JBSMMPANEL_API_KEY,
        action: 'status',
        order: String(providerOrderId)
    }).toString();

    const response = await fetch(JBSMMPANEL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: requestBody
    });

    if (!response.ok) throw new Error(`JBSMMPanel API error: ${response.status}`);
    return await response.json();
}

async function fetchSMMCostStatus(providerOrderId) {
    const SMMCOST_API_URL = process.env.SMMCOST_API_URL || 'https://smmcost.com/api/v2';
    const SMMCOST_API_KEY = process.env.SMMCOST_API_KEY;

    if (!SMMCOST_API_KEY) throw new Error('SMMCost API key not configured');

    const requestBody = new URLSearchParams({
        key: SMMCOST_API_KEY,
        action: 'status',
        order: String(providerOrderId)
    }).toString();

    const response = await fetch(SMMCOST_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: requestBody
    });

    if (!response.ok) throw new Error(`SMMCost API error: ${response.status}`);
    return await response.json();
}

async function placeSMMGenOrder(service, link, quantity) {
    const SMMGEN_API_URL = process.env.SMMGEN_API_URL || 'https://smmgen.com/api/v2';
    const SMMGEN_API_KEY = process.env.SMMGEN_API_KEY;

    if (!SMMGEN_API_KEY) throw new Error('SMMGen API key not configured');

    const response = await fetch(SMMGEN_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            key: SMMGEN_API_KEY,
            action: 'add',
            service: String(service).trim(),
            link: link.trim(),
            quantity: parseInt(quantity, 10)
        })
    });

    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch (e) {
            errorData = { rawResponse: await response.text().catch(() => 'No response body') };
        }

        const errorMessage = errorData.error || errorData.message || `SMMGen API error: ${response.status}`;
        console.error(`[PROVIDER FAILURE] smmgen: ${errorMessage}`, { status: response.status, details: errorData });

        // Add full response data to the error object
        const error = new Error(errorMessage);
        error.providerDetails = errorData;
        error.providerStatus = response.status;
        throw error;
    }

    return await response.json();
}

async function placeJBSMMPanelOrder(service, link, quantity) {
    const JBSMMPANEL_API_URL = process.env.JBSMMPANEL_API_URL || 'https://jbsmmpanel.com/api/v2';
    const JBSMMPANEL_API_KEY = process.env.JBSMMPANEL_API_KEY;

    if (!JBSMMPANEL_API_KEY) throw new Error('JBSMMPanel API key not configured');

    const requestBody = new URLSearchParams({
        key: JBSMMPANEL_API_KEY,
        action: 'add',
        service: String(service).trim(),
        link: link.trim(),
        quantity: String(quantity)
    }).toString();

    const response = await fetch(JBSMMPANEL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: requestBody
    });

    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch (e) {
            errorData = { rawResponse: await response.text().catch(() => 'No response body') };
        }

        const errorMessage = errorData.error || errorData.message || `JBSMMPanel API error: ${response.status}`;
        console.error(`[PROVIDER FAILURE] jbsmmpanel: ${errorMessage}`, { status: response.status, details: errorData });

        const error = new Error(errorMessage);
        error.providerDetails = errorData;
        error.providerStatus = response.status;
        throw error;
    }

    return await response.json();
}

async function placeSMMCostOrder(service, link, quantity) {
    const SMMCOST_API_URL = process.env.SMMCOST_API_URL || 'https://smmcost.com/api/v2';
    const SMMCOST_API_KEY = process.env.SMMCOST_API_KEY;

    if (!SMMCOST_API_KEY) throw new Error('SMMCost API key not configured');

    const requestBody = new URLSearchParams({
        key: SMMCOST_API_KEY,
        action: 'add',
        service: String(service).trim(),
        link: link.trim(),
        quantity: String(quantity)
    }).toString();

    const response = await fetch(SMMCOST_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: requestBody
    });

    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch (e) {
            errorData = { rawResponse: await response.text().catch(() => 'No response body') };
        }

        const errorMessage = errorData.error || errorData.message || `SMMCost API error: ${response.status}`;
        console.error(`[PROVIDER FAILURE] smmcost: ${errorMessage}`, { status: response.status, details: errorData });

        const error = new Error(errorMessage);
        error.providerDetails = errorData;
        error.providerStatus = response.status;
        throw error;
    }

    return await response.json();
}

/**
 * Extracts Provider Order ID from success response
 */
export function extractOrderId(response) {
    if (!response) return null;
    return response.order || response.order_id || response.orderId || (response.data && response.data.order) || null;
}
