/**
 * Upstash Redis Client & Caching Utility for Backend Proxy
 */
const { Redis } = require('@upstash/redis');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

let redis = null;

try {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token && !url.includes('YOUR_') && !token.includes('YOUR_')) {
    redis = new Redis({
      url,
      token,
    });
    console.log('[REDIS] Upstash Redis client initialized successfully.');
  } else {
    console.warn('[REDIS] Upstash Redis credentials not configured. Caching will be disabled.');
  }
} catch (err) {
  console.error('[REDIS] Failed to initialize Upstash Redis client:', err.message);
  redis = null;
}

/**
 * Get cached item from Redis
 * @param {string} key
 * @returns {Promise<any|null>}
 */
async function getCached(key) {
  if (!redis) return null;
  try {
    const data = await redis.get(key);
    if (data === null || data === undefined) return null;
    return typeof data === 'string' ? JSON.parse(data) : data;
  } catch (err) {
    console.error(`[REDIS ERROR] getCached(${key}):`, err.message);
    return null;
  }
}

/**
 * Set item in Redis with TTL
 * @param {string} key
 * @param {any} value
 * @param {number} ttlSeconds
 */
async function setCached(key, value, ttlSeconds = 300) {
  if (!redis) return;
  try {
    const stringified = typeof value === 'object' ? JSON.stringify(value) : value;
    await redis.set(key, stringified, { ex: ttlSeconds });
  } catch (err) {
    console.error(`[REDIS ERROR] setCached(${key}):`, err.message);
  }
}

/**
 * Delete cached item from Redis
 * @param {string} key
 */
async function deleteCached(key) {
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (err) {
    console.error(`[REDIS ERROR] deleteCached(${key}):`, err.message);
  }
}

/**
 * Check if Redis is operational
 * @returns {Promise<boolean>}
 */
async function isRedisAvailable() {
  if (!redis) return false;
  try {
    const ping = await redis.ping();
    return ping === 'PONG';
  } catch {
    return false;
  }
}

module.exports = {
  redis,
  getCached,
  setCached,
  deleteCached,
  isRedisAvailable
};
