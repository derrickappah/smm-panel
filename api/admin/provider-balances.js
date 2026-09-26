import { getCached, setCached } from '../utils/redisClient.js';
import { setCorsHeaders } from '../utils/corsHeaders.js';
import { verifyAdmin, getServiceRoleClient } from '../utils/auth.js';
import { getConfig } from '../utils/config.js';

const REQUEST_TIMEOUT = 12000; // 12 seconds per provider
const SUMMARY_CACHE_KEY = 'admin:provider_balances:summary';
const SUMMARY_CACHE_TTL = 120; // 2 minutes

// Definition of all 9 external SMM providers
const PROVIDERS = [
  {
    id: 'smmraja',
    name: 'SMM Raja',
    tab: 'smmraja',
    urlKey: 'SMMRAJA_API_URL',
    defaultUrl: 'https://www.smmraja.com/api/v3',
    keyKey: 'SMMRAJA_API_KEY',
    format: 'form'
  },
  {
    id: 'tiksta',
    name: 'Tiksta',
    tab: 'tiksta',
    urlKey: 'TIKSTA_API_URL',
    defaultUrl: 'https://tiksta.com/api/v2',
    keyKey: 'TIKSTA_API_KEY',
    format: 'form'
  },
  {
    id: 'apiowner',
    name: 'ApiOwner',
    tab: 'apiowner',
    urlKey: 'APIOWNER_API_URL',
    defaultUrl: 'https://apiowner.com/api/v2',
    keyKey: 'APIOWNER_API_KEY',
    format: 'form'
  },
  {
    id: 'oldsmm',
    name: 'OldSMM',
    tab: 'oldsmm',
    urlKey: 'OLDSMM_API_URL',
    defaultUrl: 'https://oldsmm.com/api/v2',
    keyKey: 'OLDSMM_API_KEY',
    format: 'form'
  },
  {
    id: 'smmcost',
    name: 'SMMCost',
    tab: 'smmcost',
    urlKey: 'SMMCOST_API_URL',
    defaultUrl: 'https://api.smmcost.com',
    keyKey: 'SMMCOST_API_KEY',
    format: 'json_smmcost'
  },
  {
    id: 'jbsmmpanel',
    name: 'JB SMM Panel',
    tab: 'jbsmmpanel',
    urlKey: 'JBSMMPANEL_API_URL',
    defaultUrl: 'https://jbsmmpanel.com/api/v2',
    keyKey: 'JBSMMPANEL_API_KEY',
    format: 'form'
  },
  {
    id: 'smmgen',
    name: 'SMMGen',
    tab: 'smmgen',
    urlKey: 'SMMGEN_API_URL',
    defaultUrl: 'https://smmgen.com/api/v2',
    keyKey: 'SMMGEN_API_KEY',
    format: 'json_smmgen'
  },
  {
    id: 'worldofsmm',
    name: 'World of SMM',
    tab: 'worldofsmm',
    urlKey: 'WORLDOFSMM_API_URL',
    defaultUrl: 'https://worldofsmm.com/api/v2',
    keyKey: 'WORLDOFSMM_API_KEY',
    format: 'form'
  },
  {
    id: 'g1618',
    name: 'G1618',
    tab: 'g1618',
    urlKey: 'G1618_API_URL',
    defaultUrl: 'https://g1618.com/api/v2',
    keyKey: 'G1618_API_KEY',
    format: 'form'
  }
];

/**
 * Fetch a single provider's live balance
 */
