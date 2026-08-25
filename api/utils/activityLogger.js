/**
 * Activity Logging Utility
 * 
 * Provides helper functions for logging user and admin activities from API endpoints.
 * Logs are inserted into the activity_logs table with proper metadata including IP and user agent.
 */

import { createClient } from '@supabase/supabase-js';
import { sendSecurityAlertEmail } from './alertNotifier.js';

/**
 * Extract IP address from request
 * @param {Object} req - Request object
 * @returns {string|null} - IP address or null
 */
function getClientIp(req) {
  if (!req) return null;
  
  // Check various headers for IP address
  const forwarded = req.headers ? (req.headers['x-forwarded-for'] || req.headers['x-real-ip']) : null;
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  
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
  if (!req || !req.headers) return null;
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
 * Normalize arguments so logging functions support both object parameter and positional parameters
 */
function normalizeLogArgs(arg1, arg2, arg3, arg4, arg5) {
  if (typeof arg1 === 'object' && arg1 !== null) {
    return arg1;
  }
  return {
    user_id: arg1 || null,
    action_type: arg2,
    description: arg3,
    metadata: arg4 || {},
    req: arg5 || null
  };
}

/**
 * Log an activity to the activity_logs table
 * Supports both object argument `{ user_id, action_type, ... }` and positional arguments `(user_id, action_type, description, metadata, severity, req)`
 */
export async function logActivity(arg1, arg2, arg3, arg4, arg5, arg6) {
  try {
    let user_id, action_type, entity_type, entity_id, description, metadata, severity, req;

    if (typeof arg1 === 'object' && arg1 !== null) {
      ({
        user_id = null,
        action_type,
        entity_type = null,
        entity_id = null,
        description,
        metadata = {},
        severity = 'info',
        req = null
      } = arg1);
    } else {
      user_id = arg1 || null;
      action_type = arg2;
      description = arg3;
      metadata = arg4 || {};
      severity = arg5 || 'info';
      req = arg6 || null;
    }

    // Validate required fields
    if (!action_type || !description) {
      console.warn('Activity log missing required fields:', { action_type, description });
      return { success: false, error: 'Missing required fields' };
    }
    
    // Validate severity
    const validSeverities = ['info', 'warning', 'error', 'security', 'critical'];
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
    
    // Dispatch security alert email for critical security events only
    if (severity === 'security' || severity === 'critical') {
      sendSecurityAlertEmail({
        subject: `Security Alert: ${action_type}`,
        title: action_type.replace(/_/g, ' '),
        description: description,
        severity: severity,
        eventType: action_type,
        metadata: {
          action_type,
          user_id: user_id || 'unauthenticated',
          ip_address: ip_address || 'unknown',
          ...enrichedMetadata
        },
        dedupeKey: `${action_type}:${user_id || ip_address || 'global'}`
      }).catch(alertErr => console.warn('[ACTIVITY LOGGER] Security alert email dispatch failed:', alertErr.message));
    }

    // Get Supabase client
    try {
      const supabase = getSupabaseClient();
      
      // Insert activity log
      const { error } = await supabase
        .from('activity_logs')
        .insert({
          user_id: user_id || null,
          action_type,
          entity_type: entity_type || null,
          entity_id: entity_id || null,
          description,
          metadata: enrichedMetadata,
          severity: severity === 'critical' ? 'security' : severity,
          ip_address,
          user_agent,
          created_at: new Date().toISOString()
        });
      
      if (error) {
        console.error('Failed to log activity to Supabase:', error);
        return { success: false, error: error.message };
      }
    } catch (dbErr) {
      console.error('Database connection exception in activity logger:', dbErr.message);
      return { success: false, error: dbErr.message };
    }
    
    return { success: true };
  } catch (error) {
    console.error('Exception logging activity:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Log a security event (failed login, suspicious activity, etc.)
 */
export async function logSecurityEvent(arg1, arg2, arg3, arg4, arg5) {
  const opts = normalizeLogArgs(arg1, arg2, arg3, arg4, arg5);
  return logActivity({
    ...opts,
    severity: 'security'
  });
}

/**
 * Log a user action (login, logout, profile update, etc.)
 */
export async function logUserAction(arg1, arg2, arg3, arg4, arg5) {
  const opts = normalizeLogArgs(arg1, arg2, arg3, arg4, arg5);
  return logActivity({
    ...opts,
    severity: opts.severity || 'info'
  });
}

/**
 * Log an admin action
 */
export async function logAdminAction(arg1, arg2, arg3, arg4, arg5) {
  const opts = normalizeLogArgs(arg1, arg2, arg3, arg4, arg5);
  return logActivity({
    ...opts,
    severity: opts.severity || 'info'
  });
}

