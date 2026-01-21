// Vercel Serverless Function for SMMGen Services
// This replaces the need for a separate backend server
// API keys are kept secure on the server side

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const SMMGEN_API_URL = process.env.SMMGEN_API_URL || 'https://smmgen.com/api/v2';
    const SMMGEN_API_KEY = process.env.SMMGEN_API_KEY;

    if (!SMMGEN_API_KEY) {
      return res.status(400).json({
        error: 'SMMGen API key not configured. Set SMMGEN_API_KEY in Vercel environment variables.'
      });
    }

    // Call SMMGen API
    const response = await fetch(SMMGEN_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        key: SMMGEN_API_KEY,
        action: 'services'
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
        error: errorData.error || errorData.message || 'Failed to fetch services'
      });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('SMMGen services error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to fetch services'
    });
  }
}

