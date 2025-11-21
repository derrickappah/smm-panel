const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// SMMGen API configuration
const SMMGEN_API_URL = process.env.SMMGEN_API_URL || 'https://smmgen.com/api/v2';
const SMMGEN_API_KEY = process.env.SMMGEN_API_KEY || '05b299d99f4ef2052da59f7956325f3d';

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'SMMGen proxy server is running' });
});

// Proxy endpoint to fetch services from SMMGen
app.post('/api/smmgen/services', async (req, res) => {
  try {
    if (!SMMGEN_API_KEY || SMMGEN_API_KEY.includes('your-smmgen')) {
      return res.status(400).json({ 
        error: 'SMMGen API key not configured. Please set SMMGEN_API_KEY in backend/.env' 
      });
    }

    // SMMGen API typically uses POST with action parameter
    const response = await axios.post(SMMGEN_API_URL, {
      key: SMMGEN_API_KEY,
      action: 'services'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('SMMGen services error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ 
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
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('SMMGen order error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ 
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

    const response = await axios.post(SMMGEN_API_URL, {
      key: SMMGEN_API_KEY,
      action: 'status',
      order: order
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('SMMGen status error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ 
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

    const response = await axios.post(SMMGEN_API_URL, {
      key: SMMGEN_API_KEY,
      action: 'balance'
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('SMMGen balance error:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ 
      error: error.response?.data?.message || error.message || 'Failed to get balance' 
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 SMMGen Proxy Server running on http://localhost:${PORT}`);
  console.log(`📡 SMMGen API URL: ${SMMGEN_API_URL}`);
  console.log(`🔑 API Key configured: ${SMMGEN_API_KEY ? 'Yes' : 'No'}`);
});

