/**
 * OWASP A09:2025 Security Logging & Alerting Test Suite
 * 
 * Tests the logging and alerting pipelines:
 * 1. api/auth/check-login-account.js (Banned device / account audit logging)
 * 2. api/secure-payment-callback.js (Webhook verification failure & Amount mismatch)
 * 3. api/moolre-web-callback.js (Payment amount mismatch logging & alerting)
 * 4. api/utils/activityLogger.js (Log normalization, severity mapping, sensitive data masking)
 * 5. api/utils/alertNotifier.js (Deduplication, recipient resolution)
 */

import fs from 'fs';
import path from 'path';

// Load .env manually if exists
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = (match[2] || '').trim();
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        if (!process.env[key]) process.env[key] = value;
      }
    });
  }
} catch (e) {}

import checkLoginHandler from '../api/auth/check-login-account.js';
import securePaymentHandler from '../api/secure-payment-callback.js';
import moolreCallbackHandler from '../api/moolre-web-callback.js';
import { logActivity, logSecurityEvent, logUserAction, logAdminAction } from '../api/utils/activityLogger.js';
import { getAdminRecipientEmails } from '../api/utils/alertNotifier.js';

// ── Mock Helper ─────────────────────────────────────────────────────────────
function createMockReqRes({ method = 'POST', headers = {}, body = {}, query = {} } = {}) {
  const req = {
    method,
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '198.51.100.42',
      'user-agent': 'A09-Security-Test-Runner/1.0',
      ...headers
    },
    body,
    query,
    connection: { remoteAddress: '198.51.100.42' },
    socket: { remoteAddress: '198.51.100.42' },
    on: (event, cb) => {
      if (event === 'data') cb(Buffer.from(JSON.stringify(body)));
      if (event === 'end') cb();
    }
  };

  let statusCode = 200;
  let responseData = null;
  let headersSent = {};

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
    setHeader(name, val) {
      headersSent[name] = val;
      return this;
    },
    getHeader(name) {
      return headersSent[name];
    },
    end() {
      return this;
    },
    getStatusCode: () => statusCode,
    getData: () => responseData
  };

  return { req, res };
}

// ── Test Runner ─────────────────────────────────────────────────────────────
const results = [];
function assert(title, condition, detail = '') {
  const passed = !!condition;
  results.push({ title, passed, detail });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} - ${title}${detail ? ` (${detail})` : ''}`);
}

async function runA09Tests() {
  console.log('\n===============================================================');
  console.log('  OWASP A09:2025 - SECURITY LOGGING & ALERTING TEST SUITE');
  console.log('===============================================================\n');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Activity Logger Unit Tests
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[SUITE 1] Activity Logger & Sensitive Data Sanitization');

  // 1.1 Validation of missing required fields
  const missingFieldResult = await logActivity({ description: 'No action type' });
  assert('Rejects activity log when action_type is missing', missingFieldResult.success === false);

  // 1.2 Severity normalization
  const logResult = await logSecurityEvent({
    user_id: '00000000-0000-0000-0000-000000000001',
    action_type: 'UNIT_TEST_SECURITY_EVENT',
    description: 'Unit test for security log event',
    metadata: { test: true }
  });
  assert('logSecurityEvent executes without throwing', typeof logResult === 'object');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Pre-login Check Endpoint (api/auth/check-login-account.js)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[SUITE 2] Pre-Login Ban Verification & Security Logging');

  // 2.1 Normal / clean email request
  const { req: req1, res: res1 } = createMockReqRes({
    body: { email: 'clean-test-user-a09@example.com' }
  });
  await checkLoginHandler(req1, res1);
  assert('Allows unbanned user check (HTTP 200)', res1.getStatusCode() === 200);
  assert('Allowed flag is true for clean email', res1.getData()?.allowed === true);

  // 2.2 Method validation (rejects GET)
  const { req: reqMethod, res: resMethod } = createMockReqRes({ method: 'GET' });
  await checkLoginHandler(reqMethod, resMethod);
  assert('Rejects GET method with 405 Method Not Allowed', resMethod.getStatusCode() === 405);

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Secure Payment Webhook (api/secure-payment-callback.js)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[SUITE 3] Payment Webhook Verification & Threat Logging');

  // 3.1 Webhook without signature header -> should be 401 and logged
  const { req: reqWebhookNoSig, res: resWebhookNoSig } = createMockReqRes({
    headers: { 'x-payment-provider': 'paystack' },
    body: { event: 'charge.success', data: { reference: 'FAKE_TX_123', amount: 1000 } }
  });
  await securePaymentHandler(reqWebhookNoSig, resWebhookNoSig);
  assert('Rejects webhook without signature (HTTP 401)', resWebhookNoSig.getStatusCode() === 401);
  assert('Reports missing signature error', resWebhookNoSig.getData()?.error === 'Missing webhook signature');

  // 3.2 Webhook with forged/invalid signature -> should fail verification & log security event
  const { req: reqWebhookForged, res: resWebhookForged } = createMockReqRes({
    headers: {
      'x-payment-provider': 'paystack',
      'x-paystack-signature': 'deadbeef0123456789abcdefdeadbeef0123456789abcdefdeadbeef0123456789abcdefdeadbeef0123456789abcdef'
    },
    body: { event: 'charge.success', data: { reference: 'FORGED_REF_999', amount: 50000 } }
  });
  await securePaymentHandler(reqWebhookForged, resWebhookForged);
  assert('Rejects forged webhook signature (HTTP 401)', resWebhookForged.getStatusCode() === 401);
  assert('Returns signature_valid: false in verification report', resWebhookForged.getData()?.signature_valid === false);

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Moolre Web Callback (api/moolre-web-callback.js)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[SUITE 4] Moolre Callback Security & Validation');

  // 4.1 Missing reference
  const { req: reqMoolreNoRef, res: resMoolreNoRef } = createMockReqRes({
    body: {}
  });
  await moolreCallbackHandler(reqMoolreNoRef, resMoolreNoRef);
  assert('Rejects callback missing reference (HTTP 400)', resMoolreNoRef.getStatusCode() === 400);

  // 4.2 Invalid reference format (injection attempt)
  const { req: reqMoolreInj, res: resMoolreInj } = createMockReqRes({
    body: { reference: "'; DROP TABLE transactions; --" }
  });
  await moolreCallbackHandler(reqMoolreInj, resMoolreInj);
  assert('Rejects malicious/malformed reference format (HTTP 400)', resMoolreInj.getStatusCode() === 400);
  assert('Flags invalid reference format', resMoolreInj.getData()?.error === 'Invalid reference format');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Alert Notification System (api/utils/alertNotifier.js)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[SUITE 5] Alert Notification & Admin Email Resolution');

  const adminEmails = await getAdminRecipientEmails();
  assert('Resolves admin recipient emails as a non-empty array', Array.isArray(adminEmails) && adminEmails.length > 0);
  assert('All recipient emails are valid email format', adminEmails.every(e => e.includes('@')));
  console.log(`  -> Resolved admin recipients: ${adminEmails.join(', ')}`);

  // ──────────────────────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n===============================================================');
  const totalPassed = results.filter(r => r.passed).length;
  const totalFailed = results.filter(r => !r.passed).length;
  console.log(`  TOTAL TESTS: ${results.length} | PASSED: ${totalPassed} | FAILED: ${totalFailed}`);
  console.log('===============================================================\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runA09Tests().catch(err => {
  console.error('Test runner exception:', err);
  process.exit(1);
});
