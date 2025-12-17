# Race Condition Fix Verification Guide

This document describes how to verify that the duplicate balance credit race condition has been fixed.

## Problem Fixed

Previously, multiple payment verification processes could run simultaneously and credit the same transaction multiple times:
- PaymentCallback.jsx (frontend)
- Webhook handlers (paystack-webhook.js, moolre-web-callback.js)
- Cron job (verify-pending-payments.js)

All these processes checked `transaction.status !== 'approved'` and then manually updated the balance, creating a race condition.

## Solution Implemented

All deposit approval processes now use atomic database functions:
- `approve_deposit_transaction` (for Paystack)
- `approve_deposit_transaction_universal` (for all payment methods)

These functions use row-level locking (`FOR UPDATE`) to prevent concurrent modifications.

## Verification Steps

### 1. Database Migration Verification

Run the following migrations in order:
1. `database/migrations/ADD_UNIVERSAL_APPROVE_FUNCTION.sql`
2. `database/migrations/ADD_BALANCE_AUDIT_TRIGGER.sql`

Verify the functions exist:
```sql
SELECT proname FROM pg_proc WHERE proname IN ('approve_deposit_transaction', 'approve_deposit_transaction_universal');
```

Verify the audit table exists:
```sql
SELECT * FROM balance_audit_log LIMIT 1;
```

### 2. Code Changes Verification

Verify all manual balance updates have been replaced:

**Fixed Files:**
- ✅ `frontend/src/pages/PaymentCallback.jsx` - Uses `/api/approve-deposit-universal`
- ✅ `api/verify-pending-payments.js` - Uses `approve_deposit_transaction` RPC
- ✅ `api/moolre-web-callback.js` - Uses `approve_deposit_transaction_universal` RPC

**Files Using Atomic Functions (Already Safe):**
- ✅ `api/approve-paystack-deposit.js` - Uses `approve_deposit_transaction`
- ✅ `api/paystack-webhook.js` - Uses `approve_deposit_transaction`
- ✅ `api/manual-verify-paystack-deposit.js` - Uses `approve_deposit_transaction`
- ✅ `frontend/src/pages/Dashboard.jsx` - Uses `/api/approve-paystack-deposit`

### 3. Concurrent Request Test

**Test Scenario:** Simulate multiple processes trying to approve the same transaction simultaneously.

**Manual Test:**
1. Create a pending deposit transaction
2. Simultaneously trigger:
   - PaymentCallback page load
   - Webhook callback
   - Cron job verification
3. Check that:
   - Transaction is approved only once
   - Balance is credited only once
   - Audit log shows only one balance change

**SQL Test:**
```sql
-- Create a test transaction
INSERT INTO transactions (id, user_id, type, amount, status, deposit_method, created_at)
VALUES (gen_random_uuid(), 'user-id-here', 'deposit', 100, 'pending', 'paystack', NOW())
RETURNING id;

-- Try to approve it multiple times simultaneously (in separate connections)
-- All should succeed but only one should actually update
SELECT * FROM approve_deposit_transaction('transaction-id-here', 'success', 'test-ref');
```

### 4. Audit Log Review

Check for duplicate balance changes:
```sql
-- View duplicate balance changes
SELECT * FROM duplicate_balance_changes 
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY last_change DESC;

-- Check balance audit log for a specific transaction
SELECT * FROM balance_audit_log 
WHERE transaction_id = 'transaction-id-here'
ORDER BY created_at;
```

### 5. Integration Test

**Test Flow:**
1. User initiates deposit via Paystack
2. PaymentCallback page loads
3. Webhook arrives
4. Cron job runs

**Expected Result:**
- Only one balance credit occurs
- Transaction status changes to 'approved' once
- All processes handle the "already approved" case gracefully

### 6. Edge Cases

**Test Already Approved Transaction:**
- Call approval function on already-approved transaction
- Should return success with "already approved" message
- Should not modify balance

**Test Concurrent Approvals:**
- Two processes call approval function simultaneously
- Only one should succeed in updating
- Other should detect race condition and return appropriate error

## Monitoring

After deployment, monitor:
1. `balance_audit_log` table for duplicate entries
2. User balances for unexpected increases
3. Transaction approval logs for race condition errors

## Rollback Plan

If issues occur:
1. The atomic functions are idempotent - safe to call multiple times
2. Audit log can help identify and correct any issues
3. Manual balance corrections can be made via admin panel

## Success Criteria

✅ All deposit approvals use atomic functions
✅ No manual balance updates in payment verification code
✅ Audit logging captures all balance changes
✅ Concurrent requests don't cause duplicate credits
✅ Already-approved transactions are handled idempotently

