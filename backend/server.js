const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Import status mapping utilities
const {
  mapSMMGenStatus,
  mapSMMCostStatus,
  mapJBSMMPanelStatus
} = require('./utils/statusMapping');

// Response cache for SMMGen API calls
const responseCache = new Map();
const CACHE_TTL = {
  services: 5 * 60 * 1000, // 5 minutes
  balance: 2 * 60 * 1000,   // 2 minutes
  status: 30 * 1000,        // 30 seconds
  order: 0                  // No cache for orders
};

// Middleware
app.use(compression({ level: 6, threshold: 1024 })); // Compress responses > 1KB
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// SMMGen API configuration
const SMMGEN_API_URL = process.env.SMMGEN_API_URL || 'https://smmgen.com/api/v2';
const SMMGEN_API_KEY = process.env.SMMGEN_API_KEY || '05b299d99f4ef2052da59f7956325f3d';

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'SMMGen proxy server is running' });
});

// Helper function to get cached response
const getCachedResponse = (key) => {
  const cached = responseCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL[key]) {
    return cached.data;
  }
  return null;
};

// Helper function to set cached response
const setCachedResponse = (key, data) => {
  responseCache.set(key, {
    data,
    timestamp: Date.now()
  });
};

// Proxy endpoint to fetch services from SMMGen
app.post('/api/smmgen/services', async (req, res) => {
  try {
    if (!SMMGEN_API_KEY || SMMGEN_API_KEY.includes('your-smmgen')) {
      return res.status(400).json({
        error: 'SMMGen API key not configured. Please set SMMGEN_API_KEY in backend/.env'
      });
    }

    // Check cache first
    const cached = getCachedResponse('services');
    if (cached) {
      res.set({
        'Cache-Control': 'public, max-age=300', // 5 minutes
        'ETag': `"${Date.now()}"`
      });
      return res.json(cached);
    }

    // SMMGen API typically uses POST with action parameter
    const response = await axios.post(SMMGEN_API_URL, {
      key: SMMGEN_API_KEY,
      action: 'services'
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });

    // Cache the response
    setCachedResponse('services', response.data);

    res.set({
      'Cache-Control': 'public, max-age=300', // 5 minutes
      'ETag': `"${Date.now()}"`,
      'Last-Modified': new Date().toUTCString()
    });
    res.json(response.data);
  } catch (error) {
    console.error('SMMGen services error:', error.response?.data || error.message);
    const statusCode = error.response?.status || (error.code === 'ECONNABORTED' ? 504 : 500);
    res.status(statusCode).json({
      error: error.response?.data?.message || error.message || 'Failed to fetch services'
    });
  }
});

// Proxy endpoint to place order via SMMGen
app.post('/api/smmgen/order', async (req, res) => {
  try {
    const { service, link, quantity } = req.body;

    if (!service || !link || !quantity) {
      return res.status(400).json({
        error: 'Missing required fields: service, link, quantity'
      });
    }

    if (!SMMGEN_API_KEY || SMMGEN_API_KEY.includes('your-smmgen')) {
      return res.status(400).json({
        error: 'SMMGen API key not configured. Please set SMMGEN_API_KEY in backend/.env'
      });
    }

    // SMMGen API typically uses POST with action parameter
    const response = await axios.post(SMMGEN_API_URL, {
      key: SMMGEN_API_KEY,
      action: 'add',
      service: service,
      link: link,
      quantity: quantity
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 15000 // 15 second timeout for orders
    });

    // No cache for orders - they are unique operations
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.json(response.data);
  } catch (error) {
    console.error('SMMGen order error:', error.response?.data || error.message);
    const statusCode = error.response?.status || (error.code === 'ECONNABORTED' ? 504 : 500);
    res.status(statusCode).json({
      error: error.response?.data?.message || error.message || 'Failed to place order'
    });
  }
});

