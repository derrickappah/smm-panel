import { supabase } from './supabase';

const API_BASE = '/api/admin/providers';

async function getAuthHeaders() {
    const { data: { session } } = await supabase.auth.getSession();
    const headers = {
        'Content-Type': 'application/json',
    };
    if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
}

/**
 * Fetch all dynamic SMM providers from the database
 */
export async function getDynamicProviders() {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(API_BASE, {
            method: 'GET',
            headers
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || `Failed to fetch providers: ${response.status}`);
        }

        const data = await response.json();
        return data.providers || [];
    } catch (error) {
        console.error('getDynamicProviders error:', error);
        throw error;
    }
}

/**
 * Create a new dynamic SMM provider
 * @param {Object} providerData { name, api_url, api_key, priority, status }
 */
export async function createDynamicProvider(providerData) {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(API_BASE, {
            method: 'POST',
            headers,
            body: JSON.stringify(providerData)
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || `Failed to create provider: ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error('createDynamicProvider error:', error);
        throw error;
    }
}

/**
 * Update an existing dynamic SMM provider
 * @param {string} id UUID of the provider
 * @param {Object} updateData Fields to update
 */
export async function updateDynamicProvider(id, updateData) {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(API_BASE, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ id, ...updateData })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || `Failed to update provider: ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error('updateDynamicProvider error:', error);
        throw error;
    }
}

/**
 * Delete a dynamic SMM provider
 * @param {string} id UUID of the provider
 */
export async function deleteDynamicProvider(id) {
    try {
        const headers = await getAuthHeaders();
        const url = `${API_BASE}?id=${encodeURIComponent(id)}`;
        const response = await fetch(url, {
            method: 'DELETE',
            headers,
            body: JSON.stringify({ id })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || `Failed to delete provider: ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error('deleteDynamicProvider error:', error);
        throw error;
    }
}

/**
 * Test credentials against an SMM provider's API URL and Key
 * @param {Object} credentials { api_url, api_key }
 */
export async function testDynamicProviderConnection(credentials) {
    try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${API_BASE}/test`, {
            method: 'POST',
            headers,
            body: JSON.stringify(credentials)
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || `Connection test failed: ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error('testDynamicProviderConnection error:', error);
        throw error;
    }
}
