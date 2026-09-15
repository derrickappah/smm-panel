/**
 * Global Toast Error Interceptor
 * 
 * Automatically sanitizes all calls to `toast.error(...)` across the entire application.
 * Prevents raw database errors, HTML dumps, and technical exceptions from leaking into the UI,
 * while preserving full debug logging in the browser console.
 */

import { toast } from 'sonner';
import { formatUserErrorMessage } from './errorHandler';

let isInitialized = false;

export function initToastSanitizer() {
  if (isInitialized) return;
  if (!toast || typeof toast.error !== 'function') return;

  const originalToastError = toast.error.bind(toast);

  toast.error = function (message, data) {
    // Preserve full developer visibility in browser console
    if (process.env.NODE_ENV !== 'production' || window.__DEBUG_ERRORS__) {
      console.error('[Toast Error Intercepted]:', message, data);
    }

    // If message is a function or JSX element, pass through
    if (typeof message === 'function' || (message && typeof message === 'object' && message.$$typeof)) {
      return originalToastError(message, data);
    }

    // Sanitize the message
    const sanitizedMessage = formatUserErrorMessage(message);
    return originalToastError(sanitizedMessage, data);
  };

  isInitialized = true;
  console.log('[Security] Global Toast Sanitizer initialized successfully.');
}

// Auto-run on import as well
initToastSanitizer();

export default initToastSanitizer;
