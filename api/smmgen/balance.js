import { getCached, setCached } from '../utils/redisClient.js';
import { setCorsHeaders } from '../utils/corsHeaders.js';
import { verifyAdmin } from '../utils/auth.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { isAdmin } = await verifyAdmin(req).catch(() => ({ isAdmin: false }));
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized: Direct provider balance access restricted to admins' });
    }

    const cacheKey = 'smm:provider:smmgen:balance';
    const cachedBalance = await getCached(cacheKey);
    if (cachedBalance) {
      return res.status(200).json(cachedBalance);
    }

    const SMMGEN_API_URL = process.env.SMMGEN_API_URL || 'https://smmgen.com/api/v2';
    const SMMGEN_API_KEY = process.env.SMMGEN_API_KEY;

    if (!SMMGEN_API_KEY) {
      return res.status(400).json({
        error: 'SMMGen API key not configured'
      });
    }

    const response = await fetch(SMMGEN_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        key: SMMGEN_API_KEY,
        action: 'balance'
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));

      if (response.status === 400 && errorData.error === 'Unable to verify your domain submission.') {
        return res.status(502).json({
          error: 'SMMGen API Configuration Error',
          details: 'The request was incorrectly routed to the SMMGen documentation page instead of the API endpoint.',
          suggestion: 'Verify SMMGEN_API_URL environment variable is set to https://smmgen.com/api/v2',
          receivedError: errorData.error
        });
      }

      return res.status(response.status).json({
        error: errorData.error || errorData.message || 'Failed to get balance'
      });
    }

    const data = await response.json();
    await setCached(cacheKey, data, 180);
    return res.status(200).json(data);
  } catch (error) {
    console.error('SMMGen balance error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to get balance'
    });
  }
}

