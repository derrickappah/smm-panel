/**
 * Universal Provider Client for placing orders and checking status
 * Uses native fetch (no external dependencies required)
 */

const PROVIDER_CONFIGS = {
  smmgen: {
    url: process.env.SMMGEN_API_URL || 'https://smmgen.com/api/v2',
    key: process.env.SMMGEN_API_KEY || ''
  },
  jbsmmpanel: {
    url: process.env.JBSMMPANEL_API_URL || 'https://jbsmmpanel.com/api/v2',
    key: process.env.JBSMMPANEL_API_KEY || ''
  },
  smmcost: {
    url: process.env.SMMCOST_API_URL || 'https://api.smmcost.com',
    key: process.env.SMMCOST_API_KEY || ''
  },
  worldofsmm: {
    url: process.env.WORLDOFSMM_API_URL || 'https://worldofsmm.com/api/v2',
    key: process.env.WORLDOFSMM_API_KEY || ''
  },
  g1618: {
    url: process.env.G1618_API_URL || 'https://g1618.com/api/v2',
    key: process.env.G1618_API_KEY || ''
  },
  oldsmm: {
    url: process.env.OLDSMM_API_URL || 'https://oldsmm.com/api/v2',
    key: process.env.OLDSMM_API_KEY || ''
  },
  apiowner: {
    url: process.env.APIOWNER_API_URL || 'https://apiowner.com/api/v2',
    key: process.env.APIOWNER_API_KEY || ''
  }
};

/**
 * Normalize provider key string (e.g. 'SM Engine' -> 'smmgen')
 */
export function normalizeProviderName(rawName) {
  if (!rawName) return 'smmgen';
  const name = String(rawName).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (name.includes('jbsmm')) return 'jbsmmpanel';
  if (name.includes('smmcost')) return 'smmcost';
  if (name.includes('worldof')) return 'worldofsmm';
  if (name.includes('g1618')) return 'g1618';
  if (name.includes('oldsmm')) return 'oldsmm';
  if (name.includes('apiowner')) return 'apiowner';
  return 'smmgen';
}

/**
 * Dispatch an order to a specified provider
 */
export async function dispatchProviderOrder({ provider, service_id, link, quantity }) {
  const pKey = normalizeProviderName(provider);
  const cfg = PROVIDER_CONFIGS[pKey] || PROVIDER_CONFIGS.smmgen;

  if (!cfg.key || cfg.key.includes('PLACEHOLDER')) {
    // Simulated order placement in demo/dev mode if key not set
    const mockId = 'SIM_' + Math.floor(100000 + Math.random() * 900000);
    return {
      success: true,
      provider_order_id: mockId,
      raw_response: { order: mockId, message: 'Simulated order created (key not set)' }
    };
  }

  try {
    const params = new URLSearchParams();
    params.append('key', cfg.key);
    params.append('action', 'add');
    params.append('service', String(service_id));
    params.append('link', String(link));
    params.append('quantity', String(quantity));

    const response = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const resData = await response.json();

    if (resData && (resData.order || resData.order_id)) {
      const pOrderId = String(resData.order || resData.order_id);
      return {
        success: true,
        provider_order_id: pOrderId,
        raw_response: resData
      };
    } else if (resData && resData.error) {
      return {
        success: false,
        error: resData.error,
        raw_response: resData
      };
    } else {
      return {
        success: false,
        error: resData ? JSON.stringify(resData) : 'Unknown provider response format',
        raw_response: resData
      };
    }
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Network error connecting to provider',
      raw_response: null
    };
  }
}

/**
 * Fetch order status from provider
 */
export async function fetchProviderOrderStatus({ provider, provider_order_id }) {
  const pKey = normalizeProviderName(provider);
  const cfg = PROVIDER_CONFIGS[pKey] || PROVIDER_CONFIGS.smmgen;

  if (!provider_order_id || String(provider_order_id).startsWith('SIM_')) {
    return {
      success: true,
      status: 'Completed',
      remains: 0,
      raw_response: { status: 'Completed', remains: 0 }
    };
  }

  try {
    const params = new URLSearchParams();
    params.append('key', cfg.key);
    params.append('action', 'status');
    params.append('order', String(provider_order_id));

    const response = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const resData = await response.json();

    if (resData && resData.status) {
      return {
        success: true,
        status: resData.status,
        remains: resData.remains || 0,
        raw_response: resData
      };
    } else {
      return {
        success: false,
        error: resData?.error || 'Failed to fetch status',
        raw_response: resData
      };
    }
  } catch (err) {
    return {
      success: false,
      error: err.message,
      raw_response: null
    };
  }
}
