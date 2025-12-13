-- Cleanup duplicate transactions with same paystack_reference
-- This script finds and handles existing duplicates
-- Run this in Supabase SQL Editor

-- Step 1: Find all duplicate references and show them
-- Note: We identify Paystack deposits by having a paystack_reference (not null)
WITH duplicate_refs AS (
  SELECT paystack_reference, COUNT(*) as count
  FROM transactions
  WHERE paystack_reference IS NOT NULL
    AND type = 'deposit'
  GROUP BY paystack_reference
  HAVING COUNT(*) > 1
)
SELECT 
  'Found duplicate references:' as info,
  COUNT(*) as duplicate_groups,
  SUM(count) as total_duplicate_transactions
FROM duplicate_refs;

-- Step 2: For each duplicate, identify which to keep (oldest approved, or oldest if none approved)
WITH duplicate_refs AS (
  SELECT paystack_reference, COUNT(*) as count
  FROM transactions
  WHERE paystack_reference IS NOT NULL
    AND type = 'deposit'
  GROUP BY paystack_reference
  HAVING COUNT(*) > 1
),
duplicate_groups AS (
  SELECT 
    t.id,
    t.paystack_reference,
    t.user_id,
    t.amount,
    t.status,
    t.created_at,
    -- Prioritize approved transactions, then oldest
    ROW_NUMBER() OVER (
      PARTITION BY t.paystack_reference 
      ORDER BY 
        CASE WHEN t.status = 'approved' THEN 0 ELSE 1 END,
        t.created_at ASC
    ) as rn
  FROM transactions t
  INNER JOIN duplicate_refs dr ON t.paystack_reference = dr.paystack_reference
  WHERE t.type = 'deposit' AND t.paystack_reference IS NOT NULL
)
-- Step 3: Mark duplicates as rejected (keep rn=1, mark others)
UPDATE transactions
SET 
  status = 'rejected',
  paystack_status = 'duplicate',
  paystack_reference = NULL -- Remove reference to allow unique constraint
WHERE id IN (
  SELECT id FROM duplicate_groups WHERE rn > 1
);

-- Step 4: Log cleanup results
WITH duplicate_refs AS (
  SELECT paystack_reference, COUNT(*) as count
  FROM transactions
  WHERE paystack_reference IS NOT NULL
    AND type = 'deposit'
  GROUP BY paystack_reference
  HAVING COUNT(*) > 1
)
SELECT 
  'Cleanup complete. Remaining duplicates:' as info,
  COUNT(*) as remaining_duplicate_groups
FROM duplicate_refs;

-- Step 5: Show summary of cleaned up transactions
SELECT 
  'Summary of cleaned transactions:' as info,
  COUNT(*) as total_cleaned,
  COUNT(*) FILTER (WHERE status = 'rejected' AND paystack_status = 'duplicate') as marked_as_duplicate
FROM transactions
WHERE paystack_status = 'duplicate'
  AND type = 'deposit';
