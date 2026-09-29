/**
 * Endpoint Handler Direct Execution Test
 */
import healthHandler from '../api/health/index.js';
import dbHealthHandler from '../api/health/database.js';
import extHealthHandler from '../api/health/external-services.js';
import depHealthHandler from '../api/health/dependencies.js';
import clientErrorsHandler from '../api/monitoring/client-errors.js';

function createMockReqRes({ method = 'GET', headers = {}, body = {} } = {}) {
    const req = {
        method,
        headers,
        body,
        url: '/test'
    };
    const res = {
        statusCode: 200,
        headers: {},
        setHeader: (k, v) => { res.headers[k] = v; },
        status: (code) => {
            res.statusCode = code;
            return res;
        },
        json: (data) => {
            res.data = data;
            return res;
        },
        end: () => res
    };
    return { req, res };
}

async function runEndpointTests() {
    console.log('\n--- TESTING HEALTH & MONITORING ENDPOINTS DIRECTLY ---');

    // 1. Test /api/health unauthenticated (Must return 403)
    {
        const { req, res } = createMockReqRes({ method: 'GET', headers: {} });
        await healthHandler(req, res);
        console.log(`1. GET /api/health (unauth): Status ${res.statusCode} (Expected: 403)`);
        if (res.statusCode !== 403) throw new Error('Unauth health check did not return 403');
    }

    // 2. Test /api/health with secret key (Must return 200)
    {
        const { req, res } = createMockReqRes({
            method: 'GET',
            headers: { 'x-cron-secret': process.env.SUPABASE_SERVICE_ROLE_KEY }
        });
        await healthHandler(req, res);
        console.log(`2. GET /api/health (authorized): Status ${res.statusCode} (Expected: 200)`);
        console.log(`   Overall Status: ${res.data?.status}, DB: ${res.data?.checks?.database}, Cron: ${res.data?.checks?.cron_jobs}`);
        if (res.statusCode !== 200) throw new Error('Authorized health check did not return 200');
    }

    // 3. Test /api/health/database
    {
        const { req, res } = createMockReqRes({
            method: 'GET',
            headers: { 'x-cron-secret': process.env.SUPABASE_SERVICE_ROLE_KEY }
        });
        await dbHealthHandler(req, res);
        console.log(`3. GET /api/health/database: Status ${res.statusCode}, DB Latency: ${res.data?.latency_ms}ms`);
        if (res.statusCode !== 200) throw new Error('Database health check failed');
    }

    // 4. Test /api/health/dependencies
    {
        const { req, res } = createMockReqRes({
            method: 'GET',
            headers: { 'x-cron-secret': process.env.SUPABASE_SERVICE_ROLE_KEY }
        });
        await depHealthHandler(req, res);
        console.log(`4. GET /api/health/dependencies: Status ${res.statusCode}, Redis: ${res.data?.redis?.status}`);
        if (res.statusCode !== 200) throw new Error('Dependencies health check failed');
    }

    // 5. Test /api/health/external-services
    {
        const { req, res } = createMockReqRes({
            method: 'GET',
            headers: { 'x-cron-secret': process.env.SUPABASE_SERVICE_ROLE_KEY }
        });
        await extHealthHandler(req, res);
        console.log(`5. GET /api/health/external-services: Status ${res.statusCode}, Hubtel: ${res.data?.services?.payments?.hubtel?.status}`);
        if (res.statusCode !== 200) throw new Error('External services check failed');
    }

    // 6. Test /api/monitoring/client-errors
    {
        const { req, res } = createMockReqRes({
            method: 'POST',
            body: {
                message: 'Test client error handling',
                url: 'https://boostupgh.com/test',
                stack: 'Error: at line 10'
            }
        });
        await clientErrorsHandler(req, res);
        console.log(`6. POST /api/monitoring/client-errors: Status ${res.statusCode}, Logged: ${res.data?.logged}`);
        if (res.statusCode !== 200) throw new Error('Client error ingestion failed');
    }

    console.log('\n--- ALL ENDPOINT HANDLERS VERIFIED SUCCESSFULLY ---\n');
}

runEndpointTests().catch(err => {
    console.error('Endpoint test failure:', err);
    process.exit(1);
});
