import { getServiceRoleClient } from './auth.js';

const FALLBACK_MERCHANT_ID = process.env.EXPRESSPAY_MERCHANT_ID || '332604139135';
const FALLBACK_API_KEY = process.env.EXPRESSPAY_API_KEY || 'yMKBvZToq1Qkv4Vx7jFqs-Qs84utOyvl5zmfrhO27q-T2pi8YTuGAKdS9TcKFDK-VEbuTviKFqzMF3qtQ4O';
const FALLBACK_MODE = (process.env.EXPRESSPAY_MODE || 'sandbox').toLowerCase().trim();

/**
 * Get dynamic expressPay configuration.
 * Prioritizes database `app_settings` and falls back to environment variables.
 */
export async function getExpressPayConfig(supabaseClient = null) {
  try {
    const supabase = supabaseClient || getServiceRoleClient();
    const { data: settings, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', [
        'expresspay_merchant_id',
        'expresspay_api_key',
        'expresspay_mode',
        'payment_method_expresspay_enabled',
        'payment_method_expresspay_min_deposit'
      ]);

    if (error) {
      console.warn('[expressPay Config] Error reading app_settings, using fallback env:', error.message);
    }

    const settingsMap = (settings || []).reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {});

    const merchantId = settingsMap.expresspay_merchant_id || FALLBACK_MERCHANT_ID;
    const apiKey = settingsMap.expresspay_api_key || FALLBACK_API_KEY;
    const mode = (settingsMap.expresspay_mode || FALLBACK_MODE || 'sandbox').toLowerCase().trim();
    const isEnabled = settingsMap.payment_method_expresspay_enabled !== 'false';
    const minDeposit = parseFloat(settingsMap.payment_method_expresspay_min_deposit || '1');

    const isLive = mode === 'live' || mode === 'production';
    const baseUrl = isLive ? 'https://expresspaygh.com' : 'https://sandbox.expresspaygh.com';

    return {
      merchantId,
      apiKey,
      mode: isLive ? 'live' : 'sandbox',
      isLive,
      isEnabled,
      minDeposit: isNaN(minDeposit) ? 1 : minDeposit,
      submitUrl: `${baseUrl}/api/submit.php`,
      checkoutUrl: `${baseUrl}/payment?token=`,
      queryUrl: `${baseUrl}/api/query.php`
    };
  } catch (err) {
    console.error('[expressPay Config] Failed to load config:', err);
    const isLive = FALLBACK_MODE === 'live' || FALLBACK_MODE === 'production';
    const baseUrl = isLive ? 'https://expresspaygh.com' : 'https://sandbox.expresspaygh.com';
    return {
      merchantId: FALLBACK_MERCHANT_ID,
      apiKey: FALLBACK_API_KEY,
      mode: isLive ? 'live' : 'sandbox',
      isLive,
      isEnabled: true,
      minDeposit: 1,
      submitUrl: `${baseUrl}/api/submit.php`,
      checkoutUrl: `${baseUrl}/payment?token=`,
      queryUrl: `${baseUrl}/api/query.php`
    };
  }
}
