const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

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

    // Check if user is admin (optional optimization, but good for security logic)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = profile?.role === 'admin';

    // Fetch orders from database to get provider IDs and verify ownership
    let query = supabase
      .from('orders')
      .select('id, user_id, status, smmgen_order_id, smmcost_order_id, jbsmmpanel_order_id')
      .in('id', orderIds);

    // If not admin, restrict to own orders
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

    // Group orders by provider
    const smmGenOrders = orders.filter(o => o.smmgen_order_id && o.smmgen_order_id !== "order not placed at smm gen" && o.smmgen_order_id !== o.id);
    const smmCostOrders = orders.filter(o => o.smmcost_order_id && String(o.smmcost_order_id).toLowerCase() !== "order not placed at smmcost");
    const jbSmmPanelOrders = orders.filter(o => o.jbsmmpanel_order_id && String(o.jbsmmpanel_order_id).toLowerCase() !== "order not placed at jbsmmpanel");

    // Helper to map status
    const mapStatus = (status) => {
      if (!status) return null;
      const s = String(status).toLowerCase();
      if (s.includes('pending')) return 'pending';
      if (s.includes('processing') || s.includes('process')) return 'processing';
      if (s.includes('in progress') || s.includes('inprogress')) return 'in progress';
      if (s.includes('completed') || s.includes('complete')) return 'completed';
      if (s.includes('partial')) return 'partial';
      if (s.includes('canceled') || s.includes('cancelled') || s.includes('cancel')) return 'canceled';
      if (s.includes('refund')) return 'refunds';
      return null;
    };

    // Helper to process generic single-order checks (since most APIs don't support bulk status efficiently in this proxy setup yet)
    // In a real optimized scenario, we'd use provider bulk endpoints if available.
    // For now, we'll iterate with concurrency limit to respect rate limits.

    // Process SMMGen orders
    for (const order of smmGenOrders) {
      try {
        const response = await axios.post(SMMGEN_API_URL, {
          key: SMMGEN_API_KEY,
          action: 'status',
          order: order.smmgen_order_id
        }, { timeout: 10000 });

        const newStatus = mapStatus(response.data?.status);
        if (newStatus && newStatus !== order.status) {
          updates.push({ id: order.id, status: newStatus });
          results.push({ id: order.id, old: order.status, new: newStatus, provider: 'smmgen' });
        }
      } catch (e) {
        console.error(`Failed to check SMMGen order ${order.id}:`, e.message);
      }
    }

    // Process SMMCost orders
    for (const order of smmCostOrders) {
      try {
        // SMMCost requires numeric ID for some actions, assume standard API
        // This is a placeholder as SMMCost API config isn't fully visible here, 
        // mimicking the single status check pattern.
        // If SMMCost uses a different URL or key, ensure they are imported/defined at top of file.
        // Assuming standard similar structure or reusing known env vars if defined.
        // NOTE: SMMCost variables (SMMCOST_API_URL, SMMCOST_API_KEY) need to be defined in server.js scope.
        // They were not in the visible snippet, so I will add a check.
        const SMMCOST_API_URL = process.env.SMMCOST_API_URL;
        const SMMCOST_API_KEY = process.env.SMMCOST_API_KEY;

        if (SMMCOST_API_URL && SMMCOST_API_KEY) {
          const response = await axios.post(SMMCOST_API_URL, {
            key: SMMCOST_API_KEY,
            action: 'status',
            order: order.smmcost_order_id
          }, { timeout: 10000 });

          const newStatus = mapStatus(response.data?.status);
          if (newStatus && newStatus !== order.status) {
            updates.push({ id: order.id, status: newStatus });
            results.push({ id: order.id, old: order.status, new: newStatus, provider: 'smmcost' });
          }
        }
      } catch (e) {
        console.error(`Failed to check SMMCost order ${order.id}:`, e.message);
      }
    }

    // Process JB SMM Panel orders
    for (const order of jbSmmPanelOrders) {
      try {
        const JBSMMPANEL_API_URL = process.env.JBSMMPANEL_API_URL;
        const JBSMMPANEL_API_KEY = process.env.JBSMMPANEL_API_KEY;

        if (JBSMMPANEL_API_URL && JBSMMPANEL_API_KEY) {
          const response = await axios.post(JBSMMPANEL_API_URL, {
            key: JBSMMPANEL_API_KEY,
            action: 'status',
            order: order.jbsmmpanel_order_id
          }, { timeout: 10000 });

          console.log(`JB SMM Panel response for ${order.id}:`, response.data);

          // Handle JB SMM Panel specific response formats (sometimes array, sometimes nested)
          let rawStatus = response.data?.status || response.data?.order?.status;
          // Also handle numeric status codes if JB uses them (0=pending, 1=processing, etc.)
          // Mapping logic copied from jbsmmpanel.js ideas
          if (rawStatus === undefined && Array.isArray(response.data) && response.data.length > 0) {
            rawStatus = response.data[0]?.status;
          }

          const newStatus = mapStatus(rawStatus);
          if (newStatus && newStatus !== order.status) {
            updates.push({ id: order.id, status: newStatus });
            results.push({ id: order.id, old: order.status, new: newStatus, provider: 'jbsmmpanel' });
          }
        }
      } catch (e) {
        console.error(`Failed to check JB SMM Panel order ${order.id}:`, e.message);
      }
    }

    // Batch update Supabase (or one by one)
    // Supabase JS client doesn't support bulk update with different values easily in one query without RPC.
    // So we'll iterate updates.
    let updatedCount = 0;
    for (const update of updates) {
      const { error } = await supabase
        .from('orders')
        .update({ status: update.status, last_status_check: new Date().toISOString() })
        .eq('id', update.id);

      if (!error) updatedCount++;
    }

    // Also update last_status_check for checked orders that didn't change status
    const unchangedIds = orders.map(o => o.id).filter(id => !updates.find(u => u.id === id));
    if (unchangedIds.length > 0) {
      await supabase
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

app.listen(PORT, () => {
  console.log(`🚀 SMMGen Proxy Server running on http://localhost:${PORT}`);
  console.log(`📡 SMMGen API URL: ${SMMGEN_API_URL}`);
  console.log(`🔑 API Key configured: ${SMMGEN_API_KEY ? 'Yes' : 'No'}`);
});

