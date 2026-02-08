/**
 * Authentication and Authorization Utilities
 * 
 * Provides helper functions for verifying Supabase JWT tokens and checking user permissions
 * in API endpoints.
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Verify Supabase JWT token from request and return authenticated user
 * @param {Object} req - Request object
 * @returns {Object} - { user, supabase } or throws error
 */
import jwt from 'jsonwebtoken';

/**
 * Verify Supabase JWT token from request and return authenticated user
 * Optimized to perform local verification to save API calls
 * @param {Object} req - Request object
 * @returns {Object} - { user, supabase } or throws error
 */
export async function verifyAuth(req) {
  let token = null;
  let tokenSource = null;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.replace('Bearer ', '');
    tokenSource = 'header';
  }

  // Fallback to cookie if header is missing (crucial for refresh persistence)
  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {});
    token = cookies['sb-access-token'];
    tokenSource = 'cookie';
  }

  if (!token) {
    throw new Error('Missing or invalid authentication (no token found in header or cookie)');
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
  const jwtSecret = process.env.SUPABASE_JWT_SECRET; // Must be set in env vars

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase credentials not configured');
  }

  // Create Supabase client with user's JWT token
  // We still create the client for RLS policies if needed later
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Helper to verify a specific token
  const verifyToken = async (tokenToVerify) => {
    let verifiedUser = null;

    // 1. Try local JWT verification first (faster)
    if (jwtSecret) {
      try {
        const decoded = jwt.verify(tokenToVerify, jwtSecret);
        if (decoded && decoded.sub) {
          verifiedUser = {
            id: decoded.sub,
            email: decoded.email,
            role: decoded.role,
            app_metadata: decoded.app_metadata,
            user_metadata: decoded.user_metadata,
            aud: decoded.aud,
            created_at: decoded.created_at
          };
        }
      } catch (jwtError) {
        // Token expired or invalid locally
      }
    }

    // 2. Fallback to Supabase auth.getUser() (slower but definitive)
    if (!verifiedUser) {
      const { data: { user: remoteUser }, error } = await supabase.auth.getUser(tokenToVerify);
      if (!error && remoteUser) {
        verifiedUser = remoteUser;
      }
    }

    return verifiedUser;
  };

  // STRATEGY: Try Header Token -> Fail? -> Try Cookie Token
  let user = null;

  // 1. Try Header Token
  if (token) {
    user = await verifyToken(token);
    if (!user) {
      console.warn('Header token verification failed (expired/invalid). Checking cookie fallback...');
    }
  }

  // 2. Fallback: Try Cookie Token if header failed or was missing
  if (!user && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {});

    const cookieToken = cookies['sb-access-token'];

    // Only try if we have a cookie token AND it's different from the header token we already tried
    if (cookieToken && cookieToken !== token) {
      console.log('Attempting authentication via fallback secure cookie...');
      user = await verifyToken(cookieToken);
      if (user) {
        tokenSource = 'cookie';
        console.log('✅ Auth rescued by secure cookie fallback!');
      }
    }
  }

  // 3. CSRF Protection: If using cookie authentication for state-changing requests, verify origin
  if (tokenSource === 'cookie' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    const allowedOrigins = [
      'https://boostupgh.com',
      'https://www.boostupgh.com',
      'http://localhost:3000',
      'http://localhost:5173'
    ];

    let sourceOk = false;
    if (origin) {
      sourceOk = allowedOrigins.some(o => origin.startsWith(o));
    } else if (referer) {
      sourceOk = allowedOrigins.some(o => referer.startsWith(o));
    }

    if (!sourceOk) {
      console.error('CSRF Protection Blocked Request:', {
        method: req.method,
        origin,
        referer,
        tokenSource,
        path: req.url
      });
      throw new Error('Access denied: Invalid request origin. This event has been logged for security audit.');
    }
  }

  if (!user) {
    throw new Error('Invalid or expired token (and cookie fallback failed)');
  }

  return { user, supabase };
}

/**
 * Verify user has admin role
 * @param {Object} req - Request object
 * @returns {Object} - { user, supabase, isAdmin } or throws error
 */
export async function verifyAdmin(req) {
  const { user, supabase } = await verifyAuth(req);

  // Get user profile to check role
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (error) {
    throw new Error('Failed to fetch user profile');
  }

  const isAdmin = profile?.role === 'admin';

  if (!isAdmin) {
    throw new Error('Admin access required');
  }

  return { user, supabase, isAdmin };
}

/**
 * Verify user owns a transaction or is admin
 * @param {Object} req - Request object
 * @param {string} transactionId - Transaction UUID
 * @returns {Object} - { user, supabase, transaction, isAdmin } or throws error
 */
export async function verifyTransactionOwner(req, transactionId) {
  const { user, supabase } = await verifyAuth(req);

  // Get user profile to check role
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError) {
    throw new Error('Failed to fetch user profile');
  }

  const isAdmin = profile?.role === 'admin';

  // Get transaction
  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', transactionId)
    .single();

  if (txError || !transaction) {
    throw new Error('Transaction not found');
  }

  // Check ownership or admin
  if (!isAdmin && transaction.user_id !== user.id) {
    throw new Error('Access denied: You can only access your own transactions');
  }

  return { user, supabase, transaction, isAdmin };
}

/**
 * Get service role Supabase client (for admin operations)
 * @returns {Object} - Supabase client with service role
 */
export function getServiceRoleClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase service role credentials not configured');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
