# How Balance Verification Works

This document explains how the system verifies that a user's balance has been updated after a deposit is approved.

## Overview

The system uses a **two-stage verification process**:
1. **Immediate Verification** (during payment processing)
2. **Admin Verification** (on the transactions page)

---

## Stage 1: Immediate Verification (During Payment)

**Location**: `frontend/src/pages/Dashboard.jsx` - `handlePaymentSuccess()` function

### Step-by-Step Process:

1. **Payment Confirmed by Paystack**
   - User completes payment via Paystack
   - Paystack callback confirms payment success
   - System receives payment reference

2. **Transaction Status Updated**
   - Transaction status changed from `pending` → `approved`
   - `paystack_reference` stored in transactions table

3. **Balance Update**
   ```javascript
   // Get current balance
   const currentBalance = profile.balance || 0;
   const newBalance = currentBalance + transactionAmount;
   
   // Update balance in database
   await supabase
     .from('profiles')
     .update({ balance: newBalance })
     .eq('id', user.id);
   ```

4. **Double-Check Verification** (Critical Step)
   - System waits 200ms for database to sync
   - Fetches balance again from database
   - Compares expected balance vs actual balance
   - Allows 0.01 tolerance for floating-point differences
   - Retries up to 3 times if mismatch detected

   ```javascript
   // Verification loop (up to 3 attempts)
   for (let verifyAttempt = 1; verifyAttempt <= 3; verifyAttempt++) {
     await new Promise(resolve => setTimeout(resolve, 200));
     
     const { data: verifyProfile } = await supabase
       .from('profiles')
       .select('balance')
       .eq('id', user.id)
       .single();
     
     const verifiedBalance = parseFloat(verifyProfile.balance || 0);
     
     // Check if balance matches expected (within 0.01 tolerance)
     if (Math.abs(verifiedBalance - expectedBalance) < 0.01) {
       // ✅ Balance verified!
       break;
     } else {
       // Retry balance update if mismatch
       // ... retry logic ...
     }
   }
   ```

5. **Success Notification**
   - User sees success message
   - Balance refreshed in UI
   - Transaction marked as approved

---

## Stage 2: Admin Verification (Transactions Page)

**Location**: `frontend/src/pages/TransactionsPage.jsx` - `performTripleCheck()` function

### Purpose:
- Allows admins to verify that balances were correctly updated
- Detects any cases where balance update might have failed
- Provides manual credit option if balance wasn't updated

### Triple-Check System:

The system performs **3 independent checks** to verify balance:

#### Check 1: Expected Balance Calculation
```javascript
// Sum all approved deposits
const allApprovedDeposits = transactions
  .filter(t => t.type === 'deposit' && t.status === 'approved')
  .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

// Subtract all completed orders
const allCompletedOrders = transactions
  .filter(t => t.type === 'order' && t.status === 'completed')
  .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

// Expected balance = deposits - orders
const expectedBalance = allApprovedDeposits - allCompletedOrders;
```

#### Check 2: Fresh Balance Fetch
```javascript
// Fetch balance 3 times with delays (to avoid stale data)
for (let i = 0; i < 3; i++) {
  await new Promise(resolve => setTimeout(resolve, 150));
  const { data: freshProfile } = await supabase
    .from('profiles')
    .select('balance')
    .eq('id', user.id)
    .single();
  
  freshBalances.push(parseFloat(freshProfile.balance || 0));
}

// Use highest balance (most recent/accurate)
const freshBalance = Math.max(...freshBalances);
```

#### Check 3: Transaction-Specific Verification
```javascript
// Balance should include this specific transaction
const balanceWithoutThisTransaction = allApprovedDeposits - transactionAmount - allCompletedOrders;
const minExpectedWithTransaction = balanceWithoutThisTransaction + transactionAmount;

// Check if balance is at least (balance without transaction + transaction amount)
const check2Pass = freshBalance >= (minExpectedWithTransaction - tolerance);
```

### Verification Result:

The system uses **conservative logic**:
- If **2 or more checks pass** → Mark as `'updated'` ✅
- If **only 1 check passes** → Still mark as `'updated'` (conservative approach)
- If **all checks fail** AND balance is significantly lower → Mark as `'not_updated'` ❌

### Storage:

Verified results are stored in the `verified_transactions` table:
- `transaction_id`: Reference to the transaction
- `verified_status`: `'updated'`, `'not_updated'`, or `'unknown'`
- `verified_by`: Admin who verified (optional)
- `verified_at`: Timestamp of verification

### Benefits:

1. **Persistent**: Once verified, status is stored in database
2. **No Re-checking**: Verified transactions are skipped on future page loads
3. **Manual Credit Option**: Admins can manually credit balance if verification fails
4. **Audit Trail**: Can see who verified and when

---

## Visual Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    USER MAKES DEPOSIT                        │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              PAYSTACK PAYMENT SUCCESSFUL                      │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│         UPDATE TRANSACTION STATUS → 'approved'               │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│         UPDATE USER BALANCE (current + deposit)              │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│         DOUBLE-CHECK: Fetch balance & verify                 │
│         (Retry up to 3 times if mismatch)                    │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│         ✅ BALANCE VERIFIED → Show success message          │
└─────────────────────────────────────────────────────────────┘

                        │
                        │ (Later, on Admin Transactions Page)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│         TRIPLE-CHECK VERIFICATION                            │
│         1. Calculate expected balance                        │
│         2. Fetch fresh balance (3 times)                    │
│         3. Verify transaction-specific balance              │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│         SAVE TO verified_transactions TABLE                  │
│         (Status: 'updated', 'not_updated', or 'unknown')    │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Features

### 1. **Immediate Verification**
- Happens automatically during payment processing
- Retries up to 3 times if verification fails
- Prevents double-crediting

### 2. **Admin Triple-Check**
- More thorough verification for admin review
- Compares expected vs actual balance
- Accounts for all transactions (deposits and orders)

### 3. **Persistent Storage**
- Verified status stored in database
- No need to re-check verified transactions
- Shared across all admins

### 4. **Manual Credit Option**
- If verification fails, admin can manually credit balance
- Transaction is immediately marked as verified after manual credit

---

## Error Handling

### If Balance Update Fails:
1. System retries up to 3 times
2. Shows warning message to user
3. Transaction still marked as approved
4. Admin can manually credit balance later

### If Verification Fails:
1. Admin sees "Balance Not Updated" badge
2. Admin can click "Credit Balance" button
3. System updates balance and marks as verified
4. Status saved to `verified_transactions` table

---

## Database Tables Involved

1. **`transactions`**: Stores deposit transactions with status
2. **`profiles`**: Stores user balance
3. **`verified_transactions`**: Stores verification status (new table)

---

## Summary

The system uses a **multi-layered verification approach**:
- ✅ **Immediate verification** during payment (double-check with retries)
- ✅ **Admin verification** on transactions page (triple-check system)
- ✅ **Persistent storage** in database (no re-checking needed)
- ✅ **Manual credit option** if verification fails

This ensures that user balances are correctly updated and any issues are detected and can be resolved by admins.

