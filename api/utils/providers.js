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
    const { service, link, quantity, comments } = params;

    switch (provider.toLowerCase()) {
        case 'smmgen':
            return await placeSMMGenOrder(service, link, quantity, comments);
        case 'jbsmmpanel':
            return await placeJBSMMPanelOrder(service, link, quantity, comments);
        case 'smmcost':
            return await placeSMMCostOrder(service, link, quantity, comments);
        case 'worldofsmm':
            return await placeWorldOfSMMOrder(service, link, quantity, comments);
        default:
            throw new Error(`Unsupported provider: ${provider}`);
    }
}

/**
 * Searches for an existing order with matching parameters at the provider.
 * This is used to prevent double orders during retries.
 * 
 * @param {string} provider - 'smmgen', 'jbsmmpanel', or 'smmcost'
 * @param {Object} params - { service, link, quantity, maxAgeMins }
 * @returns {Promise<Object|null>} Matching order or null
 */
export async function findMatchingProviderOrder(provider, params) {
    const { service, link, quantity, maxAgeMins = 120 } = params;

    try {
        // Fetch last 100 orders from the provider
        const recentOrders = await fetchProviderOrders(provider, 100);

        if (!recentOrders || recentOrders.length === 0) return null;

        const normalizedLink = link.trim().toLowerCase();
        const now = Date.now();
        const maxAgeMs = maxAgeMins * 60 * 1000;

        // Find match in recent orders
        const match = recentOrders.find(o => {
            // Basic matching criteria
            const linkMatch = o.link.trim().toLowerCase() === normalizedLink;
            const quantityMatch = parseInt(o.quantity) === parseInt(quantity);
            const serviceMatch = String(o.service) === String(service);

            if (!linkMatch || !quantityMatch || !serviceMatch) return false;

            // Time sanity check (if date is available)
            if (o.date) {
                const orderDate = new Date(o.date).getTime();
                if (now - orderDate > maxAgeMs) return false;
            }

            return true;
        });

        return match || null;
    } catch (error) {
        console.error(`[PROVIDER RECON] Failed to find matching order at ${provider}:`, error.message);
        // On error, we return null to allow the caller to decide whether to risk a duplicate or fail
        return null;
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
        case 'worldofsmm':
            return await fetchWorldOfSMMStatus(providerOrderId);
        default:
            throw new Error(`Unsupported status check provider: ${provider}`);
    }
}



/**
 * Fetches recent orders from a provider (for reconciliation)
 * @param {string} provider - Provider name
 * @param {number} limit - Max orders to fetch (default 100)
 * @returns {Promise<Array>} List of orders { id, service, link, quantity, status, charge }
 */
export async function fetchProviderOrders(provider, limit = 100) {
    switch (provider.toLowerCase()) {
        case 'smmgen':
            return await fetchSMMGenRecentOrders(limit);
        case 'jbsmmpanel':
            return await fetchJBSMMPanelRecentOrders(limit);
        case 'smmcost':
            return await fetchSMMCostRecentOrders(limit);
        case 'worldofsmm':
            return await fetchWorldOfSMMRecentOrders(limit);
        default:
            console.warn(`Provider ${provider} does not support order listing.`);
            return [];
    }
}

async function fetchSMMGenRecentOrders(limit) {
    const SMMGEN_API_URL = process.env.SMMGEN_API_URL || 'https://smmgen.com/api/v2';
    const SMMGEN_API_KEY = process.env.SMMGEN_API_KEY;

    if (!SMMGEN_API_KEY) return [];

    try {
        const response = await fetch(SMMGEN_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                key: SMMGEN_API_KEY,
                action: 'orders',
                limit: limit
            })
        });

        if (!response.ok) return [];
        const data = await response.json();
        // Normalize
        return Array.isArray(data) ? data.map(o => ({
            id: String(o.order),
            service: String(o.service),
            link: o.link,
            quantity: parseInt(o.quantity),
            status: o.status,
            charge: parseFloat(o.charge),
            date: o.date // often YYYY-MM-DD HH:mm:ss
        })) : [];
    } catch (e) {
        console.error('SMMGen fetch orders failed:', e);
        return [];
    }
}

async function fetchJBSMMPanelRecentOrders(limit) {
    const JBSMMPANEL_API_URL = process.env.JBSMMPANEL_API_URL || 'https://jbsmmpanel.com/api/v2';
    const JBSMMPANEL_API_KEY = process.env.JBSMMPANEL_API_KEY;

    if (!JBSMMPANEL_API_KEY) return [];

    try {
        const params = new URLSearchParams({
            key: JBSMMPANEL_API_KEY,
            action: 'orders',
            limit: String(limit)
        });

        const response = await fetch(JBSMMPANEL_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });

        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data.map(o => ({
            id: String(o.order),
            service: String(o.service),
            link: o.link,
            quantity: parseInt(o.quantity),
            status: o.status,
            charge: parseFloat(o.charge),
            date: o.date
        })) : [];
    } catch (e) {
        console.error('JBSMM fetch orders failed:', e);
        return [];
    }
}

