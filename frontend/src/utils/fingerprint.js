/**
 * Browser Fingerprinting Utility
 * 
 * Generates a stable and deterministic device fingerprint based on browser characteristics.
 * This does not require external NPM packages and runs entirely client-side.
 */

export function getDeviceFingerprint() {
  if (typeof window === 'undefined') {
    return 'fp_server_side';
  }

  const components = [
    navigator.userAgent,
    navigator.language,
    screen.colorDepth,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset(),
    navigator.platform || 'unknown',
    navigator.hardwareConcurrency || 'unknown',
    navigator.deviceMemory || 'unknown',
    !!window.localStorage,
    !!window.sessionStorage
  ].join('###');

  // Deterministic 32-bit hashing algorithm (DJB2)
  let hash = 0;
  for (let i = 0; i < components.length; i++) {
    const char = components.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit signed integer
  }
  
  // Return hexadecimal representation prefixed with fp_
  return 'fp_' + Math.abs(hash).toString(16);
}
