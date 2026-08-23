/**
 * Automated Test Suite: Persistent Device Identification and Ban System
 * 
 * Run with: node test/device-auth.test.js
 */

import assert from 'assert';
import {
  generateDeviceId,
  isValidDeviceId,
  hashDeviceId,
  parseCookies,
  getDeviceIdFromRequest,
  serializeDeviceCookie,
  isRequestSecure
} from '../api/utils/deviceAuth.js';

console.log('🧪 Starting Persistent Device Auth & Ban System Tests...\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (error) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${error.message}\n`);
  }
}

async function asyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (error) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${error.message}\n`);
  }
}

// 1. Device ID Generation & Entropy Tests
console.log('1. Device ID Generation & Entropy');
test('generateDeviceId returns 64-character hexadecimal string', () => {
  const id1 = generateDeviceId();
  const id2 = generateDeviceId();

  assert.strictEqual(typeof id1, 'string');
  assert.strictEqual(id1.length, 64);
  assert.match(id1, /^[0-9a-f]{64}$/);

  // Uniqueness / randomness test
  assert.notStrictEqual(id1, id2);
});

// 2. Identifier Validation Tests
console.log('\n2. Device ID Format Validation');
test('isValidDeviceId correctly identifies valid vs invalid tokens', () => {
  const validHex = generateDeviceId();
  const validUUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const tooShort = 'abc123';
  const empty = '';
  const maliciousSQL = "64charhexstring123456789012345678901234567890123456789012345678' OR '1'='1";
  const oversized = 'a'.repeat(200);

  assert.strictEqual(isValidDeviceId(validHex), true);
  assert.strictEqual(isValidDeviceId(validUUID), true);
  assert.strictEqual(isValidDeviceId(tooShort), false);
  assert.strictEqual(isValidDeviceId(empty), false);
  assert.strictEqual(isValidDeviceId(null), false);
  assert.strictEqual(isValidDeviceId(undefined), false);
  assert.strictEqual(isValidDeviceId(maliciousSQL), false);
  assert.strictEqual(isValidDeviceId(oversized), false);
});

// 3. HMAC-SHA256 Hashing Tests
console.log('\n3. HMAC-SHA256 Hashing & Secret Protection');
test('hashDeviceId computes consistent, deterministic 64-char HMAC digest', () => {
  const id = generateDeviceId();
  const hash1 = hashDeviceId(id);
  const hash2 = hashDeviceId(id);

  assert.strictEqual(typeof hash1, 'string');
  assert.strictEqual(hash1.length, 64);
  assert.match(hash1, /^[0-9a-f]{64}$/);
  assert.strictEqual(hash1, hash2);

  // Different IDs must produce different digests
  const otherId = generateDeviceId();
  const otherHash = hashDeviceId(otherId);
  assert.notStrictEqual(hash1, otherHash);

  // Hash must never equal raw ID
  assert.notStrictEqual(hash1, id);
});

// 4. Cookie Parsing & Serialization Tests
console.log('\n4. Cookie Parsing & Security Flags');
test('serializeDeviceCookie formats __Host- cookie on secure requests', () => {
  const deviceId = generateDeviceId();
  const cookieHeaderSecure = serializeDeviceCookie(deviceId, true);

  assert.match(cookieHeaderSecure, /^__Host-device_id=/);
  assert.match(cookieHeaderSecure, /HttpOnly/i);
  assert.match(cookieHeaderSecure, /Secure/i);
  assert.match(cookieHeaderSecure, /SameSite=Lax/i);
  assert.match(cookieHeaderSecure, /Path=\//i);
  assert.match(cookieHeaderSecure, /Max-Age=315360000/i);
});

test('serializeDeviceCookie uses fallback cookie name for local/insecure environments', () => {
  const deviceId = generateDeviceId();
  const cookieHeaderInsecure = serializeDeviceCookie(deviceId, false);

  assert.match(cookieHeaderInsecure, /^device_id=/);
  assert.match(cookieHeaderInsecure, /HttpOnly/i);
  assert.doesNotMatch(cookieHeaderInsecure, /Secure/i);
  assert.match(cookieHeaderInsecure, /Path=\//i);
});

test('parseCookies and getDeviceIdFromRequest extract authoritative cookie', () => {
  const testId = generateDeviceId();

  // Test 1: __Host-device_id present
  const req1 = {
    headers: {
      cookie: `__Host-device_id=${testId}; other_cookie=xyz; session=123`
    }
  };
  assert.strictEqual(getDeviceIdFromRequest(req1), testId);

  // Test 2: fallback device_id present
  const req2 = {
    headers: {
      cookie: `session=123; device_id=${testId}`
    }
  };
  assert.strictEqual(getDeviceIdFromRequest(req2), testId);

  // Test 3: No cookie
  const req3 = { headers: {} };
  assert.strictEqual(getDeviceIdFromRequest(req3), null);

  // Test 4: Malformed/tampered cookie value
  const req4 = {
    headers: {
      cookie: `__Host-device_id=invalid<script>; other=1`
    }
  };
  assert.strictEqual(getDeviceIdFromRequest(req4), null);
});

// 5. Simulated Ban Verification & Enforcement Logic
console.log('\n5. Ban Logic & Access Enforcement Simulation');
test('Banned device simulation throws generic access restriction error without leaking data', () => {
  const bannedDeviceHash = hashDeviceId(generateDeviceId());
  
  // Mock check simulation
  const checkStatus = (isBanned) => {
    if (isBanned) {
      const banError = new Error('Access to this service is currently unavailable.');
      banError.statusCode = 403;
      banError.code = 'DEVICE_RESTRICTED';
      throw banError;
    }
    return { allowed: true };
  };

  // Active device
  assert.deepStrictEqual(checkStatus(false), { allowed: true });

  // Banned device
  assert.throws(
    () => checkStatus(true),
    (err) => {
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.code, 'DEVICE_RESTRICTED');
      assert.strictEqual(err.message, 'Access to this service is currently unavailable.');
      // Ensure no raw identifiers or user details are present in error message
      assert.doesNotMatch(err.message, /banned user/i);
      assert.doesNotMatch(err.message, /hash/i);
      assert.doesNotMatch(err.message, /secret/i);
      return true;
    }
  );
});

// 6. Multi-Device Association Simulation
console.log('\n6. Multiple Devices per User & Anonymous Device Lifecycle');
test('Multiple devices can be hashed independently for the same user', () => {
  const userId = 'user_uuid_123456';
  const device1 = generateDeviceId();
  const device2 = generateDeviceId();

  const hash1 = hashDeviceId(device1);
  const hash2 = hashDeviceId(device2);

  const mockDb = [
    { id: 'rec_1', user_id: userId, device_id_hash: hash1, is_banned: false },
    { id: 'rec_2', user_id: userId, device_id_hash: hash2, is_banned: false }
  ];

  assert.strictEqual(mockDb.length, 2);
  assert.strictEqual(mockDb[0].user_id, mockDb[1].user_id);
  assert.notStrictEqual(mockDb[0].device_id_hash, mockDb[1].device_id_hash);
});

// Summary
console.log(`\n========================================`);
console.log(`🏁 Test Results: ${passedTests}/${totalTests} Passed`);
console.log(`========================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
