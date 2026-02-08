import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// GLOBAL FETCH INTERCEPTOR
// Enforce credentials: 'include' for all internal API requests to ensure session persistence
const originalFetch = window.fetch;
window.fetch = function (url, options = {}) {
  // Only intercept relative /api/ calls to avoid issues with external assets
  if (typeof url === 'string' && url.startsWith('/api/')) {
    if (!options.credentials) {
      options.credentials = 'include';
    }
  }
  return originalFetch(url, options);
};

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
