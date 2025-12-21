# Fix for Duplicate Transactions (Manual Adjustment + Order)

## Problem
When orders are placed, duplicate transactions are being created:
- One transaction with type `order` (created by `place_order_with_balance_deduction` function)
- One transaction with type `manual_adjustment` (created by the `create_transaction_from_audit_log` trigger)

This happens because:
1. The `place_order_with_balance_deduction` function updates the balance, which triggers `balance_audit_log` entry creation
2. The `create_transaction_from_audit_log` trigger fires immediately and creates a `manual_adjustment` transaction
3. The `place_order` function then creates the `order` transaction, but the duplicate already exists

## Solution

### 1. Fix the Trigger (`FIX_DUPLICATE_TRANSACTIONS_FROM_ORDERS.sql`)
- Improved the trigger to better detect order transactions by checking for `order_id IS NOT NULL`
- Added logic to skip creating transactions if the classification is 'order' (orders should be created by place_order function)
- Extended the time window for checking order transactions to 60 seconds

### 2. Improve Place Order Function (`IMPROVE_PLACE_ORDER_TRANSACTION_LINKING.sql`)
- Enhanced transaction linking to balance_audit_log
- Added logic to find and delete duplicate `manual_adjustment` transactions when an order transaction is created
- Improved the time window for finding balance_audit_log entries

### 3. Cleanup Existing Duplicates (`CLEANUP_DUPLICATE_ORDER_TRANSACTIONS.sql`)
- Script to find and remove existing duplicate transactions
- Updates balance_audit_log entries to link to order transactions instead of manual_adjustments
- Deletes duplicate manual_adjustment transactions that have corresponding order transactions

## Migration Order

1. Run `FIX_DUPLICATE_TRANSACTIONS_FROM_ORDERS.sql` - Fixes the trigger to prevent future duplicates
2. Run `IMPROVE_PLACE_ORDER_TRANSACTION_LINKING.sql` - Improves the place_order function
3. Run `CLEANUP_DUPLICATE_ORDER_TRANSACTIONS.sql` - Cleans up existing duplicates

## Testing

After applying the migrations:
1. Place a test order
2. Check transactions table - should only see one `order` transaction, no `manual_adjustment` duplicate
3. Verify balance_audit_log entries are properly linked to order transactions

## Notes

- The cleanup script only processes transactions from the last 30 days to avoid performance issues
- The trigger now waits for order transactions to be created by the place_order function before creating manual_adjustments
- Order transactions are identified by having `order_id IS NOT NULL`, which ensures they were created by the place_order function



