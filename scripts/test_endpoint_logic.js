// Local API Handler Security Test
// This script mocks requests to the modified API endpoints and verifies they
// return the correct HTTP status codes for unauthorized/unverified inputs.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Load env variables from frontend/.env
const envPath = path.resolve(__dirname, '../../../frontend/.env');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
    }
  });
}

// Mock responses
function createMockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.body = obj;
      return this;
    },
    end() {
      return this;
    }
  };
  return res;
}

async function runTests() {
  console.log('--- RUNNING SECURITY VERIFICATION TESTS ---');

  // Test 1: approve-paystack-deposit with missing Authorization header
  console.log('\nTest 1: approve-paystack-deposit (Missing Auth Header)');
  try {
    const approvePaystackModule = await import('../../../api/approve-paystack-deposit.js');
    const handler = approvePaystackModule.default;
    
    const req = {
      method: 'POST',
      headers: {},
      body: {
        transaction_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        reference: 'fake_ref_123'
      }
    };
    const res = createMockResponse();

    await handler(req, res);
    console.log(`Response status: ${res.statusCode}`);
    console.log('Response body:', res.body);
    if (res.statusCode === 401) {
      console.log('✅ SUCCESS: Correctly blocked with 401 Unauthorized');
    } else {
      console.log('❌ FAILURE: Expected 401');
    }
  } catch (err) {
    console.error('Test 1 error:', err);
  }

  // Test 2: KoraPay Webhook missing signature header
  console.log('\nTest 2: KoraPay Webhook (Missing Signature Header)');
  try {
    const korapayWebhookModule = await import('../../../api/payments/korapay/webhook.js');
    const handler = korapayWebhookModule.default;

    const req = {
      method: 'POST',
      headers: {},
      body: {
        event: 'charge.success',
        data: { reference: 'fake_ref' }
      }
    };
    const res = createMockResponse();

    await handler(req, res);
    console.log(`Response status: ${res.statusCode}`);
    console.log('Response body:', res.body);
    if (res.statusCode === 401 && res.body.error === 'Missing webhook signature') {
      console.log('✅ SUCCESS: Correctly blocked with 401 and "Missing webhook signature" error');
    } else {
      console.log('❌ FAILURE: Expected 401 Missing webhook signature');
    }
  } catch (err) {
    console.error('Test 2 error:', err);
  }

  // Test 3: KoraPay Webhook with invalid signature header
  console.log('\nTest 3: KoraPay Webhook (Invalid Signature Header)');
  try {
    const korapayWebhookModule = await import('../../../api/payments/korapay/webhook.js');
    const handler = korapayWebhookModule.default;

    // Set a dummy secret key if not set
    process.env.KORAPAY_SECRET_KEY = process.env.KORAPAY_SECRET_KEY || 'dummy_secret';

    const req = {
      method: 'POST',
      headers: {
        'x-korapay-signature': 'invalid_signature_hash'
      },
      body: {
        event: 'charge.success',
        data: { reference: 'fake_ref' }
      }
    };
    const res = createMockResponse();

    await handler(req, res);
    console.log(`Response status: ${res.statusCode}`);
    console.log('Response body:', res.body);
    if (res.statusCode === 401 && res.body.error === 'Invalid webhook signature') {
      console.log('✅ SUCCESS: Correctly blocked with 401 and "Invalid webhook signature" error');
    } else {
      console.log('❌ FAILURE: Expected 401 Invalid webhook signature');
    }
  } catch (err) {
    console.error('Test 3 error:', err);
  }

  // Test 4: Secure Payment Callback missing signature
  console.log('\nTest 4: Secure Payment Callback (Missing Signature)');
  try {
    const secureCallbackModule = await import('../../../api/secure-payment-callback.js');
    const handler = secureCallbackModule.default;

    const req = {
      method: 'POST',
      headers: {
        'x-payment-provider': 'paystack'
      },
      // Mock stream reader for getRawBody
      on(event, callback) {
        if (event === 'data') {
          callback(Buffer.from(JSON.stringify({ event: 'charge.success' })));
        }
        if (event === 'end') {
          callback();
        }
      }
    };
    const res = createMockResponse();

    await handler(req, res);
    console.log(`Response status: ${res.statusCode}`);
    console.log('Response body:', res.body);
    if (res.statusCode === 401 && res.body.error === 'Missing webhook signature') {
      console.log('✅ SUCCESS: Correctly blocked with 401 and "Missing webhook signature" error');
    } else {
      console.log('❌ FAILURE: Expected 401 Missing webhook signature');
    }
  } catch (err) {
    console.error('Test 4 error:', err);
  }

  console.log('\n--- VERIFICATION TESTS COMPLETED ---');
}

runTests();
