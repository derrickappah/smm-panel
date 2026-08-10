import fs from 'fs';
import path from 'path';

async function testImports() {
  console.log('--- Testing API Handler Imports ---');
  const files = [
    '../api/admin/combo-services.js',
    '../api/admin/combo-orders.js',
    '../api/admin/retry-combo-child-order.js',
    '../api/order/place-combo-order.js',
    '../api/order/create.js',
    '../api/check-combo-orders-status.js'
  ];

  for (const file of files) {
    try {
      console.log(`Importing ${file}...`);
      const mod = await import(file);
      console.log(`✅ ${file}: Import successful! Handler type: ${typeof mod.default}`);
    } catch (err) {
      console.error(`❌ ${file}: IMPORT ERROR:`, err);
    }
  }
}

testImports();
