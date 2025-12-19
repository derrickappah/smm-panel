/**
 * Activity Logging Utility
 * 
 * Provides helper functions for logging user and admin activities from API endpoints.
 * Logs are inserted into the activity_logs table with proper metadata including IP and user agent.
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Extract IP address from request
 * @param {Object} req - Request object
 * @returns {string|null} - IP address or null
 */
function getClientIp(req) {
  if (!req) return null;
  
  // Check various headers for IP address
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return realIp;
  }
  
  // Fallback to connection remote address
  if (req.connection && req.connection.remoteAddress) {
    return req.connection.remoteAddress;
  }
  
  if (req.socket && req.socket.remoteAddress) {
    return req.socket.remoteAddress;
  }
  
  return null;
}

/**
 * Extract user agent from request
 * @param {Object} req - Request object
 * @returns {string|null} - User agent string or null
 */
function getUserAgent(req) {
  if (!req) return null;
  return req.headers['user-agent'] || null;
}

/**
 * Get Supabase client for logging
 * Uses service role key if available, otherwise uses anon key
 * @returns {Object} - Supabase client
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl) {
    throw new Error('Supabase URL not configured');
  }
  
  // Prefer service role key for logging (bypasses RLS)
  const key = supabaseServiceKey || supabaseAnonKey;
  if (!key) {
    throw new Error('Supabase key not configured');
  }
  
  return createClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

/**
 * Log an activity to the activity_logs table
 * @param {Object} options - Logging options
 * @param {string} options.user_id - User ID who performed the action (nullable for system events)
 * @param {string} options.action_type - Type of action (e.g., 'login', 'order_placed', 'deposit_approved')
 * @param {string} [options.entity_type] - Type of entity affected (e.g., 'user', 'order', 'transaction')
 * @param {string} [options.entity_id] - ID of the affected entity
 * @param {string} options.description - Human-readable description
 * @param {Object} [options.metadata={}] - Additional context (old/new values, etc.)
 * @param {string} [options.severity='info'] - Severity level: 'info', 'warning', 'error', 'security'
 * @param {Object} [options.req=null] - Request object (for extracting IP and user agent)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function logActivity({
  user_id,
  action_type,
  entity_type = null,
  entity_id = null,
  description,
  metadata = {},
  severity = 'info',
  req = null
}) {
  try {
    // Validate required fields
    if (!action_type || !description) {
      console.warn('Activity log missing required fields:', { action_type, description });
      return { success: false, error: 'Missing required fields' };
    }
    
    // Validate severity
    const validSeverities = ['info', 'warning', 'error', 'security'];
    if (!validSeverities.includes(severity)) {
      severity = 'info';
    }
    
    // Extract IP and user agent from request
    const ip_address = req ? getClientIp(req) : null;
    const user_agent = req ? getUserAgent(req) : null;
    
    // Add IP and user agent to metadata if not already present
    const enrichedMetadata = {
      ...metadata,
      ...(ip_address && !metadata.ip_address ? { ip_address } : {}),
      ...(user_agent && !metadata.user_agent ? { user_agent } : {})
    };
    
    // Get Supabase client
    const supabase = getSupabaseClient();
    
    // Insert activity log
    const { error } = await supabase
      .from('activity_logs')
      .insert({
        user_id: user_id || null,
        action_type,
        entity_type,
        entity_id,
        description,
        metadata: enrichedMetadata,
        severity,
        ip_address,
        user_agent,
        created_at: new Date().toISOString()
      });
    
    if (error) {
      console.error('Failed to log activity:', error);
      // Don't throw - logging failures shouldn't break main functionality
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (error) {
    console.error('Exception logging activity:', error);
    // Don't throw - logging failures shouldn't break main functionality
    return { success: false, error: error.message };
  }
}

/**
 * Log a security event (failed login, suspicious activity, etc.)
 * @param {Object} options - Logging options
 * @param {string} [options.user_id] - User ID (nullable for failed logins)
 * @param {string} options.action_type - Type of security event
 * @param {string} options.description - Description of the security event
 * @param {Object} [options.metadata={}] - Additional context
 * @param {Object} [options.req=null] - Request object
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function logSecurityEvent({
  user_id = null,
  action_type,
  description,
  metadata = {},
  req = null
}) {
  return logActivity({
    user_id,
    action_type,
    description,
    metadata,
    severity: 'security',
    req
  });
}

/**
 * Log a user action (login, logout, profile update, etc.)
 * @param {Object} options - Logging options
 * @param {string} options.user_id - User ID
 * @param {string} options.action_type - Type of action
 * @param {string} options.description - Description
 * @param {Object} [options.metadata={}] - Additional context
 * @param {Object} [options.req=null] - Request object
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function logUserAction({
  user_id,
  action_type,
  description,
  metadata = {},
  req = null
}) {
  return logActivity({
    user_id,
    action_type,
    description,
    metadata,
    severity: 'info',
    req
  });
}

/**
 * Log an admin action
 * @param {Object} options - Logging options
 * @param {string} options.user_id - Admin user ID
 * @param {string} options.action_type - Type of admin action
 * @param {string} [options.entity_type] - Type of entity affected
 * @param {string} [options.entity_id] - ID of entity affected
 * @param {string} options.description - Description
 * @param {Object} [options.metadata={}] - Additional context
 * @param {Object} [options.req=null] - Request object
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function logAdminAction({
  user_id,
  action_type,
  entity_type = null,
  entity_id = null,
  description,
  metadata = {},
  req = null
}) {
  return logActivity({
    user_id,
    action_type,
    entity_type,
    entity_id,
    description,
    metadata,
    severity: 'info',
    req
  });
}
