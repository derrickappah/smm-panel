-- Validation queries for transaction recording system
-- Use these queries to verify that all transactions are properly recorded
-- Run these in Supabase SQL Editor

-- Query 1: Check for balance changes without corresponding transactions
-- This should return 0 or very few rows after backfilling
SELECT 
    bal.id,
    bal.user_id,
    bal.change_amount,
    bal.created_at,
    bal.change_reason,
    CASE 
        WHEN bal.transaction_id IS NULL THEN 'Missing Transaction'
        ELSE 'Has Transaction'
    END as status
FROM balance_audit_log bal
WHERE bal.transaction_id IS NULL
ORDER BY bal.created_at DESC
LIMIT 100;

-- Query 2: Verify transaction amounts match balance changes
-- This should return 0 rows (all should match)
SELECT 
    t.id as transaction_id,
    t.user_id,
    t.amount as transaction_amount,
    bal.change_amount as audit_change_amount,
    ABS(t.amount) - ABS(bal.change_amount) as difference,
    t.type,
    t.created_at
FROM transactions t
INNER JOIN balance_audit_log bal ON bal.transaction_id = t.id
WHERE ABS(t.amount) != ABS(bal.change_amount)
ORDER BY t.created_at DESC;

-- Query 3: Check for orphaned transactions (transactions without balance audit log entries)
-- This is normal for some transaction types, but should be minimal
SELECT 
    t.id,
    t.user_id,
    t.type,
    t.amount,
    t.status,
    t.created_at,
    t.description
FROM transactions t
LEFT JOIN balance_audit_log bal ON bal.transaction_id = t.id
WHERE bal.id IS NULL
ORDER BY t.created_at DESC
LIMIT 100;

-- Query 4: Verify referral bonuses are correctly classified
-- All should have type='referral_bonus', not 'deposit'
SELECT 
    id,
    user_id,
    type,
    amount,
    deposit_method,
    description,
    created_at
FROM transactions
WHERE (deposit_method = 'ref_bonus' OR description LIKE '%referral%bonus%')
AND type != 'referral_bonus'
ORDER BY created_at DESC;

-- Query 5: Check for transactions with missing required fields
SELECT 
    id,
    user_id,
    type,
    amount,
    status,
    description,
    admin_id,
    auto_classified,
    created_at
FROM transactions
WHERE user_id IS NULL
   OR amount IS NULL
   OR type IS NULL
   OR status IS NULL
ORDER BY created_at DESC;

-- Query 6: Summary of transaction types
SELECT 
    type,
    COUNT(*) as count,
    SUM(amount) as total_amount,
    COUNT(CASE WHEN auto_classified = true THEN 1 END) as auto_classified_count,
    COUNT(CASE WHEN admin_id IS NOT NULL THEN 1 END) as admin_created_count
FROM transactions
GROUP BY type
ORDER BY count DESC;

-- Query 7: Check for duplicate transactions (same user, amount, and time)
-- This should return 0 or very few rows
SELECT 
    user_id,
    amount,
    type,
    DATE_TRUNC('minute', created_at) as minute,
    COUNT(*) as duplicate_count,
    array_agg(id ORDER BY created_at) as transaction_ids
FROM transactions
GROUP BY user_id, amount, type, DATE_TRUNC('minute', created_at)
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, minute DESC;

-- Query 8: Verify manual adjustments have admin_id
SELECT 
    id,
    user_id,
    amount,
    type,
    description,
    admin_id,
    created_at
FROM transactions
WHERE type = 'manual_adjustment'
AND admin_id IS NULL
ORDER BY created_at DESC;

-- Query 9: Check balance audit log entries created in last 24 hours without transactions
-- This helps identify if the trigger is working correctly
SELECT 
    bal.id,
    bal.user_id,
    bal.change_amount,
    bal.created_at,
    bal.change_reason
FROM balance_audit_log bal
WHERE bal.transaction_id IS NULL
AND bal.created_at > NOW() - INTERVAL '24 hours'
ORDER BY bal.created_at DESC;

-- Query 10: Transaction type distribution over time
SELECT 
    DATE_TRUNC('day', created_at) as date,
    type,
    COUNT(*) as count,
    SUM(amount) as total_amount
FROM transactions
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at), type
ORDER BY date DESC, type;

-- Add comments for documentation
COMMENT ON TABLE transactions IS 'All balance-affecting transactions. Types: deposit, order, refund, referral_bonus, manual_adjustment, unknown';
COMMENT ON COLUMN transactions.description IS 'Human-readable description. Required for manual_adjustment and recommended for all types.';
COMMENT ON COLUMN transactions.admin_id IS 'Admin who created this transaction. Required for manual_adjustment type.';
COMMENT ON COLUMN transactions.auto_classified IS 'True if transaction was automatically classified by the system.';
