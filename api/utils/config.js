/**
 * Centralized Configuration & Environment Variables Resolver
 * 
 * Provides unified runtime access to configuration values.
 * Values stored in Supabase `app_settings` take precedence over `process.env`.
 * Features in-memory caching (TTL 30s) to keep serverless function overhead negligible.
 */

import { getServiceRoleClient } from './auth.js';

const CACHE_TTL_MS = 30 * 1000; // 30 seconds TTL
let cacheMap = new Map();
let lastFullFetchTime = 0;
let isFetchingFull = null;

/**
 * Standard categorized list of system environment variables
 */
export const KNOWN_ENV_VARIABLES = [
  // SMM Providers
  { key: 'SMMGEN_API_URL', label: 'SMMGen API URL', category: 'smm', default: 'https://smmgen.com/api/v2', isSecret: false, description: 'SMMGen API endpoint URL' },
  { key: 'SMMGEN_API_KEY', label: 'SMMGen API Key', category: 'smm', default: '', isSecret: true, description: 'API Key for SMMGen integration' },
  { key: 'SMMCOST_API_URL', label: 'SMMCost API URL', category: 'smm', default: 'https://api.smmcost.com', isSecret: false, description: 'SMMCost API endpoint URL' },
  { key: 'SMMCOST_API_KEY', label: 'SMMCost API Key', category: 'smm', default: '', isSecret: true, description: 'API Key for SMMCost integration' },
  { key: 'JBSMMPANEL_API_URL', label: 'JB SMM Panel API URL', category: 'smm', default: 'https://jbsmmpanel.com/api/v2', isSecret: false, description: 'JB SMM Panel API endpoint URL' },
  { key: 'JBSMMPANEL_API_KEY', label: 'JB SMM Panel API Key', category: 'smm', default: '', isSecret: true, description: 'API Key for JB SMM Panel' },
  { key: 'WORLDOFSMM_API_URL', label: 'World of SMM API URL', category: 'smm', default: 'https://worldofsmm.com/api/v2', isSecret: false, description: 'World of SMM API endpoint URL' },
  { key: 'WORLDOFSMM_API_KEY', label: 'World of SMM API Key', category: 'smm', default: '', isSecret: true, description: 'API Key for World of SMM' },
  { key: 'G1618_API_URL', label: 'G1618 API URL', category: 'smm', default: 'https://g1618.com/api/v2', isSecret: false, description: 'G1618 API endpoint URL' },
  { key: 'G1618_API_KEY', label: 'G1618 API Key', category: 'smm', default: '', isSecret: true, description: 'API Key for G1618 integration' },
  { key: 'OLDSMM_API_URL', label: 'OldSMM API URL', category: 'smm', default: 'https://oldsmm.com/api/v2', isSecret: false, description: 'OldSMM API endpoint URL' },
  { key: 'OLDSMM_API_KEY', label: 'OldSMM API Key', category: 'smm', default: '', isSecret: true, description: 'API Key for OldSMM integration' },
  { key: 'APIOWNER_API_URL', label: 'ApiOwner API URL', category: 'smm', default: 'https://apiowner.com/api/v2', isSecret: false, description: 'ApiOwner API endpoint URL' },
  { key: 'APIOWNER_API_KEY', label: 'ApiOwner API Key', category: 'smm', default: '', isSecret: true, description: 'API Key for ApiOwner integration' },

  // Payment Gateways
  { key: 'PAYSTACK_SECRET_KEY', label: 'Paystack Secret Key', category: 'payment', default: '', isSecret: true, description: 'Paystack live secret key (sk_live_...)' },
  { key: 'PAYSTACK_PUBLIC_KEY', label: 'Paystack Public Key', category: 'payment', default: '', isSecret: false, description: 'Paystack public key (pk_live_...)' },
  { key: 'KORAPAY_SECRET_KEY', label: 'Korapay Secret Key', category: 'payment', default: '', isSecret: true, description: 'Korapay secret key' },
  { key: 'KORAPAY_PUBLIC_KEY', label: 'Korapay Public Key', category: 'payment', default: '', isSecret: false, description: 'Korapay public key' },
  { key: 'KORAPAY_ENCRYPTION_KEY', label: 'Korapay Encryption Key', category: 'payment', default: '', isSecret: true, description: 'Korapay encryption key for transaction hashing' },
  { key: 'HUBTEL_CLIENT_ID', label: 'Hubtel Client ID', category: 'payment', default: '', isSecret: true, description: 'Hubtel merchant client ID' },
  { key: 'HUBTEL_CLIENT_SECRET', label: 'Hubtel Client Secret', category: 'payment', default: '', isSecret: true, description: 'Hubtel merchant client secret' },
  { key: 'HUBTEL_MERCHANT_ACCOUNT', label: 'Hubtel Merchant Account Number', category: 'payment', default: '', isSecret: false, description: 'Hubtel POS / Merchant account number' },
  { key: 'HUBTEL_POS_ID', label: 'Hubtel POS ID', category: 'payment', default: '', isSecret: false, description: 'Hubtel POS Channel / Terminal ID' },
  { key: 'MOOLRE_API_USER', label: 'Moolre API User', category: 'payment', default: '', isSecret: false, description: 'Moolre account username / user ID' },
  { key: 'MOOLRE_API_PUBKEY', label: 'Moolre API Public Key', category: 'payment', default: '', isSecret: true, description: 'Moolre API Public Key' },
  { key: 'MOOLRE_ACCOUNT_NUMBER', label: 'Moolre Account Number', category: 'payment', default: '', isSecret: false, description: 'Moolre designated receiving wallet number' },
  { key: 'MOOLRE_VAS_KEY', label: 'Moolre VAS Key (SMS)', category: 'payment', default: '', isSecret: true, description: 'Moolre X-API-VASKEY for SMS notifications' },
  { key: 'MOOLRE_SENDER_ID', label: 'Moolre SMS Sender ID', category: 'payment', default: 'Boostupgh', isSecret: false, description: 'Approved Sender ID for outgoing SMS' },

  // Database & Cache
  { key: 'SUPABASE_URL', label: 'Supabase URL', category: 'infrastructure', default: '', isSecret: false, description: 'Supabase project HTTPS endpoint' },
  { key: 'SUPABASE_ANON_KEY', label: 'Supabase Anon Key', category: 'infrastructure', default: '', isSecret: true, description: 'Public Anon client key' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', label: 'Supabase Service Role Key', category: 'infrastructure', default: '', isSecret: true, description: 'Superadmin server-side service role key' },
  { key: 'SUPABASE_JWT_SECRET', label: 'Supabase JWT Secret', category: 'infrastructure', default: '', isSecret: true, description: 'Secret used to sign and verify Supabase auth JWTs' },
  { key: 'UPSTASH_REDIS_REST_URL', label: 'Upstash Redis REST URL', category: 'infrastructure', default: '', isSecret: false, description: 'Upstash Redis REST API URL' },
  { key: 'UPSTASH_REDIS_REST_TOKEN', label: 'Upstash Redis REST Token', category: 'infrastructure', default: '', isSecret: true, description: 'Upstash Redis REST authentication token' },
  { key: 'REDIS_URL', label: 'Direct Redis Connection URL', category: 'infrastructure', default: '', isSecret: true, description: 'Standard redis:// connection string' },

  // System & Security
  { key: 'CRON_SECRET', label: 'Cron Secret Key', category: 'security', default: '', isSecret: true, description: 'Secret header token required to trigger automated cron endpoints' },
  { key: 'DEV_MONITOR_KEY', label: 'Dev Monitor Access Key', category: 'security', default: '', isSecret: true, description: 'Access key for dev system monitor endpoints' },
  { key: 'ADMIN_EMAILS', label: 'Admin Notification Emails', category: 'security', default: '', isSecret: false, description: 'Comma-separated list of admin email addresses for alerts' },
  { key: 'FRONTEND_URL', label: 'Frontend URL', category: 'security', default: 'https://boostupgh.com', isSecret: false, description: 'Primary frontend web domain for callbacks & redirects' }
];

/**
 * Loads all app_settings into memory cache if expired or empty
 */
async function refreshAllSettingsCache() {
  const now = Date.now();
  if (now - lastFullFetchTime < CACHE_TTL_MS && cacheMap.size > 0) {
    return;
  }

  if (isFetchingFull) {
    await isFetchingFull;
    return;
  }

  isFetchingFull = (async () => {
    try {
      const serviceClient = getServiceRoleClient();
      const { data, error } = await serviceClient
        .from('app_settings')
        .select('key, value, description');

      if (!error && Array.isArray(data)) {
        const newMap = new Map();
        data.forEach(item => {
          if (item && item.key) {
            newMap.set(item.key, {
              value: item.value,
              description: item.description || ''
            });
          }
        });
        cacheMap = newMap;
        lastFullFetchTime = Date.now();
      }
    } catch (err) {
      console.warn('[CONFIG] Failed to refresh settings from database:', err.message);
    } finally {
      isFetchingFull = null;
    }
  })();

  await isFetchingFull;
}

/**
 * Invalidate the memory cache
 */
export function invalidateConfigCache() {
  cacheMap.clear();
  lastFullFetchTime = 0;
}

/**
 * Get configuration value by key
 * Priority: 1. DB (app_settings) -> 2. process.env -> 3. Fallback default
 * 
 * @param {string} key Configuration key (case-insensitive search in DB, uppercase in process.env)
 * @param {string} fallback Default value if not found
 * @returns {Promise<string>} Resolved configuration value
 */
export async function getConfig(key, fallback = '') {
  if (!key) return fallback;

  await refreshAllSettingsCache();

  // 1. Check exact key in database cache
  if (cacheMap.has(key)) {
    const val = cacheMap.get(key)?.value;
    if (val !== undefined && val !== null && val !== '') return val;
  }

  // Check lowercase version in DB cache (e.g. moolre_vaskey vs MOOLRE_VAS_KEY)
  const lowerKey = key.toLowerCase();
  if (cacheMap.has(lowerKey)) {
    const val = cacheMap.get(lowerKey)?.value;
    if (val !== undefined && val !== null && val !== '') return val;
  }

  // 2. Check process.env
  const envVal = process.env[key] || process.env[key.toUpperCase()];
  if (envVal !== undefined && envVal !== null && envVal !== '') {
    return envVal;
  }

  // 3. Known variable default
  const known = KNOWN_ENV_VARIABLES.find(v => v.key === key || v.key === key.toUpperCase());
  if (known && known.default) {
    return known.default;
  }

  return fallback;
}

/**
 * Synchronous get for cases where async is not feasible,
 * checking memory cache first then process.env.
 */
export function getConfigSync(key, fallback = '') {
  if (!key) return fallback;

  if (cacheMap.has(key)) {
    const val = cacheMap.get(key)?.value;
    if (val !== undefined && val !== null && val !== '') return val;
  }

  const lowerKey = key.toLowerCase();
  if (cacheMap.has(lowerKey)) {
    const val = cacheMap.get(lowerKey)?.value;
    if (val !== undefined && val !== null && val !== '') return val;
  }

  const envVal = process.env[key] || process.env[key.toUpperCase()];
  if (envVal !== undefined && envVal !== null && envVal !== '') {
    return envVal;
  }

  const known = KNOWN_ENV_VARIABLES.find(v => v.key === key || v.key === key.toUpperCase());
  if (known && known.default) {
    return known.default;
  }

  return fallback;
}

/**
 * Fetch multiple keys at once
 */
export async function getConfigs(keys = []) {
  await refreshAllSettingsCache();
  const result = {};
  for (const k of keys) {
    result[k] = await getConfig(k);
  }
  return result;
}

/**
 * Upsert a configuration key in app_settings
 */
export async function setConfig(key, value, description = '') {
  if (!key) throw new Error('Setting key is required');

  const serviceClient = getServiceRoleClient();
  const stringVal = value === null || value === undefined ? '' : String(value);

  const { error } = await serviceClient
    .from('app_settings')
    .upsert({
      key: key.trim(),
      value: stringVal.trim(),
      description: description.trim() || undefined
    }, {
      onConflict: 'key'
    });

  if (error) throw error;

  // Update in-memory cache immediately
  cacheMap.set(key.trim(), {
    value: stringVal.trim(),
    description: description.trim()
  });

  return true;
}

/**
 * Delete a configuration key override from app_settings
 */
export async function deleteConfig(key) {
  if (!key) throw new Error('Setting key is required');

  const serviceClient = getServiceRoleClient();
  const { error } = await serviceClient
    .from('app_settings')
    .delete()
    .eq('key', key.trim());

  if (error) throw error;

  cacheMap.delete(key.trim());
  return true;
}