async function fetchSMMCostRecentOrders(limit) {
    const SMMCOST_API_URL = process.env.SMMCOST_API_URL || 'https://smmcost.com/api/v2';
    const SMMCOST_API_KEY = process.env.SMMCOST_API_KEY;

    if (!SMMCOST_API_KEY) return [];

    try {
        const params = new URLSearchParams({
            key: SMMCOST_API_KEY,
            action: 'orders',
            limit: String(limit)
        });

        const response = await fetch(SMMCOST_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });

        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data.map(o => ({
            id: String(o.order),
            service: String(o.service),
            link: o.link,
            quantity: parseInt(o.quantity),
            status: o.status,
            charge: parseFloat(o.charge),
            date: o.date
        })) : [];
    } catch (e) {
        console.error('SMMCost fetch orders failed:', e);
        return [];
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

async function placeSMMGenOrder(service, link, quantity, comments) {
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
            quantity: parseInt(quantity, 10),
            comments: comments ? String(comments).trim() : undefined
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

async function placeJBSMMPanelOrder(service, link, quantity, comments) {
    const JBSMMPANEL_API_URL = process.env.JBSMMPANEL_API_URL || 'https://jbsmmpanel.com/api/v2';
    const JBSMMPANEL_API_KEY = process.env.JBSMMPANEL_API_KEY;

    if (!JBSMMPANEL_API_KEY) throw new Error('JBSMMPanel API key not configured');

    // Remove undefined comments from params if URLSearchParams includes "undefined" string
    // URLSearchParams doesn't handle undefined values well (converts to "undefined" string)
    // We need to construct the object carefully first
    const params = {
        key: JBSMMPANEL_API_KEY,
        action: 'add',
        service: String(service).trim(),
        link: link.trim(),
        quantity: String(quantity)
    };

    if (comments) {
        params.comments = String(comments).trim();
    }

    const requestBody = new URLSearchParams(params).toString();

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

async function placeSMMCostOrder(service, link, quantity, comments) {
    const SMMCOST_API_URL = process.env.SMMCOST_API_URL || 'https://smmcost.com/api/v2';
    const SMMCOST_API_KEY = process.env.SMMCOST_API_KEY;

    if (!SMMCOST_API_KEY) throw new Error('SMMCost API key not configured');

    const params = {
        key: SMMCOST_API_KEY,
        action: 'add',
        service: String(service).trim(),
        link: link.trim(),
        quantity: String(quantity)
    };

    if (comments) {
        params.comments = String(comments).trim();
    }

    const requestBody = new URLSearchParams(params).toString();

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

async function fetchWorldOfSMMRecentOrders(limit) {
    const WORLDOFSMM_API_URL = process.env.WORLDOFSMM_API_URL || 'https://worldofsmm.com/api/v2';
    const WORLDOFSMM_API_KEY = process.env.WORLDOFSMM_API_KEY;

    if (!WORLDOFSMM_API_KEY) return [];

    try {
        const params = new URLSearchParams({
            key: WORLDOFSMM_API_KEY,
            action: 'orders',
            limit: String(limit)
        });

        const response = await fetch(WORLDOFSMM_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });

        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data.map(o => ({
            id: String(o.order),
            service: String(o.service),
            link: o.link,
            quantity: parseInt(o.quantity),
            status: o.status,
            charge: parseFloat(o.charge),
            date: o.date
        })) : [];
    } catch (e) {
        console.error('World of SMM fetch orders failed:', e);
        return [];
    }
}

async function fetchWorldOfSMMStatus(providerOrderId) {
    const WORLDOFSMM_API_URL = process.env.WORLDOFSMM_API_URL || 'https://worldofsmm.com/api/v2';
    const WORLDOFSMM_API_KEY = process.env.WORLDOFSMM_API_KEY;

    if (!WORLDOFSMM_API_KEY) throw new Error('World of SMM API key not configured');

    const requestBody = new URLSearchParams({
        key: WORLDOFSMM_API_KEY,
        action: 'status',
        order: String(providerOrderId)
    }).toString();

    const response = await fetch(WORLDOFSMM_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: requestBody
    });

    if (!response.ok) throw new Error(`World of SMM API error: ${response.status}`);
    return await response.json();
}

async function placeWorldOfSMMOrder(service, link, quantity, comments) {
    const WORLDOFSMM_API_URL = process.env.WORLDOFSMM_API_URL || 'https://worldofsmm.com/api/v2';
    const WORLDOFSMM_API_KEY = process.env.WORLDOFSMM_API_KEY;

    if (!WORLDOFSMM_API_KEY) throw new Error('World of SMM API key not configured');

    const params = {
        key: WORLDOFSMM_API_KEY,
        action: 'add',
        service: String(service).trim(),
        link: link.trim(),
        quantity: String(quantity)
    };

    if (comments) {
        params.comments = String(comments).trim();
    }

    const requestBody = new URLSearchParams(params).toString();

    const response = await fetch(WORLDOFSMM_API_URL, {
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

        const errorMessage = errorData.error || errorData.message || `World of SMM API error: ${response.status}`;
        console.error(`[PROVIDER FAILURE] worldofsmm: ${errorMessage}`, { status: response.status, details: errorData });

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