// Proxy endpoint to get order status from SMMGen
app.post('/api/smmgen/status', async (req, res) => {
  try {
    const { order } = req.body;

    if (!order) {
      return res.status(400).json({
        error: 'Missing required field: order'
      });
    }

    if (!SMMGEN_API_KEY || SMMGEN_API_KEY.includes('your-smmgen')) {
      return res.status(400).json({
        error: 'SMMGen API key not configured'
      });
    }

    // Check cache for status (short TTL since status changes frequently)
    const cacheKey = `status:${order}`;
    const cached = getCachedResponse('status');
    if (cached && cached[order]) {
      res.set({
        'Cache-Control': 'public, max-age=30', // 30 seconds
        'ETag': `"${Date.now()}"`
      });
      return res.json(cached[order]);
    }

    const response = await axios.post(SMMGEN_API_URL, {
      key: SMMGEN_API_KEY,
      action: 'status',
      order: order
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });

    // Cache the response (store by order ID)
    if (!responseCache.has('status') || !responseCache.get('status').data) {
      setCachedResponse('status', {});
    }
    const statusCache = responseCache.get('status');
    statusCache.data[order] = response.data;
    statusCache.timestamp = Date.now();

    res.set({
      'Cache-Control': 'public, max-age=30', // 30 seconds
      'ETag': `"${Date.now()}"`,
      'Last-Modified': new Date().toUTCString()
    });
    res.json(response.data);
  } catch (error) {
    console.error('SMMGen status error:', error.response?.data || error.message);
    const statusCode = error.response?.status || (error.code === 'ECONNABORTED' ? 504 : 500);
    res.status(statusCode).json({
      error: error.response?.data?.message || error.message || 'Failed to get order status'
    });
  }
});

// Proxy endpoint to get balance from SMMGen
app.post('/api/smmgen/balance', async (req, res) => {
  try {
    if (!SMMGEN_API_KEY || SMMGEN_API_KEY.includes('your-smmgen')) {
      return res.status(400).json({
        error: 'SMMGen API key not configured'
      });
    }

    // Check cache first
    const cached = getCachedResponse('balance');
    if (cached) {
      res.set({
        'Cache-Control': 'public, max-age=120', // 2 minutes
        'ETag': `"${Date.now()}"`
      });
      return res.json(cached);
    }

    const response = await axios.post(SMMGEN_API_URL, {
      key: SMMGEN_API_KEY,
      action: 'balance'
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });

    // Cache the response
    setCachedResponse('balance', response.data);

    res.set({
      'Cache-Control': 'public, max-age=120', // 2 minutes
      'ETag': `"${Date.now()}"`,
      'Last-Modified': new Date().toUTCString()
    });
    res.json(response.data);
  } catch (error) {
    console.error('SMMGen balance error:', error.response?.data || error.message);
    const statusCode = error.response?.status || (error.code === 'ECONNABORTED' ? 504 : 500);
    res.status(statusCode).json({
      error: error.response?.data?.message || error.message || 'Failed to get balance'
    });
  }
});

// Moolre API configuration
const MOOLRE_API_USER = process.env.MOOLRE_API_USER;
const MOOLRE_API_PUBKEY = process.env.MOOLRE_API_PUBKEY;
const MOOLRE_ACCOUNT_NUMBER = process.env.MOOLRE_ACCOUNT_NUMBER;

