/**
 * Authentication and Authorization Utilities
 * 
 * Provides helper functions for verifying Supabase JWT tokens and checking user permissions
 * in API endpoints.
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Auto-ban one or more identifiers (ip / fingerprint) using the service role client.
 * Silently swallows errors so it never blocks the response path.
 * @param {Array<{type: string, value: string, reason: string}>} items
 */
async function autoBanIdentifiers(items) {
  try {
    const svc = getServiceRoleClient();
    const rows = items
      .filter(i => i.value && i.value.trim())
      .map(i => ({
        type: i.type,
        value: i.value.trim(),
        reason: i.reason || 'Automated ban: suspicious direct API access'
      }));

    if (rows.length === 0) return;

    // upsert so duplicate bans don't cause errors
    await svc
      .from('banned_identifiers')
      .upsert(rows, { onConflict: 'value', ignoreDuplicates: true });

    console.warn('[Security] Auto-banned identifiers:', rows.map(r => `${r.type}=${r.value}`).join(', '));
  } catch (err) {
    console.error('[Security] Failed to auto-ban identifier:', err.message);
  }
}

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

  // Verify that the user is not banned in the database
  const { data: isBanned, error: banError } = await supabase.rpc('is_user_banned', {
    p_user_id: user.id
  });

  if (banError) {
    console.error('Error checking ban status:', banError);
  } else if (isBanned) {
    throw new Error('Invalid or expired token (user is banned)');
  }

  // Get fingerprint from headers
  const fingerprint = req.headers['x-device-fingerprint'];
  const cleanFingerprint = fingerprint ? fingerprint.trim() : null;

  // Resolve client IP for potential auto-banning
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
                   req.headers['cf-connecting-ip'] ||
                   req.headers['x-real-ip'] ||
                   req.socket?.remoteAddress;

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

  if (!cleanFingerprint) {
    throw new Error('Access denied: Device fingerprint header is missing. Direct API access is not permitted.');
  }

  // Check if client IP or Device Fingerprint is banned BEFORE checking user profiles
  const valuesToCheck = [];
  if (clientIp && clientIp !== '127.0.0.1' && clientIp !== '::1') valuesToCheck.push(clientIp.trim());
  if (cleanFingerprint) valuesToCheck.push(cleanFingerprint);

  if (valuesToCheck.length > 0) {
    const { data: bannedItems, error: checkError } = await supabase
      .from('banned_identifiers')
      .select('type, value')
      .in('value', valuesToCheck);

    if (checkError) {
      console.error('Error checking banned identifiers:', checkError);
    } else if (bannedItems && bannedItems.length > 0) {
      const hasBannedIp = bannedItems.some(item => item.type === 'ip');
      if (hasBannedIp) {
        throw new Error('Access denied: Network or IP is blocked due to suspicious activity');
      } else {
        throw new Error('Access denied: Device is blocked due to suspicious activity');
      }
    }
  }

  // Get user profile to check / lock device fingerprint
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('device_fingerprint')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    console.error('Error fetching user profile in verifyAuth:', profileError);
    throw new Error('Access denied: Failed to verify user profile');
  }

  if (profile.device_fingerprint !== cleanFingerprint) {
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ device_fingerprint: cleanFingerprint })
      .eq('id', user.id);
    
    if (updateError) {
      console.error('Failed to update device fingerprint in profile:', updateError);
    }
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
