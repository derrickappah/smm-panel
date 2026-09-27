import { getCached, setCached, deleteCached } from './redisClient.js';
import { getServiceRoleClient } from './auth.js';

const REQUEST_TIMEOUT = 30000;
const PROVIDERS_CACHE_KEY = 'smm:dynamic_providers:active';
const PROVIDER_SLUG_CACHE_PREFIX = 'smm:dynamic_provider:';

/**
 * Normalizes a provider name into a URL/DB safe slug
 * e.g. "The Quick Media Soft" -> "thequickmediasoft"
 */
export function generateProviderSlug(name) {
    if (!name || typeof name !== 'string') return '';
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

/**
 * Retrieve all active dynamic SMM providers from Supabase (cached for 60s)
 */
export async function getActiveDynamicProviders(forceRefresh = false) {
    if (!forceRefresh) {
        const cached = await getCached(PROVIDERS_CACHE_KEY);
        if (cached && Array.isArray(cached)) return cached;
    }

    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
        .from('smm_providers')
        .select('*')
        .eq('status', 'active')
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true });

    if (error) {
        console.error('[DynamicProvider] Failed to fetch active providers:', error);
        return [];
    }

    const providers = data || [];
    await setCached(PROVIDERS_CACHE_KEY, providers, 60);
    return providers;
}

/**
 * Retrieve a specific dynamic provider by its slug
 */
export async function getDynamicProviderBySlug(slug, forceRefresh = false) {
    if (!slug) return null;
    const cacheKey = `${PROVIDER_SLUG_CACHE_PREFIX}${slug}`;

    if (!forceRefresh) {
        const cached = await getCached(cacheKey);
        if (cached) return cached;
    }

    const supabase = getServiceRoleClient();
    const { data, error } = await supabase
        .from('smm_providers')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

    if (error || !data) {
        return null;
    }

    await setCached(cacheKey, data, 300);
    return data;
}

/**
 * Invalidate cache for dynamic providers
 */
export async function invalidateDynamicProviderCache(slug) {
    await deleteCached(PROVIDERS_CACHE_KEY);
    if (slug) {
        await deleteCached(`${PROVIDER_SLUG_CACHE_PREFIX}${slug}`);
    }
}

/**
 * Live test connection to an SMM provider using API URL and API Key
 * Validates the standard SMM v2 'balance' action.
 */
export async function testDynamicConnection(apiUrl, apiKey) {
    if (!apiUrl || typeof apiUrl !== 'string') {
        throw new Error('API URL is required');
    }
    if (!apiKey || typeof apiKey !== 'string') {
        throw new Error('API Key is required');
    }

    const cleanUrl = apiUrl.trim();
    const cleanKey = apiKey.trim();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
        const formData = new URLSearchParams({
            key: cleanKey,
            action: 'balance'
        });

        const response = await fetch(cleanUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BoostUpGH/1.0'
            },
            body: formData.toString(),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            throw new Error(`Provider returned HTTP ${response.status}: ${errorText.slice(0, 100)}`);
        }

        const data = await response.json().catch(async () => {
            const rawText = await response.text();
            throw new Error(`Invalid JSON received: ${rawText.slice(0, 100)}`);
        });

        if (data.error) {
            throw new Error(`Provider API error: ${data.error}`);
        }

        const balance = parseFloat(data.balance);
        if (isNaN(balance) && data.balance === undefined) {
            throw new Error(`Response does not contain a valid 'balance' field: ${JSON.stringify(data).slice(0, 100)}`);
        }

        return {
            success: true,
            balance: isNaN(balance) ? 0 : balance,
            currency: data.currency || 'USD',
            raw: data
        };
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            throw new Error('Connection timed out after 15 seconds. Please check the API URL.');
        }
        throw err;
    }
}

/**
 * Fetch live balance for a registered dynamic provider
 */
export async function fetchDynamicBalance(provider) {
    const testResult = await testDynamicConnection(provider.api_url, provider.api_key);
    
    // Asynchronously record last balance in DB
    try {
        const supabase = getServiceRoleClient();
        await supabase
            .from('smm_providers')
            .update({
                balance: testResult.balance,
                currency: testResult.currency,
                last_balance_check: new Date().toISOString(),
                last_error: null,
                updated_at: new Date().toISOString()
            })
            .eq('id', provider.id);
    } catch (dbErr) {
        console.warn('[DynamicProvider] Failed to update balance in DB:', dbErr.message);
    }

    return testResult;
}

/**
 * Fetch services from a dynamic provider
 */
export async function fetchDynamicServices(provider) {
    const cacheKey = `smm:dynamic_services:${provider.slug}`;
    const cached = await getCached(cacheKey);
    if (cached) return cached;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
        const formData = new URLSearchParams({
            key: provider.api_key,
            action: 'services'
        });

        const response = await fetch(provider.api_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString(),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const services = await response.json();
        if (Array.isArray(services)) {
            await setCached(cacheKey, services, 600); // 10 min TTL
        }
        return services;
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

/**
 * Place order with a dynamic provider
 */
export async function placeDynamicOrder(provider, params) {
    const { service, link, quantity, runs, interval, comments } = params;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
        const bodyParams = {
            key: provider.api_key,
            action: 'add',
            service: String(service).trim(),
            link: link.trim(),
            quantity: String(quantity)
        };

        if (runs) bodyParams.runs = String(runs);
        if (interval) bodyParams.interval = String(interval);
        if (comments) bodyParams.comments = Array.isArray(comments) ? comments.join('\n') : String(comments);

        const formData = new URLSearchParams(bodyParams);

        const response = await fetch(provider.api_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString(),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || errorData.message || `Failed with HTTP ${response.status}`);
        }

        const data = await response.json();
        if (data.error) {
            throw new Error(data.error);
        }

        return data; // Typically { order: 12345 }
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

/**
 * Check order status from a dynamic provider (single or bulk comma-separated)
 */
export async function fetchDynamicStatus(provider, orderIds) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
        const ids = Array.isArray(orderIds) ? orderIds.join(',') : String(orderIds);
        const isMultiple = ids.includes(',');

        const params = {
            key: provider.api_key,
            action: 'status'
        };

        if (isMultiple) {
            params.orders = ids;
        } else {
            params.order = ids;
        }

        const formData = new URLSearchParams(params);

        const response = await fetch(provider.api_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString(),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}
