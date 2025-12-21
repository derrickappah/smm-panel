-- Cleanup duplicate transactions for orders
-- This script finds and removes duplicate manual_adjustment transactions that were created
-- when order transactions already exist for the same balance change
-- Run this in Supabase SQL Editor

-- Step 1: Find duplicate transactions (manual_adjustment + order for same amount/time)
WITH duplicate_pairs AS (
    SELECT 
        bal.user_id,
        ABS(bal.change_amount) as amount,
        bal.created_at,
        -- Find order transaction
        (SELECT id FROM transactions t1 
         WHERE t1.user_id = bal.user_id 
           AND t1.type = 'order'
           AND t1.status = 'approved'
           AND ABS(t1.amount - ABS(bal.change_amount)) < 0.01
           AND t1.created_at BETWEEN bal.created_at - INTERVAL '60 seconds' AND bal.created_at + INTERVAL '60 seconds'
           AND t1.order_id IS NOT NULL
         ORDER BY ABS(t1.amount - ABS(bal.change_amount)) ASC, t1.created_at DESC
         LIMIT 1) as order_transaction_id,
        -- Find manual_adjustment transaction
        (SELECT id FROM transactions t2 
         WHERE t2.user_id = bal.user_id 
           AND t2.type = 'manual_adjustment'
           AND t2.status = 'approved'
           AND ABS(t2.amount - ABS(bal.change_amount)) < 0.01
           AND t2.created_at BETWEEN bal.created_at - INTERVAL '60 seconds' AND bal.created_at + INTERVAL '60 seconds'
         ORDER BY t2.created_at DESC
         LIMIT 1) as manual_adjustment_id
    FROM balance_audit_log bal
    WHERE bal.change_amount < 0
      AND bal.created_at >= NOW() - INTERVAL '30 days'  -- Only check recent transactions
      AND EXISTS (
          SELECT 1 FROM transactions t1 
          WHERE t1.user_id = bal.user_id 
            AND t1.type = 'order'
            AND t1.status = 'approved'
            AND ABS(t1.amount - ABS(bal.change_amount)) < 0.01
            AND t1.created_at BETWEEN bal.created_at - INTERVAL '60 seconds' AND bal.created_at + INTERVAL '60 seconds'
            AND t1.order_id IS NOT NULL
      )
      AND EXISTS (
          SELECT 1 FROM transactions t2 
          WHERE t2.user_id = bal.user_id 
            AND t2.type = 'manual_adjustment'
            AND t2.status = 'approved'
            AND ABS(t2.amount - ABS(bal.change_amount)) < 0.01
            AND t2.created_at BETWEEN bal.created_at - INTERVAL '60 seconds' AND bal.created_at + INTERVAL '60 seconds'
      )
)
SELECT 
    'Found duplicate transaction pairs:' as info,
    COUNT(*) as duplicate_count
FROM duplicate_pairs;

-- Step 2: Update balance_audit_log to link to order transactions instead of manual_adjustments
UPDATE balance_audit_log bal
SET transaction_id = (
    SELECT t1.id 
    FROM transactions t1 
    WHERE t1.user_id = bal.user_id 
      AND t1.type = 'order'
      AND t1.status = 'approved'
      AND ABS(t1.amount - ABS(bal.change_amount)) < 0.01
      AND t1.created_at BETWEEN bal.created_at - INTERVAL '60 seconds' AND bal.created_at + INTERVAL '60 seconds'
      AND t1.order_id IS NOT NULL
    ORDER BY ABS(t1.amount - ABS(bal.change_amount)) ASC, t1.created_at DESC
    LIMIT 1
)
WHERE bal.change_amount < 0
  AND bal.created_at >= NOW() - INTERVAL '30 days'
  AND bal.transaction_id IN (
      SELECT t2.id 
      FROM transactions t2 
      WHERE t2.user_id = bal.user_id 
        AND t2.type = 'manual_adjustment'
        AND t2.status = 'approved'
        AND ABS(t2.amount - ABS(bal.change_amount)) < 0.01
        AND t2.created_at BETWEEN bal.created_at - INTERVAL '60 seconds' AND bal.created_at + INTERVAL '60 seconds'
  )
  AND EXISTS (
      SELECT 1 
      FROM transactions t1 
      WHERE t1.user_id = bal.user_id 
        AND t1.type = 'order'
        AND t1.status = 'approved'
        AND ABS(t1.amount - ABS(bal.change_amount)) < 0.01
        AND t1.created_at BETWEEN bal.created_at - INTERVAL '60 seconds' AND bal.created_at + INTERVAL '60 seconds'
        AND t1.order_id IS NOT NULL
  );

-- Step 3: Delete duplicate manual_adjustment transactions that have corresponding order transactions
DELETE FROM transactions t
WHERE t.type = 'manual_adjustment'
  AND t.status = 'approved'
  AND t.created_at >= NOW() - INTERVAL '30 days'
  AND EXISTS (
      SELECT 1 
      FROM transactions t_order
      WHERE t_order.user_id = t.user_id
        AND t_order.type = 'order'
        AND t_order.status = 'approved'
        AND t_order.order_id IS NOT NULL
        AND ABS(t_order.amount - t.amount) < 0.01
        AND t_order.created_at BETWEEN t.created_at - INTERVAL '60 seconds' AND t.created_at + INTERVAL '60 seconds'
  )
  AND NOT EXISTS (
      SELECT 1 
      FROM balance_audit_log bal
      WHERE bal.transaction_id = t.id
  );

-- Step 4: Show summary of cleanup
SELECT 
    'Cleanup complete. Remaining duplicate pairs:' as info,
    COUNT(*) as remaining_duplicates
FROM (
    SELECT bal.user_id, ABS(bal.change_amount) as amount, bal.created_at
    FROM balance_audit_log bal
    WHERE bal.change_amount < 0
      AND bal.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY bal.user_id, ABS(bal.change_amount), bal.created_at
    HAVING COUNT(DISTINCT (
        SELECT t.type 
        FROM transactions t 
        WHERE t.id = bal.transaction_id
    )) > 1
) duplicates;