// Proxy endpoint to list Moolre transactions
app.post('/api/moolre-list-transactions', async (req, res) => {
  try {
    // Verify admin authentication via Supabase
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Missing or invalid authorization header'
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ error: 'Supabase credentials not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Get Moolre credentials
    if (!MOOLRE_API_USER || !MOOLRE_API_PUBKEY || !MOOLRE_ACCOUNT_NUMBER) {
      return res.status(500).json({
        error: 'Moolre is not configured on the server. Please contact support.'
      });
    }

    const {
      startDate,
      endDate,
      status,
      limit = 100,
      offset = 0
    } = req.body;

    // Build request body for Moolre API
    const moolreRequest = {
      type: 1,
      accountnumber: MOOLRE_ACCOUNT_NUMBER,
      ...(limit && { limit: limit }),
      ...(offset && { offset: offset }),
      ...(startDate && { startdate: startDate }),
      ...(endDate && { enddate: endDate }),
      ...(status && { status: status })
    };

    // Try multiple possible endpoints for listing transactions
    const possibleEndpoints = [
      'https://api.moolre.com/open/transact/list',
      'https://api.moolre.com/open/transact/query',
      'https://api.moolre.com/open/transact/history'
    ];

    let moolreResponse = null;
    let moolreData = null;
    let lastError = null;

    // Try each endpoint until one works
    for (const endpoint of possibleEndpoints) {
      try {
        console.log(`Trying Moolre endpoint: ${endpoint}`);
        moolreResponse = await axios.post(endpoint, moolreRequest, {
          headers: {
            'Content-Type': 'application/json',
            'X-API-USER': MOOLRE_API_USER,
            'X-API-PUBKEY': MOOLRE_API_PUBKEY
          },
          timeout: 15000
        });

        moolreData = moolreResponse.data;

        // If we get a successful response
        if (moolreResponse.status === 200 && (moolreData.status === 1 || moolreData.data || moolreData.transactions)) {
          console.log(`Successfully connected to Moolre endpoint: ${endpoint}`);
          break;
        } else {
          lastError = moolreData;
        }
      } catch (fetchError) {
        lastError = fetchError.response?.data || fetchError;
        continue;
      }
    }

    // If all endpoints failed
    if (!moolreResponse || moolreResponse.status !== 200 || (moolreData.status === 0 && !moolreData.data && !moolreData.transactions)) {
      return res.status(moolreResponse?.status || 500).json({
        success: false,
        error: moolreData?.message || lastError?.message || 'Failed to fetch transactions from Moolre API',
        code: moolreData?.code,
        details: moolreData || lastError
      });
    }

    // Parse response - handle different possible response formats
    let transactions = [];

    if (moolreData.data) {
      if (Array.isArray(moolreData.data)) {
        transactions = moolreData.data;
      } else if (moolreData.data.transactions && Array.isArray(moolreData.data.transactions)) {
        transactions = moolreData.data.transactions;
      } else if (moolreData.data.list && Array.isArray(moolreData.data.list)) {
        transactions = moolreData.data.list;
      } else if (moolreData.data.id || moolreData.data.externalref) {
        transactions = [moolreData.data];
      }
    } else if (moolreData.transactions && Array.isArray(moolreData.transactions)) {
      transactions = moolreData.transactions;
    } else if (moolreData.list && Array.isArray(moolreData.list)) {
      transactions = moolreData.list;
    }

    // Map transactions to consistent format
    const getChannelName = (channelCode) => {
      const channelMap = {
        13: 'MTN', 14: 'Vodafone', 15: 'AirtelTigo',
        '13': 'MTN', '14': 'Vodafone', '15': 'AirtelTigo',
        'MTN': 'MTN', 'VOD': 'Vodafone', 'AT': 'AirtelTigo'
      };
      return channelMap[channelCode] || channelCode || 'Unknown';
    };

    const formattedTransactions = transactions.map(tx => {
      const txstatus = tx.txstatus !== undefined ? tx.txstatus : tx.status;
      let status = 'pending';
      if (txstatus === 1) {
        status = 'success';
      } else if (txstatus === 2) {
        status = 'failed';
      }

      return {
        id: tx.id || tx.transaction_id || tx.moolre_id,
        externalref: tx.externalref || tx.reference || tx.external_ref,
        amount: tx.amount || 0,
        currency: tx.currency || 'GHS',
        status: status,
        txstatus: txstatus,
        payer: tx.payer || tx.phone || tx.phone_number,
        channel: tx.channel || tx.channel_code,
        channelName: tx.channelName || getChannelName(tx.channel || tx.channel_code),
        created_at: tx.created_at || tx.createdAt || tx.date || tx.timestamp,
        updated_at: tx.updated_at || tx.updatedAt || tx.modified_at,
        message: tx.message,
        code: tx.code,
        raw: tx
      };
    });

    return res.json({
      success: true,
      transactions: formattedTransactions,
      total: formattedTransactions.length,
      hasMore: formattedTransactions.length === limit,
      code: moolreData.code,
      message: moolreData.message
    });

  } catch (error) {
    console.error('Error fetching Moolre transactions:', error);
    return res.status(500).json({
      error: 'Failed to fetch transactions',
      message: error.message
    });
  }
});

