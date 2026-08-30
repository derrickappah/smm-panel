/**
 * Integration Test for 24/7 Order Synchronization Cron
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Manually load backend/.env into process.env
const envFile = path.join(__dirname, '../backend/.env');
if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, 'utf8').split('\n');
    for (const l of lines) {
        const parts = l.split('=');
        if (parts[0] && parts[0].trim() && !parts[0].startsWith('#')) {
            const key = parts[0].trim();
            const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
            if (!process.env[key]) process.env[key] = val;
        }
    }
}

import handler from '../api/cron/sync-orders.js';

function createMockRes() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(k, v) { this.headers[k] = v; return this; },
        status(code) { this.statusCode = code; return this; },
        json(data) { this.body = data; return this; },
        end() { return this; }
    };
}

async function runTests() {
    console.log('==============================================');
    console.log('RUNNING TEST SUITE: 24/7 ORDER SYNC CRON');
    console.log('==============================================\n');

    // Test 1: Unauthorized invocation
    console.log('Test 1: Reject unauthenticated requests');
    const unauthReq = {
        method: 'POST',
        headers: {}
    };
    const unauthRes = createMockRes();
    await handler(unauthReq, unauthRes);
    if (unauthRes.statusCode === 401) {
        console.log('  Passed: Correctly rejected unauthenticated call (HTTP 401)\n');
    } else {
        console.error(`  Failed: Expected 401, got ${unauthRes.statusCode}\n`);
    }

    // Test 2: Method not allowed (e.g. PUT)
    console.log('Test 2: Reject unsupported HTTP methods');
    const putReq = {
        method: 'PUT',
        headers: { 'x-vercel-cron': '1' }
    };
    const putRes = createMockRes();
    await handler(putReq, putRes);
    if (putRes.statusCode === 405) {
        console.log('  Passed: Correctly rejected PUT method (HTTP 405)\n');
    } else {
        console.error(`  Failed: Expected 405, got ${putRes.statusCode}\n`);
    }

    // Test 3: Authorized execution via x-vercel-cron header
    console.log('Test 3: Execute authorized sync via x-vercel-cron header');
    const authReq = {
        method: 'POST',
        headers: { 'x-vercel-cron': '1' }
    };
    const authRes = createMockRes();
    await handler(authReq, authRes);
    console.log('  Response status:', authRes.statusCode);
    console.log('  Response summary:', JSON.stringify(authRes.body?.summary || authRes.body, null, 2));

    if (authRes.statusCode === 200 && authRes.body?.success) {
        console.log('\n  Passed: Successfully executed automated status synchronization!');
    } else {
        console.error('\n  Failed: Sync execution returned error:', authRes.body);
    }
}

runTests().catch(console.error);
