import axios from 'axios';

/**
 * Universal Provider Client for placing orders and checking status
 */

const PROVIDER_CONFIGS = {
  smmgen: {
    url: process.env.SMMGEN_API_URL || 'https://smmgen.com/api/v2',
    key: process.env.SMMGEN_API_KEY || '05b299d99f4ef2052da59f7956325f3d'
  },
  jbsmmpanel: {
    url: process.env.JBSMMPANEL_API_URL || 'https://jbsmmpanel.com/api/v2',
    key: process.env.JBSMMPANEL_API_KEY || '917a0600022cbd9bfcfdinfosecc42eb549100642d52337'
  },
  smmcost: {
    url: process.env.SMMCOST_API_URL || 'https://api.smmcost.com',
    key: process.env.SMMCOST_API_KEY || 'PLACEHOLDER_ENTER_KEY_HERE'
  },
  worldofsmm: {
    url: process.env.WORLDOFSMM_API_URL || 'https://worldofsmm.com/api/v2',
    key: process.env.WORLDOFSMM_API_KEY || 'PLACEHOLDER_ENTER_KEY_HERE'
  },
  g1618: {
    url: process.env.G1618_API_URL || 'https://g1618.com/api/v2',
    key: process.env.G1618_API_KEY || 'PLACEHOLDER_ENTER_KEY_HERE'
  },
  oldsmm: {
    url: process.env.OLDSMM_API_URL || 'https://oldsmm.com/api/v2',
    key: process.env.OLDSMM_API_KEY || 'PLACEHOLDER_ENTER_KEY_HERE'
  },
  apiowner: {
    url: process.env.APIOWNER_API_URL || 'https://apiowner.com/api/v2',
    key: process.env.APIOWNER_API_KEY || '5e8719306090fc329877e777873fd33f'
  }
};

/**
 * Normalize provider key string (e.g. 'SM Engine' -> 'smmgen' or standard format)
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
    const payload = {
      key: cfg.key,
      action: 'add',
      service: String(service_id),
      link: link,
      quantity: Number(quantity)
    };

    const res = await axios.post(cfg.url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    });

    if (res.data && (res.data.order || res.data.order_id)) {
      const pOrderId = String(res.data.order || res.data.order_id);
      return {
        success: true,
        provider_order_id: pOrderId,
        raw_response: res.data
      };
    } else if (res.data && res.data.error) {
      return {
        success: false,
        error: res.data.error,
        raw_response: res.data
      };
    } else {
      return {
        success: false,
        error: res.data ? JSON.stringify(res.data) : 'Unknown provider response format',
        raw_response: res.data
      };
    }
  } catch (err) {
    const errMsg = err.response?.data?.error || err.message || 'Network error connecting to provider';
    return {
      success: false,
      error: errMsg,
      raw_response: err.response?.data || null
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
    const payload = {
      key: cfg.key,
      action: 'status',
      order: String(provider_order_id)
    };

    const res = await axios.post(cfg.url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    });

    if (res.data && res.data.status) {
      return {
        success: true,
        status: res.data.status,
        remains: res.data.remains || 0,
        raw_response: res.data
      };
    } else {
      return {
        success: false,
        error: res.data?.error || 'Failed to fetch status',
        raw_response: res.data
      };
    }
  } catch (err) {
    return {
      success: false,
      error: err.message,
      raw_response: err.response?.data || null
    };
  }
}
