const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
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
    const statusCode = error.response?.status || error.code === 'ECONNABORTED' ? 504 : 500;
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
    const statusCode = error.response?.status || error.code === 'ECONNABORTED' ? 504 : 500;
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
    const statusCode = error.response?.status || error.code === 'ECONNABORTED' ? 504 : 500;
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
    const statusCode = error.response?.status || error.code === 'ECONNABORTED' ? 504 : 500;
    res.status(statusCode).json({ 
      error: error.response?.data?.message || error.message || 'Failed to get balance' 
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 SMMGen Proxy Server running on http://localhost:${PORT}`);
  console.log(`📡 SMMGen API URL: ${SMMGEN_API_URL}`);
  console.log(`🔑 API Key configured: ${SMMGEN_API_KEY ? 'Yes' : 'No'}`);
});

