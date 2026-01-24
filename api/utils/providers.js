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
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `SMMGen API error: ${response.status}`;
        console.error(`[PROVIDER FAILURE] smmgen: ${errorMessage}`, { status: response.status });
        throw new Error(errorMessage);
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
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `JBSMMPanel API error: ${response.status}`;
        console.error(`[PROVIDER FAILURE] jbsmmpanel: ${errorMessage}`, { status: response.status });
        throw new Error(errorMessage);
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
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `SMMCost API error: ${response.status}`;
        console.error(`[PROVIDER FAILURE] smmcost: ${errorMessage}`, { status: response.status });
        throw new Error(errorMessage);
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