// Bulk check order status endpoint (for both users and admins)
app.post('/api/check-orders-status', async (req, res) => {
  try {
    const { orderIds } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'Missing or invalid orderIds array' });
    }

    // Authenticate user via Supabase
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ error: 'Supabase credentials not configured' });
    }

    // Auth client (uses user token for identity/RLS)
    const authSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: { user }, error: authError } = await authSupabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Check if user is admin
    const { data: profile } = await authSupabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin';

    // Use service role client if admin to bypass RLS for bulk checks
    const dbClient = (isAdmin && supabaseServiceKey && supabaseServiceKey !== 'PLACEHOLDER_ENTER_SERVICE_ROLE_KEY_HERE')
      ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      })
      : authSupabase;

    // Fetch orders from database to get provider IDs and verify ownership
    let query = dbClient
      .from('orders')
      .select('id, user_id, status, smmgen_order_id, smmcost_order_id, jbsmmpanel_order_id')
      .in('id', orderIds.slice(0, 50));

    // If not admin, RLS will naturally restrict to own orders when using authSupabase
    // But we explicitly add the condition for clarity if not using elevated client
    if (!isAdmin) {
      query = query.eq('user_id', user.id);
    }

    const { data: orders, error: fetchError } = await query;

    if (fetchError) {
      throw fetchError;
    }

    if (!orders || orders.length === 0) {
      return res.json({ checked: 0, updated: 0, details: [] });
    }

    const results = [];
    const updates = [];
    const smmCostUrl = process.env.SMMCOST_API_URL;
    const smmCostKey = process.env.SMMCOST_API_KEY;
    const jbSmmUrl = process.env.JBSMMPANEL_API_URL;
    const jbSmmKey = process.env.JBSMMPANEL_API_KEY;

    // Process orders one by one (simplified for robustness)
    for (const order of orders) {
      let finalStatus = order.status;
      let someChanged = false;
      let provider = null;

      try {
        // Handle Combo Orders
        if (order.component_provider_order_ids && Array.isArray(order.component_provider_order_ids) && order.component_provider_order_ids.length > 0) {
          const updatedComponents = [];
          let allCompleted = true;
          let anyInProgress = false;
          let anyCanceled = false;

          for (const component of order.component_provider_order_ids) {
            if (!component.provider_order_id) {
              updatedComponents.push(component);
              allCompleted = false;
              continue;
            }

            let compStatus = component.status;
            try {
              let rawStatus = null;
              if (component.provider === 'smmgen') {
                const response = await axios.post(SMMGEN_API_URL, new URLSearchParams({
                  key: SMMGEN_API_KEY,
                  action: 'status',
                  order: component.provider_order_id
                }), { timeout: 10000 });
                rawStatus = response.data?.status || response.data?.Status;
                compStatus = mapSMMGenStatus(rawStatus);
              } else if (component.provider === 'smmcost' && smmCostUrl && smmCostKey) {
                const response = await axios.post(smmCostUrl, {
                  key: smmCostKey,
                  action: 'status',
                  order: parseInt(component.provider_order_id, 10)
                }, { timeout: 10000 });
                rawStatus = response.data?.status || response.data?.Status;
                compStatus = mapSMMCostStatus(rawStatus);
              } else if (component.provider === 'jbsmmpanel' && jbSmmUrl && jbSmmKey) {
                const response = await axios.post(jbSmmUrl, new URLSearchParams({
                  key: jbSmmKey,
                  action: 'status',
                  order: component.provider_order_id
                }), { timeout: 10000 });
                rawStatus = response.data?.status || response.data?.Status;
                compStatus = mapJBSMMPanelStatus(rawStatus);
              }

              if (compStatus !== component.status) {
                someChanged = true;
              }
            } catch (err) {
              console.error(`Failed to check component ${component.provider_order_id}:`, err.message);
            }

            const updatedComp = { ...component, status: compStatus };
            updatedComponents.push(updatedComp);

            if (compStatus !== 'completed') allCompleted = false;
            if (['in progress', 'processing', 'pending'].includes(compStatus)) anyInProgress = true;
            if (['canceled', 'cancelled', 'refunded'].includes(compStatus)) anyCanceled = true;
          }

          if (someChanged) {
            // Aggregated status logic
            if (allCompleted) finalStatus = 'completed';
            else if (anyCanceled && !anyInProgress) finalStatus = 'partial'; // Or canceled if all canceled
            else if (anyInProgress || someChanged) finalStatus = 'processing';

            updates.push({ id: order.id, status: finalStatus, component_provider_order_ids: updatedComponents });
            results.push({ id: order.id, old: order.status, new: finalStatus, provider: 'combo' });
          }
        }
        // Handle Single Orders (Existing Logic)
        else {
          let newStatus = null;
          let rawStatusResponse = null;

          if (order.smmgen_order_id && order.smmgen_order_id !== "order not placed at smm gen" && order.smmgen_order_id !== order.id) {
            provider = 'smmgen';
            const response = await axios.post(SMMGEN_API_URL, new URLSearchParams({
              key: SMMGEN_API_KEY,
              action: 'status',
              order: order.smmgen_order_id
            }), { timeout: 10000 });
            rawStatusResponse = response.data?.status || response.data?.Status;
            newStatus = mapSMMGenStatus(rawStatusResponse);
          }
          else if (order.smmcost_order_id && String(order.smmcost_order_id).toLowerCase() !== "order not placed at smmcost") {
            provider = 'smmcost';
            if (smmCostUrl && smmCostKey && smmCostKey !== 'PLACEHOLDER_ENTER_KEY_HERE') {
              const response = await axios.post(smmCostUrl, {
                key: smmCostKey,
                action: 'status',
                order: parseInt(order.smmcost_order_id, 10)
              }, { timeout: 10000 });
              rawStatusResponse = response.data?.status || response.data?.Status;
              newStatus = mapSMMCostStatus(rawStatusResponse);
            }
          }
          else if (order.jbsmmpanel_order_id && Number(order.jbsmmpanel_order_id) > 0) {
            provider = 'jbsmmpanel';
            if (jbSmmUrl && jbSmmKey) {
              const response = await axios.post(jbSmmUrl, new URLSearchParams({
                key: jbSmmKey,
                action: 'status',
                order: order.jbsmmpanel_order_id.toString()
              }), { timeout: 10000 });
              rawStatusResponse = response.data?.status || response.data?.Status;
              newStatus = mapJBSMMPanelStatus(rawStatusResponse);
            }
          }

          if (newStatus && newStatus !== order.status) {
            updates.push({ id: order.id, status: newStatus, provider });
            results.push({ id: order.id, old: order.status, new: newStatus, provider });
          }
        }
      } catch (e) {
        console.error(`Failed to check ${provider || 'unknown'} order ${order.id}:`, e.message);
      }
    }

    // Batch update order statuses in database
    let updatedCount = 0;
    if (updates.length > 0) {
      for (const update of updates) {
        const updatePayload = {
          status: update.status,
          last_status_check: new Date().toISOString()
        };

        if (update.component_provider_order_ids) {
          updatePayload.component_provider_order_ids = update.component_provider_order_ids;
        }

        const { error: updateError } = await dbClient
          .from('orders')
          .update(updatePayload)
          .eq('id', update.id);

        if (!updateError) {
          updatedCount++;
        } else {
          console.error(`Failed to update order ${update.id}:`, updateError.message);
        }
      }
    }

    // Also update last_status_check for checked orders that didn't change status
    const unchangedIds = orders.map(o => o.id).filter(id => !updates.find(u => u.id === id));
    if (unchangedIds.length > 0) {
      await dbClient
        .from('orders')
        .update({ last_status_check: new Date().toISOString() })
        .in('id', unchangedIds);
    }

    res.json({
      checked: orders.length,
      updated: updatedCount,
      details: results
    });

  } catch (error) {
    console.error('Check orders status error:', error);
    res.status(500).json({ error: 'Failed to check order statuses' });
  }
});

