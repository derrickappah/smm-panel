/**
 * Authentication and Authorization Utilities
 * 
 * Provides helper functions for verifying Supabase JWT tokens and checking user permissions
 * in API endpoints.
 */

import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { getCached, setCached } from './redisClient.js';

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

  if (!token) {
    throw new Error('Missing or invalid authentication (no Bearer token provided in Authorization header)');
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase credentials not configured');
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Verify token
  let user = null;
  if (jwtSecret) {
    try {
      const decoded = jwt.verify(token, jwtSecret);
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
      // Token invalid/expired locally
    }
  }

  if (!user) {
    const { data: { user: remoteUser }, error } = await supabase.auth.getUser(token);
    if (error || !remoteUser) {
      throw new Error('Invalid or expired authentication token');
    }
    user = remoteUser;
  }

  if (!user) {
    throw new Error('Invalid or expired token (and cookie fallback failed)');
  }

  // Enforce origin and referer check: only accept requests originating from the official website
  const reqOrigin = req.headers.origin;
  const reqReferer = req.headers.referer;

  const allowedOrigins = [
    'https://boostupgh.com',
    'https://www.boostupgh.com'
  ];

  const isLocalHost = (url) => {
    if (!url) return false;
    return url.includes('localhost') || url.includes('127.0.0.1') || url.includes('::1');
  };

  const hasValidOrigin = reqOrigin && (allowedOrigins.includes(reqOrigin) || isLocalHost(reqOrigin));
  const hasValidReferer = reqReferer && (allowedOrigins.some(ao => reqReferer.startsWith(ao)) || isLocalHost(reqReferer));

  if (!hasValidOrigin && !hasValidReferer) {
    throw new Error('Access denied: Invalid request origin. Access is only permitted from the official web interface.');
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

  // Quick check on JWT token app_metadata or user role first
  if (user?.app_metadata?.role === 'admin' || user?.app_metadata?.role === 'superadmin' || user?.role === 'admin' || user?.role === 'superadmin') {
    return { user, supabase, isAdmin: true };
  }

  // Check Redis cache for user role first (300s TTL)
  const cacheKey = `smm:user:${user.id}:role`;
  let userRole = await getCached(cacheKey);

  if (!userRole) {
    // 1. Check profiles table
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    userRole = profile?.role;

    // 2. Fallback to users table if not found in profiles
    if (!userRole) {
      const { data: userRec } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      userRole = userRec?.role;
    }

    userRole = userRole || 'user';
    await setCached(cacheKey, userRole, 300);
  }

  const isAdmin = userRole === 'admin' || userRole === 'superadmin';

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
  let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseKey || supabaseKey.includes('PLACEHOLDER')) {
    supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
  }

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase credentials not configured');
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
