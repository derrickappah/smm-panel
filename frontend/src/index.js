import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

import { supabase } from "@/lib/supabase";
import "@/lib/sanitizeToast";
import ErrorBoundary from "@/components/ErrorBoundary";

// GLOBAL FETCH INTERCEPTOR
// Automatically inject Authorization: Bearer token for all internal API requests
const originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
  // Only intercept relative /api/ calls
  if (typeof url === 'string' && url.startsWith('/api/')) {
    // Inject Authorization header if we have a session
    const { data: { session } } = await supabase.auth.getSession();
    
    options.headers = options.headers || {};

    if (session?.access_token) {
      options.headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    // Explicitly remove credentials to migrate away from cookies
    if (options.credentials) {
      delete options.credentials;
    }
  }

  const response = await originalFetch(url, options);

  // Warning only - do not force log out on 401/403
  if ((response.status === 401 || response.status === 403) && typeof url === 'string' && url.startsWith('/api/')) {
    console.warn('Auth token expired or invalid (401/403). Session remains active as per configuration.');
  }

  return response;
};

// GLOBAL CLIENT MONITORING (Unhandled Exceptions & Rejected Promises)
if (typeof window !== 'undefined') {
  let lastReportedError = '';
  let lastReportedTime = 0;

  const reportClientError = (payload) => {
    const errorKey = `${payload.message}:${payload.url}`;
    const now = Date.now();
    // Deduplicate identical errors occurring within 30 seconds
    if (errorKey === lastReportedError && now - lastReportedTime < 30000) return;
    lastReportedError = errorKey;
    lastReportedTime = now;

    try {
      originalFetch('/api/monitoring/client-errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {});
    } catch { }
  };

  window.addEventListener('error', (event) => {
    // Ignore benign cross-origin script error noise
    if (event.message === 'Script error.' && !event.filename) return;

    reportClientError({
      message: event.message || 'Unknown runtime error',
      stack: event.error?.stack || null,
      url: window.location.href,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      type: 'window_onerror'
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason || 'Unhandled Promise Rejection');

    reportClientError({
      message,
      stack: reason instanceof Error ? reason.stack : null,
      url: window.location.href,
      type: 'unhandled_promise_rejection'
    });
  });
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
