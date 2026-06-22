import React, { useEffect, useRef, useState } from 'react';

/**
 * Cloudflare Turnstile CAPTCHA component.
 * Integrates directly with window.turnstile API.
 */
export const Turnstile = ({ onSuccess, siteKey }) => {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const [scriptFailed, setScriptFailed] = useState(false);

  useEffect(() => {
    // Default to the Cloudflare always-pass testing key if none is configured
    const key = siteKey || process.env.REACT_APP_CLOUDFLARE_TURNSTILE_SITEKEY || '1x00000000000000000000AA';
    
    let intervalId;
    let attempts = 0;

    const renderWidget = () => {
      if (window.turnstile && containerRef.current) {
        clearInterval(intervalId);
        setScriptFailed(false);
        try {
          // If a widget was previously rendered, clean it up first
          if (widgetIdRef.current !== null) {
            window.turnstile.remove(widgetIdRef.current);
          }
          
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: key,
            callback: (token) => {
              onSuccess(token);
            },
            'error-callback': () => {
              console.error('Turnstile verification failed or expired');
              onSuccess(''); // Reset token on error
            },
            'expired-callback': () => {
              console.warn('Turnstile token expired');
              onSuccess(''); // Reset token on expiration
            },
            theme: 'light',
          });
        } catch (err) {
          console.error('Failed to render Turnstile widget:', err);
        }
      } else {
        attempts++;
        if (attempts > 50) {
          console.warn('Turnstile script failed to load after 10 seconds');
          setScriptFailed(true);
          clearInterval(intervalId);
        }
      }
    };

    // Check every 200ms until the Turnstile library is loaded on window
    intervalId = setInterval(renderWidget, 200);

    return () => {
      clearInterval(intervalId);
      if (widgetIdRef.current !== null && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, [siteKey, onSuccess]);

  return (
    <div className="flex flex-col items-center justify-center my-4">
      <div ref={containerRef} />
      {scriptFailed && (
        <p className="text-xs text-red-500 text-center font-medium mt-2 max-w-[280px]">
          Security check failed to load. If you are using an adblocker, privacy browser (e.g. Brave), or VPN, please disable it or whitelist this site to complete registration.
        </p>
      )}
    </div>
  );
};