// Reward endpoints
app.post('/api/reward/check-reward-eligibility', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ error: 'Supabase credentials not configured' });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const today = new Date().toISOString().split('T')[0];

    const { data: settings, error: settingsError } = await supabase
      .from('reward_settings')
      .select('daily_deposit_limit')
      .single();

    if (settingsError || !settings) {
      return res.status(500).json({ error: 'Failed to fetch reward settings' });
    }

    const requiredDeposit = parseFloat(settings.daily_deposit_limit);

    const { data: deposits, error: depositsError } = await supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', user.id)
      .eq('type', 'deposit')
      .eq('status', 'approved')
      .gte('created_at', `${today}T00:00:00Z`)
      .lte('created_at', `${today}T23:59:59Z`);

    if (depositsError) throw depositsError;

    const totalDeposits = deposits?.reduce((sum, d) => sum + parseFloat(d.amount), 0) || 0;

    const { data: claims, error: claimError } = await supabase
      .from('daily_reward_claims')
      .select('*')
      .eq('user_id', user.id)
      .eq('claim_date', today);

    if (claimError) throw claimError;

    // Fetch all active reward tiers
    const { data: tiers, error: tiersError } = await supabase
      .from('reward_tiers')
      .select('*')
      .order('position', { ascending: true })
      .order('required_amount', { ascending: true }); // Fallback sort

    if (tiersError) throw tiersError;

    // If no tiers exist, fall back to legacy logic or return error
    // For now, let's assume migration seeded tiers. 
    // If empty, user can't claim anything.
    if (!tiers || tiers.length === 0) {
      return res.json({
        status: 'error',
        message: "No reward tiers configured.",
        data: { current: totalDeposits, tiers: [] }
      });
    }

    // Process tiers to determine status for EACH tier
    const tiersStatus = tiers.map(tier => {
      const isClaimed = claims?.some(c => c.tier_id === tier.id);
      const isUnlocked = totalDeposits >= parseFloat(tier.required_amount);

      return {
        ...tier,
        isClaimed,
        isUnlocked,
        progress: Math.min(100, (totalDeposits / parseFloat(tier.required_amount)) * 100)
      };
    });

    // Determine overall state for the UI (e.g. next unlocked tier)
    const nextTier = tiersStatus.find(t => !t.isUnlocked) || null;
    const claimableTier = tiersStatus.find(t => t.isUnlocked && !t.isClaimed);

    return res.json({
      status: 'success',
      data: {
        current: totalDeposits,
        tiers: tiersStatus,
        nextTier,
        claimableTier
      }
    });

  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.post('/api/reward/claim-reward', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { link, tier_id, reward_type = 'likes' } = req.body; // Expect tier_id now

    if (!link) return res.status(400).json({ error: 'Link is required' });
    if (!tier_id) return res.status(400).json({ error: 'Tier selection is required' });

    const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid or expired token' });

    const today = new Date().toISOString().split('T')[0];

    // 1. Fetch the specific Tier
    const { data: tier, error: tierError } = await supabase
      .from('reward_tiers')
      .select('*')
      .eq('id', tier_id)
      .single();

    if (tierError || !tier) return res.status(404).json({ error: 'Reward tier not found' });

    const requiredAmount = parseFloat(tier.required_amount);
    const rewardAmount = reward_type === 'views' ? tier.reward_views : tier.reward_likes;

    // 2. Verify Deposits
    const { data: deposits } = await supabase.from('transactions')
      .select('amount')
      .eq('user_id', user.id).eq('type', 'deposit').eq('status', 'approved')
      .gte('created_at', `${today}T00:00:00Z`).lte('created_at', `${today}T23:59:59Z`);

    const totalDeposits = deposits?.reduce((sum, d) => sum + parseFloat(d.amount), 0) || 0;

    if (totalDeposits < requiredAmount) {
      return res.status(400).json({ error: `Insufficient deposits for this tier. Need GHS ${requiredAmount}` });
    }

    // 3. Check for EXISTING claim for THIS tier
    const { data: existingClaim, error: claimCheckError } = await supabase
      .from('daily_reward_claims')
      .select('id')
      .eq('user_id', user.id)
      .eq('claim_date', today)
      .eq('tier_id', tier_id) // Check specific tier
      .maybeSingle();

    if (existingClaim) return res.status(400).json({ error: 'You have already claimed this reward tier today' });

    // 4. Insert Claim
    const { data: claim, error: insertError } = await supabase
      .from('daily_reward_claims')
      .insert({
        user_id: user.id,
        deposit_total: totalDeposits,
        link,
        claim_date: today,
        tier_id: tier.id,
        reward_type: reward_type,
        reward_amount: rewardAmount
      })
      .select().single();

    if (insertError) {
      if (insertError.code === '23505') return res.status(400).json({ error: 'Already claimed this tier today' });
      throw insertError;
    }

    res.json({ success: true, message: `Successfully claimed ${tier.name} reward!`, data: claim });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Admin: Get all Reward Tiers
app.get('/api/admin/reward-tiers', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    // ... (Standard Admin Auth Check - abstracted for brevity if possible, but repeating for safety)
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
    const token = authHeader.replace('Bearer ', '');

    const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ error: 'Invalid token' });

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const { data: tiers, error } = await supabase.from('reward_tiers').select('*').order('position');
    if (error) throw error;

    res.json(tiers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Upsert Reward Tier (Add or Update)
app.post('/api/admin/reward-tiers', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
    const token = authHeader.replace('Bearer ', '');
    const { id, name, required_amount, reward_likes, reward_views, position } = req.body;

    const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });

    const { data: { user } } = await supabase.auth.getUser(token);
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    let query;
    if (id) {
      // Update
      query = supabase.from('reward_tiers').update({ name, required_amount, reward_likes, reward_views, position, updated_at: new Date() }).eq('id', id);
    } else {
      // Insert
      query = supabase.from('reward_tiers').insert({ name, required_amount, reward_likes, reward_views, position });
    }

    const { data, error } = await query.select();
    if (error) throw error;

    res.json({ success: true, tier: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Delete Reward Tier
app.delete('/api/admin/reward-tiers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
    const token = authHeader.replace('Bearer ', '');

    const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });

    const { data: { user } } = await supabase.auth.getUser(token);
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const { error } = await supabase.from('reward_tiers').delete().eq('id', id);
    if (error) throw error;

    res.json({ success: true, message: 'Tier deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/update-reward-limit', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { daily_deposit_limit } = req.body;

    const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: { user } } = await supabase.auth.getUser(token);

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    const newLimit = parseFloat(daily_deposit_limit);

    const { data: current } = await supabase.from('reward_settings').select('*').single();
    const oldLimit = parseFloat(current.daily_deposit_limit);

    await supabase.from('reward_settings').update({
      daily_deposit_limit: newLimit, updated_by: user.id, updated_at: new Date().toISOString()
    }).eq('id', current.id);

    await supabase.from('reward_setting_logs').insert({ admin_id: user.id, old_value: oldLimit, new_value: newLimit });

    res.json({ success: true, message: 'Limit updated' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 SMM Proxy Server running on port ${PORT}`);
});
