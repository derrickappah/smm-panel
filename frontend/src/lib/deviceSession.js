/**
 * Client-Side Device Session Manager
 * 
 * Manages device initialization, cookie synchronization, and secondary localStorage signal.
 * NOTE: LocalStorage is a secondary consistency signal and NOT authoritative.
 */

import { supabase } from './supabase';

const CLIENT_DEVICE_SIGNAL_KEY = 'device_id_client';

/**
 * Initialize or synchronize device session with backend
 * @returns {Promise<{ success: boolean, isBanned: boolean, clientSignal?: string }>}
 */
export async function initDeviceSession() {
  try {
    let authHeader = {};
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        authHeader = { Authorization: `Bearer ${session.access_token}` };
      }
    } catch (e) {
      // Session unavailable
    }

    const response = await fetch('/api/auth/device-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader
      },
      credentials: 'include' // Crucial: send & receive HttpOnly cookies
    });

    const data = await response.json();

    if (response.status === 403 || data.isBanned) {
      return { success: false, isBanned: true };
    }

    if (data.clientSignal) {
      const previousSignal = localStorage.getItem(CLIENT_DEVICE_SIGNAL_KEY);
      if (previousSignal && previousSignal !== data.clientSignal) {
        // Device signal refreshed or rotated
        console.debug('[DeviceSession] Client signal synchronized');
      }
      localStorage.setItem(CLIENT_DEVICE_SIGNAL_KEY, data.clientSignal);
    }

    return {
      success: !!data.success,
      isBanned: false,
      clientSignal: data.clientSignal
    };
  } catch (error) {
    console.warn('[DeviceSession] Non-blocking init error:', error.message);
    return { success: false, isBanned: false };
  }
}

/**
 * Pre-action verification to check if device is restricted
 * @returns {Promise<boolean>} true if allowed, false if restricted
 */
export async function checkDeviceAllowed() {
  try {
    const res = await fetch('/api/auth/check-device', {
      method: 'GET',
      credentials: 'include'
    });
    const data = await res.json();
    return data.allowed !== false && !data.isBanned;
  } catch (e) {
    return true; // Fail open for network glitches on client pre-check; backend verifyAuth strictly enforces
  }
}

/**
 * Pre-login verification to check if target account or current device is banned
 * @param {string} email - Email being logged into
 * @returns {Promise<boolean>} true if allowed, false if restricted
 */
export async function checkLoginAllowed(email) {
  try {
    const res = await fetch('/api/auth/check-login-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    return data.allowed !== false && !data.isBanned;
  } catch (e) {
    return true;
  }
}
