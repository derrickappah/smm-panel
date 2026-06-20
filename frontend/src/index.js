import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

import { supabase } from "@/lib/supabase";
import { getDeviceFingerprint } from "@/utils/fingerprint";

// GLOBAL FETCH INTERCEPTOR
// Automatically inject Authorization: Bearer token for all internal API requests
const originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
  // Only intercept relative /api/ calls
  if (typeof url === 'string' && url.startsWith('/api/')) {
    // Inject Authorization header if we have a session
    const { data: { session } } = await supabase.auth.getSession();
    
    options.headers = {
      ...options.headers,
      'x-device-fingerprint': getDeviceFingerprint()
    };

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

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
