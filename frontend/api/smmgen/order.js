// Vercel Serverless Function for SMMGen Orders
// This replaces the need for a separate backend server

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { service, link, quantity } = req.body;

    if (!service || !link || !quantity) {
      return res.status(400).json({ 
        error: 'Missing required fields: service, link, quantity' 
      });
    }

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
        action: 'add',
        service: service,
        link: link,
        quantity: quantity
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      return res.status(response.status).json({ 
        error: errorData.error || errorData.message || 'Failed to place order' 
      });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('SMMGen order error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to place order' 
    });
  }
}

