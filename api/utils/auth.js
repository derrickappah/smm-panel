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
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.replace('Bearer ', '');
  }

  // Fallback to cookie if header is missing (crucial for refresh persistence)
  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {});
    token = cookies['sb-access-token'];
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

  let user = null;

  // OPTIMIZATION: Try local JWT verification first
  if (jwtSecret) {
    try {
      // Verify token signature and expiration locally
      // This saves 1 network request per API call
      const decoded = jwt.verify(token, jwtSecret);

      // Construct user object from token payload
      // Supabase JWTs contain 'sub' which is the user ID and other claims
      if (decoded && decoded.sub) {
        user = {
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
      console.warn('Local JWT verification failed, falling back to auth.getUser:', jwtError.message);
      // Fall through to standard getUser check
    }
  } else {
    // Only warn once per cold start to avoid log spam
    if (!global.jwtSecretWarningShown) {
      console.warn('Performance Warning: SUPABASE_JWT_SECRET not set. Using slower auth.getUser() method.');
      global.jwtSecretWarningShown = true;
    }
  }

  // Fallback: If local verification failed or secret not set, use standard remote check
  if (!user) {
    const { data: { user: remoteUser }, error } = await supabase.auth.getUser(token);

    if (error || !remoteUser) {
      throw new Error('Invalid or expired token');
    }
    user = remoteUser;
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
