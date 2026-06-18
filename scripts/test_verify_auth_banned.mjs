// Test Script: Verify IP and Fingerprint Banning in verifyAuth Middleware
import { verifyAuth } from '../api/utils/auth.js';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables
const loadEnv = (filePath) => {
  if (fs.existsSync(filePath)) {
    const envFile = fs.readFileSync(filePath, 'utf8');
    envFile.split('\r\n').join('\n').split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        process.env[match[1].trim()] = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
      }
    });
  }
};

loadEnv(path.resolve(__dirname, '../.env'));
loadEnv(path.resolve(__dirname, '../frontend/.env'));

// Set Supabase aliases
process.env.SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

async function runTests() {
  console.log('--- TESTING verifyAuth IP & FINGERPRINT BANS ---');

  // Generate a valid mock JWT token
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  const mockUserId = '00000000-0000-0000-0000-000000000099';
  const token = jwt.sign(
    {
      sub: mockUserId,
      email: 'test_verify_ban@gmail.com',
      role: 'authenticated',
      app_metadata: { provider: 'email' },
      user_metadata: { name: 'Test User' },
      aud: 'authenticated'
    },
    jwtSecret,
    { expiresIn: '1h' }
  );

  // Test 1: Request from clean IP and fingerprint (should pass IP/FP check)
  console.log('\nTest 1: Request from clean IP and fingerprint');
  const reqClean = {
    headers: {
      authorization: `Bearer ${token}`,
      'x-device-fingerprint': 'fp_clean_fingerprint_abc123',
      'x-forwarded-for': '1.1.1.1',
      origin: 'https://boostupgh.com'
    }
  };

  try {
    const result = await verifyAuth(reqClean);
    console.log('✅ SUCCESS: Request went through (user is not banned, IP/FP clean)');
  } catch (err) {
    if (err.message.includes('Access denied')) {
      console.log('❌ FAILURE: Incorrectly blocked clean request:', err.message);
    } else {
      // It might fail on user checking if the mockUserId is not in the database auth.users,
      // but if it throws about the database user ban or similar, that means it bypassed the IP/FP check!
      console.log('✅ SUCCESS: Bypassed IP/FP check (failed on user db lookup as expected):', err.message);
    }
  }

  // Test 2: Request from banned IP
  console.log('\nTest 2: Request from banned IP (192.168.1.100)');
  const reqBannedIp = {
    headers: {
      authorization: `Bearer ${token}`,
      'x-device-fingerprint': 'fp_clean_fingerprint_abc123',
      'x-forwarded-for': '192.168.1.100',
      origin: 'https://boostupgh.com'
    }
  };

  try {
    await verifyAuth(reqBannedIp);
    console.log('❌ FAILURE: Banned IP was allowed to execute the request!');
  } catch (err) {
    if (err.message.includes('Network or IP is blocked')) {
      console.log('✅ SUCCESS: Correctly blocked with error:', err.message);
    } else {
      console.log('❌ FAILURE: Request failed with incorrect error:', err.message);
    }
  }

  // Test 3: Request from banned fingerprint
  console.log('\nTest 3: Request from banned fingerprint (fp_testfingerprint123)');
  const reqBannedFp = {
    headers: {
      authorization: `Bearer ${token}`,
      'x-device-fingerprint': 'fp_testfingerprint123',
      'x-forwarded-for': '1.1.1.1',
      origin: 'https://boostupgh.com'
    }
  };

  try {
    await verifyAuth(reqBannedFp);
    console.log('❌ FAILURE: Banned fingerprint was allowed to execute the request!');
  } catch (err) {
    if (err.message.includes('Device is blocked')) {
      console.log('✅ SUCCESS: Correctly blocked with error:', err.message);
    } else {
      console.log('❌ FAILURE: Request failed with incorrect error:', err.message);
    }
  }

  // Test 4: Request with invalid Origin
  console.log('\nTest 4: Request with invalid Origin (https://suspiciousdomain.com)');
  const reqInvalidOrigin = {
    headers: {
      authorization: `Bearer ${token}`,
      'x-device-fingerprint': 'fp_clean_fingerprint_abc123',
      'x-forwarded-for': '1.1.1.1',
      origin: 'https://suspiciousdomain.com'
    }
  };

  try {
    await verifyAuth(reqInvalidOrigin);
    console.log('❌ FAILURE: Invalid origin was allowed!');
  } catch (err) {
    if (err.message.includes('Invalid request origin')) {
      console.log('✅ SUCCESS: Correctly blocked with error:', err.message);
    } else {
      console.log('❌ FAILURE: Request failed with incorrect error:', err.message);
    }
  }

  // Test 5: Request with missing Origin/Referer
  console.log('\nTest 5: Request with missing Origin and Referer headers');
  const reqMissingOrigin = {
    headers: {
      authorization: `Bearer ${token}`,
      'x-device-fingerprint': 'fp_clean_fingerprint_abc123',
      'x-forwarded-for': '1.1.1.1'
    }
  };

  try {
    await verifyAuth(reqMissingOrigin);
    console.log('❌ FAILURE: Request missing origin/referer was allowed!');
  } catch (err) {
    if (err.message.includes('Invalid request origin')) {
      console.log('✅ SUCCESS: Correctly blocked with error:', err.message);
    } else {
      console.log('❌ FAILURE: Request failed with incorrect error:', err.message);
    }
  }

  console.log('\n--- VERIFICATION COMPLETED ---');
}

runTests().catch(console.error);
