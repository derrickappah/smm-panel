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

-- Step 2: Create a temporary view to identify duplicates
-- This helps avoid parsing issues with window functions in UPDATE statements
CREATE OR REPLACE VIEW duplicate_transactions_to_clean AS
SELECT 
  id,
  paystack_reference,
  status,
  created_at,
  ROW_NUMBER() OVER (
    PARTITION BY paystack_reference 
    ORDER BY 
      CASE WHEN status = 'approved' THEN 0 ELSE 1 END,
      created_at ASC
  ) as rn
FROM transactions
WHERE paystack_reference IN (
  SELECT paystack_reference
  FROM transactions
  WHERE paystack_reference IS NOT NULL
    AND type = 'deposit'
  GROUP BY paystack_reference
  HAVING COUNT(*) > 1
)
  AND type = 'deposit'
  AND paystack_reference IS NOT NULL;

-- Step 3: Mark duplicates as rejected (keep rn=1, mark others)
UPDATE transactions
SET 
  status = 'rejected',
  paystack_status = 'duplicate',
  paystack_reference = NULL -- Remove reference to allow unique constraint
WHERE id IN (
  SELECT id 
  FROM duplicate_transactions_to_clean 
  WHERE rn > 1
);

-- Step 4: Drop the temporary view
DROP VIEW IF EXISTS duplicate_transactions_to_clean;

-- Step 5: Log cleanup results
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

-- Step 6: Show summary of cleaned up transactions
SELECT 
  'Summary of cleaned transactions:' as info,
  COUNT(*) as total_cleaned,
  COUNT(*) FILTER (WHERE status = 'rejected' AND paystack_status = 'duplicate') as marked_as_duplicate
FROM transactions
WHERE paystack_status = 'duplicate'
  AND type = 'deposit';
