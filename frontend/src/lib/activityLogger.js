/**
 * Frontend Activity Logger
 * 
 * Provides client-side utility for logging user activities.
 * Logs are inserted into the activity_logs table via Supabase with proper RLS.
 */

import { supabase } from './supabase';

/**
 * Get client-side metadata (browser info, screen size, etc.)
 * @returns {Object} - Client metadata
 */
function getClientMetadata() {
  if (typeof window === 'undefined') {
    return {};
  }

  return {
    browser: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    screen_width: window.screen?.width || null,
    screen_height: window.screen?.height || null,
    viewport_width: window.innerWidth || null,
    viewport_height: window.innerHeight || null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    url: window.location.href,
    referrer: document.referrer || null
  };
}

/**
 * Log a user activity to the activity_logs table
 * @param {Object} options - Logging options
 * @param {string} options.action_type - Type of action (e.g., 'login', 'order_placed', 'profile_updated')
 * @param {string} [options.entity_type] - Type of entity affected (e.g., 'user', 'order', 'transaction')
 * @param {string} [options.entity_id] - ID of the affected entity
 * @param {string} options.description - Human-readable description
 * @param {Object} [options.metadata={}] - Additional context
 * @param {string} [options.severity='info'] - Severity level: 'info', 'warning', 'error', 'security'
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function logUserActivity({
  action_type,
  entity_type = null,
  entity_id = null,
  description,
  metadata = {},
  severity = 'info'
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

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();

    // Get client-side metadata
    const clientMetadata = getClientMetadata();

    // Merge metadata
    const enrichedMetadata = {
      ...metadata,
      ...clientMetadata
    };

    // If user is not authenticated, send to server-side logging endpoint
    if (!user) {
      try {
        const res = await fetch('/api/auth/log-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action_type,
            description,
            metadata: enrichedMetadata,
            severity,
            email: metadata?.email || null
          })
        });
        return { success: res.ok };
      } catch (postErr) {
        console.warn('Failed to dispatch unauthenticated log event:', postErr);
        return { success: false, error: postErr.message };
      }
    }

    // Insert activity log for authenticated user
    const { error } = await supabase
      .from('activity_logs')
      .insert({
        user_id: user.id,
        action_type,
        entity_type,
        entity_id,
        description,
        metadata: enrichedMetadata,
        severity,
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error('Failed to log activity:', error);
      // Don't throw - logging failures shouldn't break user experience
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Exception logging activity:', error);
    // Don't throw - logging failures shouldn't break user experience
    return { success: false, error: error.message };
  }
}

/**
 * Log a security event (failed login, suspicious activity, etc.)
 * @param {Object} options - Logging options
 * @param {string} options.action_type - Type of security event
 * @param {string} options.description - Description of the security event
 * @param {Object} [options.metadata={}] - Additional context
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function logSecurityEvent({
  action_type,
  description,
  metadata = {}
}) {
  return logUserActivity({
    action_type,
    description,
    metadata,
    severity: 'security'
  });
}

/**
 * Log a login attempt (success or failure)
 * @param {Object} options - Logging options
 * @param {boolean} options.success - Whether login was successful
 * @param {string} [options.email] - Email attempted (for failed logins)
 * @param {string} [options.error] - Error message (for failed logins)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function logLoginAttempt({
  success,
  email = null,
  error = null
}) {
  if (success) {
    return logUserActivity({
      action_type: 'login_success',
      description: 'User logged in successfully',
      metadata: {
        email: email || null
      },
      severity: 'info'
    });
  } else {
    return logSecurityEvent({
      action_type: 'login_failed',
      description: `Failed login attempt${email ? ` for ${email}` : ''}`,
      metadata: {
        email: email || null,
        error: error || 'Unknown error'
      }
    });
  }
}

/**
 * Log a logout event
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function logLogout() {
  return logUserActivity({
    action_type: 'logout',
    description: 'User logged out',
    severity: 'info'
  });
}

/**
 * Log a profile update
 * @param {Object} options - Logging options
 * @param {Object} [options.changes] - Object with changed fields
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function logProfileUpdate({ changes = {} }) {
  return logUserActivity({
    action_type: 'profile_updated',
    entity_type: 'profile',
    description: 'User profile updated',
    metadata: {
      changes
    },
    severity: 'info'
  });
}
