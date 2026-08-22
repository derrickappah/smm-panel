/**
 * Meta Pixel Event Tracking Utilities
 */

export const trackMetaEvent = (eventName, params = {}) => {
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    try {
      if (Object.keys(params).length > 0) {
        window.fbq('track', eventName, params);
      } else {
        window.fbq('track', eventName);
      }
    } catch (e) {
      console.warn('[Meta Pixel] Error tracking event:', eventName, e);
    }
  }
};

export const trackCustomMetaEvent = (eventName, params = {}) => {
  if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
    try {
      if (Object.keys(params).length > 0) {
        window.fbq('trackCustom', eventName, params);
      } else {
        window.fbq('trackCustom', eventName);
      }
    } catch (e) {
      console.warn('[Meta Pixel] Error tracking custom event:', eventName, e);
    }
  }
};
