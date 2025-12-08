// Simple request cache to prevent duplicate API calls
const requestCache = new Map();
const CACHE_DURATION = 5000; // 5 seconds

export const getCachedRequest = (key) => {
  const cached = requestCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.promise;
  }
  return null;
};

export const setCachedRequest = (key, promise) => {
  requestCache.set(key, {
    promise,
    timestamp: Date.now()
  });
  
  // Clean up after promise resolves
  promise.finally(() => {
    setTimeout(() => {
      requestCache.delete(key);
    }, CACHE_DURATION);
  });
  
  return promise;
};

export const clearCache = () => {
  requestCache.clear();
};

