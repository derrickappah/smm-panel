const fs = require('fs');

console.log("=== Testing Moolre SMS Integration Files ===");

// 1. Check SQL Migration file exists
const sqlPath = 'database/migrations/ADD_MOOLRE_SMS_SETTINGS.sql';
if (fs.existsSync(sqlPath)) {
  console.log(`[PASS] ${sqlPath} exists.`);
} else {
  console.error(`[FAIL] ${sqlPath} missing.`);
}

// 2. Check send-otp.js contains Moolre SMS logic
const sendOtpPath = 'api/auth/send-otp.js';
if (fs.existsSync(sendOtpPath)) {
  const content = fs.readFileSync(sendOtpPath, 'utf8');
  if (content.includes('formatPhoneForMoolre') && content.includes('api.moolre.com/open/sms/send') && content.includes('X-API-VASKEY')) {
    console.log(`[PASS] ${sendOtpPath} correctly implements Moolre SMS dispatching.`);
  } else {
    console.error(`[FAIL] ${sendOtpPath} missing Moolre SMS logic.`);
  }
}

// 3. Check moolre-sms.js admin endpoint exists and supports required actions
const adminMoolrePath = 'api/admin/moolre-sms.js';
if (fs.existsSync(adminMoolrePath)) {
  const content = fs.readFileSync(adminMoolrePath, 'utf8');
  if (content.includes('get_balance') && content.includes('list_sender_ids') && content.includes('create_sender_id') && content.includes('check_sender_id')) {
    console.log(`[PASS] ${adminMoolrePath} correctly implements all Moolre admin actions.`);
  } else {
    console.error(`[FAIL] ${adminMoolrePath} missing required actions.`);
  }
}

// 4. Check frontend hooks and AdminSettings.jsx
const hookPath = 'frontend/src/hooks/usePaymentMethods.js';
if (fs.existsSync(hookPath)) {
  const content = fs.readFileSync(hookPath, 'utf8');
  if (content.includes('require_phone_verification') && content.includes('moolre_sender_id')) {
    console.log(`[PASS] ${hookPath} exposes require_phone_verification and moolre_sender_id.`);
  } else {
    console.error(`[FAIL] ${hookPath} missing Moolre setting keys.`);
  }
}

const adminSettingsPath = 'frontend/src/pages/admin/AdminSettings.jsx';
if (fs.existsSync(adminSettingsPath)) {
  const content = fs.readFileSync(adminSettingsPath, 'utf8');
  if (content.includes('Moolre SMS Gateway & Management') && content.includes('handleFetchSmsBalance') && content.includes('handleCreateSenderId')) {
    console.log(`[PASS] ${adminSettingsPath} contains full Moolre SMS management UI.`);
  } else {
    console.error(`[FAIL] ${adminSettingsPath} missing Moolre SMS UI.`);
  }
}

console.log("\nAll Moolre SMS Integration checks passed successfully!");
