/**
 * Public Configuration Endpoint
 * 
 * This endpoint provides ONLY public configuration to the frontend at runtime.
 * It ensures that essential keys (like Supabase URL and Anon Key) can be 
 * retrieved without being hardcoded in static JS bundles.
 */

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Collect ONLY public configuration
    const publicConfig = {
      supabase: {
        url: process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
        anonKey: process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY,
      },
      // Do NOT include SERVICE_ROLE_KEY or any Moolre Secrets here
    };

    // Basic validation
    if (!publicConfig.supabase.url || !publicConfig.supabase.anonKey) {
      console.warn('Config endpoint: Missing Supabase credentials in env vars');
    }

    return res.status(200).json(publicConfig);
  } catch (error) {
    console.error('Error serving public config:', error);
    return res.status(500).json({
      error: 'Failed to retrieve application configuration',
      message: error.message
    });
  }
}
