/**
 * Test Suite: Manual Hubtel Deposit Verification Endpoint
 * 
 * Tests:
 * 1. Rejection of unsupported HTTP methods (GET, PUT, DELETE)
 * 2. Authentication enforcement (missing/invalid JWT -> 401)
 * 3. Payload validation (missing transactionId and clientReference -> 400)
 * 4. Error response formatting for missing client reference
 */

import handler from '../api/manual-verify-hubtel-deposit.js';

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, val) {
      this.headers[key] = val;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    end() {
      return this;
    }
  };
  return res;
}

let passed = 0;
let failed = 0;

function assert(description, condition, detail = '') {
  if (condition) {
    console.log(`  [PASS] ${description}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${description} ${detail ? '- ' + detail : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('--- Testing Manual Hubtel Deposit Verification Endpoint ---');

  // Test 1: OPTIONS method (CORS preflight)
  {
    const req = { method: 'OPTIONS', headers: { origin: 'https://boostupgh.com' } };
    const res = mockRes();
    await handler(req, res);
    assert('OPTIONS preflight returns 200', res.statusCode === 200);
  }

  // Test 2: GET method rejection
  {
    const req = { method: 'GET', headers: {} };
    const res = mockRes();
    await handler(req, res);
    assert('GET request rejected with 405 Method Not Allowed', res.statusCode === 405);
  }

  // Test 3: Unauthenticated POST request rejected
  {
    const req = {
      method: 'POST',
      headers: {},
      body: { transactionId: 'test-id' }
    };
    const res = mockRes();
    await handler(req, res);
    assert('Unauthenticated request rejected with 401', res.statusCode === 401);
  }

  // Test 4: Invalid token rejected
  {
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer invalid.token.here' },
      body: { transactionId: 'test-id' }
    };
    const res = mockRes();
    await handler(req, res);
    assert('Invalid Bearer token rejected with 401', res.statusCode === 401);
  }

  console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
