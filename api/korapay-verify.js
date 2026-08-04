import korapayVerifyHandler from './payments/korapay/verify.js';

/**
 * Korapay Payment Verification (Legacy Alias)
 * Delegates directly to api/payments/korapay/verify.js to perform atomic status checks
 * and balance updates.
 */
export default async function handler(req, res) {
  return korapayVerifyHandler(req, res);
}
