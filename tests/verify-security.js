/**
 * Security Verification Script
 * 
 * This script tests the new security measures implemented for order creation.
 * Run this with: node tests/verify-security.js
 */

const BASE_URL = process.env.APP_URL || 'http://localhost:3000';

async function testEndpoint(path, method = 'POST', headers = {}, body = {}) {
    console.log(`Testing ${method} ${path}...`);
    try {
        const response = await fetch(`${BASE_URL}${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            body: method === 'GET' ? null : JSON.stringify(body)
        });

        const data = await response.json().catch(() => ({}));
        console.log(`Status: ${response.status}`);
        console.log(`Result: ${JSON.stringify(data).substring(0, 100)}\n`);
        return { status: response.status, data };
    } catch (err) {
        console.error(`Error testing ${path}: ${err.message}\n`);
        return { error: err.message };
    }
}

async function runTests() {
    console.log('--- SMM PANEL SECURITY VERIFICATION ---\n');

    // 1. Test unauthenticated access to direct provider proxies (Should be 403 or 401)
    console.log('[TEST 1] Unauthorized access to SMMGen proxy');
    await testEndpoint('/api/smmgen/order', 'POST', {}, { service: 123, link: 'test', quantity: 100 });

    console.log('[TEST 2] Unauthorized access to JBSMMPanel proxy');
    await testEndpoint('/api/jbsmmpanel/order', 'POST', {}, { service: 123, link: 'test', quantity: 100 });

    // 2. Test unauthenticated access to new secure order endpoint (Should be 401)
    console.log('[TEST 3] Unauthorized access to NEW secure order endpoint');
    await testEndpoint('/api/order/create', 'POST', {}, { service_id: 'some-uuid', link: 'test', quantity: 100, total_cost: 5 });

    // 3. Info about authenticated tests
    console.log('\n--- MANUAL VERIFICATION STEPS ---');
    console.log('1. Open browser to /dashboard');
    console.log('2. Place a regular order');
    console.log('3. Verify balance is deducted only AFTER successful order creation');
    console.log('4. Attempt the SAME order immediately (within 60s) and verify 409 Conflict (Idempotency)');
    console.log('5. Check provider panel to ensure order arrived with your API key (securely handled server-side)');
}

runTests();
