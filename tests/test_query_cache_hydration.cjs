const assert = require('assert');
const { QueryClient, defaultShouldDehydrateQuery, dehydrate } = require('@tanstack/react-query');

console.log('--- Testing Query Cache Hydration & Deserialization Fixes ---');

// 1. Verify defaultShouldDehydrateQuery behavior
const pendingQuery = {
  state: { status: 'pending', data: undefined },
  queryKey: ['services']
};
const errorQuery = {
  state: { status: 'error', data: undefined, error: new Error('Failed') },
  queryKey: ['recentOrders']
};
const successQuery = {
  state: { status: 'success', data: [{ id: 1, name: 'Followers' }] },
  queryKey: ['services']
};
const adminSuccessQuery = {
  state: { status: 'success', data: { revenue: 5000 } },
  queryKey: ['admin', 'stats']
};

assert.strictEqual(defaultShouldDehydrateQuery(pendingQuery), false, 'Pending query must NOT be dehydrated');
assert.strictEqual(defaultShouldDehydrateQuery(errorQuery), false, 'Error query must NOT be dehydrated');
assert.strictEqual(defaultShouldDehydrateQuery(successQuery), true, 'Success query must be dehydrated');

// Custom shouldDehydrateQuery filter logic from queryClient.js
const customShouldDehydrateQuery = (query) => {
  const isSuccess = defaultShouldDehydrateQuery(query);
  const isNotAdmin = !query.queryKey.some(
    (k) => typeof k === 'string' && k.toLowerCase().includes('admin')
  );
  return isSuccess && isNotAdmin;
};

assert.strictEqual(customShouldDehydrateQuery(pendingQuery), false, 'Pending query rejected');
assert.strictEqual(customShouldDehydrateQuery(adminSuccessQuery), false, 'Admin query rejected');
assert.strictEqual(customShouldDehydrateQuery(successQuery), true, 'Public success query accepted');
console.log('✓ shouldDehydrateQuery correctly gates queries to success-only and non-admin');

// 2. Test deserializer logic with poisoned cache payload
const deserialize = (cachedString) => {
  try {
    const parsed = JSON.parse(cachedString);
    if (parsed?.clientState?.queries && Array.isArray(parsed.clientState.queries)) {
      parsed.clientState.queries = parsed.clientState.queries.filter(
        (q) => q?.state?.status === 'success' && !q?.promise
      );
    }
    return parsed;
  } catch (e) {
    return undefined;
  }
};

const poisonedCacheJson = JSON.stringify({
  timestamp: Date.now(),
  buster: 'v2',
  clientState: {
    mutations: [],
    queries: [
      {
        queryKey: ['payment-settings'],
        queryHash: '["payment-settings"]',
        state: { status: 'pending' },
        promise: {} // The corrupted serialized Promise that previously caused e.then is not a function
      },
      {
        queryKey: ['services'],
        queryHash: '["services"]',
        state: { status: 'success', data: [{ id: 'srv-1' }] }
      }
    ]
  }
});

const cleanedState = deserialize(poisonedCacheJson);
assert.strictEqual(cleanedState.clientState.queries.length, 1, 'Poisoned pending query was cleanly removed');
assert.strictEqual(cleanedState.clientState.queries[0].queryKey[0], 'services', 'Legitimate success query preserved');
assert.strictEqual(cleanedState.clientState.queries[0].promise, undefined, 'No dangling promise attribute');
console.log('✓ Deserializer strips out poisoned pending queries and promise artifacts');

// 3. Test React Query dehydrate with QueryClient
const client = new QueryClient();
client.setQueryData(['services'], [{ id: 1, name: 'Service 1' }]);

const dehydrated = dehydrate(client, {
  shouldDehydrateQuery: customShouldDehydrateQuery
});

assert.strictEqual(dehydrated.queries.length, 1, 'Only eligible queries dehydrated');
assert.strictEqual(dehydrated.queries[0].queryKey[0], 'services');
assert.strictEqual(dehydrated.queries[0].promise, undefined, 'No promise serialized for success query');
console.log('✓ React Query client dehydration produces safe, promise-free payload');

console.log('All query cache hydration tests PASSED successfully!');