async function fetchSingleProviderBalance(provider, forceRefresh = false) {
  const cacheKey = `smm:provider:${provider.id}:balance`;

  if (!forceRefresh) {
    const cached = await getCached(cacheKey);
    if (cached && typeof cached.balance !== 'undefined') {
      const balanceNum = parseFloat(cached.balance) || 0;
      return {
        id: provider.id,
        name: provider.name,
        tab: provider.tab,
        balance: balanceNum,
        currency: cached.currency || 'USD',
        status: 'connected',
        error: null,
        fromCache: true
      };
    }
  }

  const apiUrl = await getConfig(provider.urlKey, provider.defaultUrl);
  const apiKey = await getConfig(provider.keyKey);

  if (!apiKey || apiKey.includes('PLACEHOLDER')) {
    return {
      id: provider.id,
      name: provider.name,
      tab: provider.tab,
      balance: null,
      currency: 'USD',
      status: 'not_configured',
      error: 'API key not configured',
      fromCache: false
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    let response;
    if (provider.format === 'json_smmcost') {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify({ action: 'balance', key: apiKey }),
        signal: controller.signal
      });
    } else if (provider.format === 'json_smmgen') {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: apiKey, action: 'balance' }),
        signal: controller.signal
      });
    } else {
      // standard form-urlencoded
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ key: apiKey, action: 'balance' }).toString(),
        signal: controller.signal
      });
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }

    const balanceNum = parseFloat(data.balance) || 0;
    const currency = data.currency || 'USD';

    // Cache provider's individual balance for 3 minutes
    await setCached(cacheKey, { balance: balanceNum, currency }, 180);

    return {
      id: provider.id,
      name: provider.name,
      tab: provider.tab,
      balance: balanceNum,
      currency,
      status: 'connected',
      error: null,
      fromCache: false
    };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      id: provider.id,
      name: provider.name,
      tab: provider.tab,
      balance: null,
      currency: 'USD',
      status: 'error',
      error: err.name === 'AbortError' ? 'Timeout' : err.message || 'Failed to fetch',
      fromCache: false
    };
  }
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { isAdmin } = await verifyAdmin(req).catch(() => ({ isAdmin: false }));
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: Admin access required' });
    }

    const isRefresh = req.query.refresh === 'true' || req.body?.refresh === true;

    // Check summary cache if not forcing refresh
    if (!isRefresh) {
      const cachedSummary = await getCached(SUMMARY_CACHE_KEY);
      if (cachedSummary) {
        return res.status(200).json(cachedSummary);
      }
    }

    // Retrieve USD->GHS exchange rate from app_settings
    let exchangeRate = 15.0;
    try {
      const supabase = getServiceRoleClient();
      const { data: setting } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'rate_catcher_exchange_rate')
        .maybeSingle();

      if (setting?.value) {
        const parsed = parseFloat(setting.value);
        if (!isNaN(parsed) && parsed > 0) {
          exchangeRate = parsed;
        }
      }
    } catch (e) {
      console.warn('[ProviderBalances] Could not load exchange rate, using default 15.0:', e.message);
    }

    // Query all 9 providers concurrently
    const results = await Promise.all(
      PROVIDERS.map(p => fetchSingleProviderBalance(p, isRefresh))
    );

    let totalUSD = 0;
    let activeCount = 0;
    let lowBalanceCount = 0;
    let errorCount = 0;

    const LOW_BALANCE_THRESHOLD = 5.0;

    const enrichedProviders = results.map(p => {
      const hasBalance = p.balance !== null && typeof p.balance === 'number';
      const balanceUSD = hasBalance ? p.balance : null;
      const balanceGHS = hasBalance ? Math.round((balanceUSD * exchangeRate) * 100) / 100 : null;
      const isLow = hasBalance && balanceUSD < LOW_BALANCE_THRESHOLD;

      if (hasBalance) {
        totalUSD += balanceUSD;
        activeCount++;
        if (isLow) lowBalanceCount++;
      } else if (p.status === 'error') {
        errorCount++;
      }

      return {
        ...p,
        balance: balanceUSD,
        balanceGHS,
        isLow
      };
    });

    const totalGHS = Math.round((totalUSD * exchangeRate) * 100) / 100;
    totalUSD = Math.round(totalUSD * 100) / 100;

    const summaryData = {
      success: true,
      exchangeRate,
      totals: {
        totalUSD,
        totalGHS,
        activeCount,
        lowBalanceCount,
        errorCount,
        totalProviders: PROVIDERS.length
      },
      providers: enrichedProviders,
      updatedAt: new Date().toISOString()
    };

    // Cache the aggregated summary
    await setCached(SUMMARY_CACHE_KEY, summaryData, SUMMARY_CACHE_TTL);

    return res.status(200).json(summaryData);
  } catch (error) {
    console.error('[ProviderBalances] Handler error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
