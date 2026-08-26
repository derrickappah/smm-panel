import { verifyAdmin, getServiceRoleClient } from '../utils/auth.js';
import { setCorsHeaders } from '../utils/corsHeaders.js';
import { KNOWN_ENV_VARIABLES, getConfig, setConfig, deleteConfig, invalidateConfigCache } from '../utils/config.js';
import { logActivity } from '../utils/activityLogger.js';

/**
 * Mask sensitive values for safe display
 */
function maskSecret(val) {
  if (!val) return '';
  const str = String(val);
  if (str.length <= 8) {
    return '••••••••';
  }
  const prefix = str.slice(0, 4);
  const suffix = str.slice(-4);
  return `${prefix}••••••••${suffix}`;
}

/**
 * API handler for Admin Environment Variables & System Configuration
 */
export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { user, isAdmin } = await verifyAdmin(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin authorization required' });
    }

    const action = req.body?.action || req.query?.action || 'get_env_vars';
    const serviceClient = getServiceRoleClient();

    // 1. ACTION: GET ALL ENVIRONMENT VARIABLES
    if (action === 'get_env_vars' || req.method === 'GET') {
      const revealKey = req.query?.revealKey || req.body?.revealKey;
      const revealAll = req.query?.revealAll === 'true' || req.body?.revealAll === true;

      // Fetch all database records in app_settings
      const { data: dbSettings, error: dbError } = await serviceClient
        .from('app_settings')
        .select('key, value, description');

      if (dbError) throw dbError;

      const dbMap = new Map();
      (dbSettings || []).forEach(item => {
        if (item && item.key) {
          dbMap.set(item.key, item);
        }
      });

      // Build structured response starting with known variables
      const processedKeys = new Set();
      const variables = KNOWN_ENV_VARIABLES.map(known => {
        processedKeys.add(known.key);
        processedKeys.add(known.key.toLowerCase());

        const dbEntry = dbMap.get(known.key) || dbMap.get(known.key.toLowerCase());
        const envVal = process.env[known.key] || process.env[known.key.toUpperCase()];

        let source = 'unset';
        let resolvedValue = '';

        if (dbEntry && dbEntry.value !== undefined && dbEntry.value !== null && dbEntry.value !== '') {
          source = 'database';
          resolvedValue = dbEntry.value;
        } else if (envVal !== undefined && envVal !== null && envVal !== '') {
          source = 'env';
          resolvedValue = envVal;
        } else if (known.default) {
          source = 'default';
          resolvedValue = known.default;
        }

        const isRevealed = revealAll || (revealKey && (revealKey === known.key || revealKey === known.key.toLowerCase()));
        const displayValue = (known.isSecret && !isRevealed) ? maskSecret(resolvedValue) : resolvedValue;

        return {
          key: known.key,
          label: known.label,
          category: known.category,
          isSecret: known.isSecret,
          description: dbEntry?.description || known.description,
          defaultValue: known.default,
          source,
          isConfigured: !!resolvedValue,
          value: displayValue,
          rawValue: isRevealed ? resolvedValue : undefined,
          isOverridden: !!dbEntry
        };
      });

      // Include custom database variables not in KNOWN_ENV_VARIABLES
      dbSettings?.forEach(item => {
        if (!processedKeys.has(item.key) && !processedKeys.has(item.key.toUpperCase())) {
          const keyUpper = item.key.toUpperCase();
          const isSecret = keyUpper.includes('SECRET') || keyUpper.includes('KEY') || keyUpper.includes('TOKEN') || keyUpper.includes('PASSWORD');
          const isRevealed = revealAll || (revealKey && revealKey === item.key);
          const displayValue = (isSecret && !isRevealed) ? maskSecret(item.value) : item.value;

          variables.push({
            key: item.key,
            label: item.key,
            category: 'custom',
            isSecret,
            description: item.description || 'Custom application setting',
            defaultValue: '',
            source: 'database',
            isConfigured: true,
            value: displayValue,
            rawValue: isRevealed ? item.value : undefined,
            isOverridden: true
          });
        }
      });

      return res.status(200).json({
        success: true,
        variables,
        categories: [
          { id: 'all', label: 'All Variables' },
          { id: 'smm', label: 'SMM Providers' },
          { id: 'payment', label: 'Payment Gateways' },
          { id: 'infrastructure', label: 'Database & Cache' },
          { id: 'security', label: 'System & Security' },
          { id: 'custom', label: 'Custom Variables' }
        ]
      });
    }

    // 2. ACTION: GET SINGLE VARIABLE VALUE (REVEAL)
    if (action === 'get_value') {
      const { key } = req.body || req.query;
      if (!key) return res.status(400).json({ error: 'Variable key is required' });

      const value = await getConfig(key);
      return res.status(200).json({
        success: true,
        key,
        value
      });
    }

    // 3. ACTION: SAVE SINGLE VARIABLE
    if (action === 'save_env_var') {
      const { key, value, description } = req.body;
      if (!key) return res.status(400).json({ error: 'Variable key is required' });

      await setConfig(key, value, description);

      // Audit Log
      await logActivity({
        user_id: user?.id,
        action_type: 'env_var_updated',
        entity_type: 'settings',
        entity_id: key,
        description: `Admin updated environment variable / setting: ${key}`,
        metadata: {
          key,
          has_value: !!value,
          description: description || ''
        },
        severity: 'security',
        req
      });

      return res.status(200).json({
        success: true,
        message: `Environment variable '${key}' saved successfully.`
      });
    }

    // 4. ACTION: BATCH SAVE VARIABLES
    if (action === 'save_batch') {
      const { variables } = req.body;
      if (!Array.isArray(variables) || variables.length === 0) {
        return res.status(400).json({ error: 'Variables array is required' });
      }

      for (const item of variables) {
        if (item && item.key) {
          await setConfig(item.key, item.value, item.description);
        }
      }

      await logActivity({
        user_id: user?.id,
        action_type: 'env_vars_batch_updated',
        entity_type: 'settings',
        description: `Admin batch updated ${variables.length} environment variables`,
        metadata: {
          keys: variables.map(v => v.key)
        },
        severity: 'security',
        req
      });

      return res.status(200).json({
        success: true,
        message: `${variables.length} environment variables updated successfully.`
      });
    }

    // 5. ACTION: DELETE DATABASE OVERRIDE (REVERT TO SYSTEM DEFAULT/ENV)
    if (action === 'delete_env_var') {
      const { key } = req.body;
      if (!key) return res.status(400).json({ error: 'Variable key is required' });

      await deleteConfig(key);

      await logActivity({
        user_id: user?.id,
        action_type: 'env_var_deleted',
        entity_type: 'settings',
        entity_id: key,
        description: `Admin deleted database override for variable: ${key}`,
        metadata: { key },
        severity: 'security',
        req
      });

      return res.status(200).json({
        success: true,
        message: `Database override for '${key}' removed. Reverted to default/environment.`
      });
    }

    // 6. ACTION: TEST CONNECTION / CREDENTIALS
    if (action === 'test_connection') {
      const { target, customUrl, customKey } = req.body;
      const startTime = Date.now();

      if (!target) {
        return res.status(400).json({ error: 'Target service to test is required' });
      }

      const normalizedTarget = target.toLowerCase().trim();

      // --- SMM PROVIDERS ---
      if (['smmgen', 'smmcost', 'jbsmmpanel', 'worldofsmm', 'g1618', 'oldsmm', 'apiowner'].includes(normalizedTarget)) {
        const urlKey = `${normalizedTarget.toUpperCase()}_API_URL`;
        const secretKey = `${normalizedTarget.toUpperCase()}_API_KEY`;

        const apiUrl = customUrl || await getConfig(urlKey);
        const apiKey = customKey || await getConfig(secretKey);

        if (!apiUrl || !apiKey) {
          return res.status(400).json({
            success: false,
            error: `Missing API URL or API Key for provider ${normalizedTarget}. Please configure both before testing.`
          });
        }

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 12000);

          // Standard SMM panels (including JBSMMPanel, SMMCost, WorldOfSMM, etc.) strictly require application/x-www-form-urlencoded
          const formData = new URLSearchParams({
            key: apiKey,
            action: 'balance'
          });

          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'BoostUp-Admin-ConfigTester/1.0'
            },
            body: formData.toString(),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          const latencyMs = Date.now() - startTime;
          const text = await response.text();
          let data;
          try {
            data = JSON.parse(text);
          } catch {
            data = { raw: text };
          }

          if (data && (data.balance !== undefined || data.status === 'success' || data.currency)) {
            return res.status(200).json({
              success: true,
              message: `Connection successful! Account balance: ${data.currency ? `${data.currency} ` : ''}${data.balance}`,
              latencyMs,
              data
            });
          } else if (data && data.error) {
            return res.status(200).json({
              success: false,
              message: `Provider rejected request: ${data.error}`,
              latencyMs,
              data
            });
          } else {
            return res.status(200).json({
              success: response.ok,
              message: response.ok ? `Ping successful (${response.status})` : `HTTP ${response.status}: ${text.slice(0, 100)}`,
              latencyMs,
              data
            });
          }
        } catch (fetchErr) {
          return res.status(200).json({
            success: false,
            message: `Connection failed: ${fetchErr.name === 'AbortError' ? 'Request timed out after 12s' : fetchErr.message}`,
            latencyMs: Date.now() - startTime
          });
        }
      }

      // --- PAYSTACK ---
      if (normalizedTarget === 'paystack') {
        const secretKey = customKey || await getConfig('PAYSTACK_SECRET_KEY');
        if (!secretKey) {
          return res.status(400).json({ success: false, error: 'Paystack Secret Key is not configured.' });
        }

        try {
          const response = await fetch('https://api.paystack.co/balance', {
            headers: {
              'Authorization': `Bearer ${secretKey}`,
              'Content-Type': 'application/json'
            }
          });
          const latencyMs = Date.now() - startTime;
          const data = await response.json();

          if (response.ok && data.status) {
            const balances = data.data?.map(b => `${b.currency} ${(b.balance / 100).toFixed(2)}`).join(', ') || 'Connected';
            return res.status(200).json({
              success: true,
              message: `Paystack connected! Balance: ${balances}`,
              latencyMs,
              data
            });
          } else {
            return res.status(200).json({
              success: false,
              message: `Paystack error: ${data.message || 'Authentication failed'}`,
              latencyMs,
              data
            });
          }
        } catch (err) {
          return res.status(200).json({
            success: false,
            message: `Paystack connection error: ${err.message}`,
            latencyMs: Date.now() - startTime
          });
        }
      }

      // --- KORAPAY ---
      if (normalizedTarget === 'korapay') {
        const secretKey = customKey || await getConfig('KORAPAY_SECRET_KEY');
        if (!secretKey) {
          return res.status(400).json({ success: false, error: 'Korapay Secret Key is not configured.' });
        }

        try {
          const response = await fetch('https://api.korapay.com/merchant/api/v1/balances', {
            headers: {
              'Authorization': `Bearer ${secretKey}`,
              'Content-Type': 'application/json'
            }
          });
          const latencyMs = Date.now() - startTime;
          const data = await response.json();

          if (response.ok && data.status) {
            return res.status(200).json({
              success: true,
              message: `Korapay connected successfully!`,
              latencyMs,
              data
            });
          } else {
            return res.status(200).json({
              success: false,
              message: `Korapay error: ${data.message || 'Authentication failed'}`,
              latencyMs,
              data
            });
          }
        } catch (err) {
          return res.status(200).json({
            success: false,
            message: `Korapay connection error: ${err.message}`,
            latencyMs: Date.now() - startTime
          });
        }
      }

      // --- MOOLRE ---
      if (normalizedTarget === 'moolre') {
        const vasKey = customKey || await getConfig('MOOLRE_VAS_KEY') || await getConfig('MOOLRE_API_PUBKEY');
        if (!vasKey) {
          return res.status(400).json({ success: false, error: 'Moolre VAS Key is not configured.' });
        }

        try {
          const response = await fetch('https://api.moolre.com/open/sms/status', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-VASKEY': vasKey
            },
            body: JSON.stringify({ type: 2 })
          });
          const latencyMs = Date.now() - startTime;
          const data = await response.json();

          if (data.status === 1 && data.data?.balance !== undefined) {
            return res.status(200).json({
              success: true,
              message: `Moolre SMS connected! Balance: ${data.data.balance} credits`,
              latencyMs,
              data
            });
          } else {
            return res.status(200).json({
              success: false,
              message: `Moolre error: ${data.message || 'Invalid VAS key'}`,
              latencyMs,
              data
            });
          }
        } catch (err) {
          return res.status(200).json({
            success: false,
            message: `Moolre connection error: ${err.message}`,
            latencyMs: Date.now() - startTime
          });
        }
      }

      // --- SUPABASE INFRASTRUCTURE ---
      if (normalizedTarget === 'supabase') {
        try {
          const { data, error } = await serviceClient.from('app_settings').select('count', { count: 'exact', head: true });
          const latencyMs = Date.now() - startTime;
          if (error) throw error;
          return res.status(200).json({
            success: true,
            message: `Supabase database & Service Role connected successfully!`,
            latencyMs
          });
        } catch (err) {
          return res.status(200).json({
            success: false,
            message: `Supabase connection failed: ${err.message}`,
            latencyMs: Date.now() - startTime
          });
        }
      }

      return res.status(400).json({
        success: false,
        error: `Testing for target '${target}' is not supported.`
      });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (error) {
    console.error('[ADMIN ENV SETTINGS ERROR]', error);
    return res.status(500).json({
      error: error.message || 'Internal error handling environment settings'
    });
  }
}
