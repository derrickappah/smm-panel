import korapayWebhookHandler from './payments/korapay/webhook.js';

/**
 * Korapay Payment Callback Handler (Legacy Alias)
 * Delegates to api/payments/korapay/webhook.js for atomic status updates and balance crediting.
 */
export default async function handler(req, res) {
  return korapayWebhookHandler(req, res);
}
