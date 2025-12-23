-- Backfill moolre_id for existing Moolre transactions
-- This migration attempts to populate moolre_id for transactions that don't have it set
-- Run this in Supabase SQL Editor
--
-- Note: This migration only updates transactions that have moolre_reference set.
-- Transactions without moolre_reference will need to be updated manually or via API.

-- First, let's see how many transactions need updating
SELECT 
  COUNT(*) as total_moolre_transactions,
  COUNT(moolre_reference) as with_reference,
  COUNT(moolre_id) as with_id,
  COUNT(*) - COUNT(moolre_id) as missing_id
FROM transactions
WHERE deposit_method IN ('moolre', 'moolre_web');

-- This migration creates a function that can be called to backfill moolre_id
-- The actual backfilling should be done via the API endpoint /api/backfill-moolre-ids
-- which will call Moolre API for each transaction and update moolre_id

-- Create a function to mark transactions that need backfilling
CREATE OR REPLACE FUNCTION get_transactions_needing_moolre_id_backfill()
RETURNS TABLE (
  id UUID,
  moolre_reference TEXT,
  moolre_id TEXT,
  amount DECIMAL,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.moolre_reference,
    t.moolre_id,
    t.amount,
    t.created_at
  FROM transactions t
  WHERE t.deposit_method IN ('moolre', 'moolre_web')
    AND t.moolre_reference IS NOT NULL
    AND (t.moolre_id IS NULL OR t.moolre_id = '')
  ORDER BY t.created_at DESC
  LIMIT 1000; -- Limit to prevent timeout
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION get_transactions_needing_moolre_id_backfill() IS 
'Returns transactions that need moolre_id backfilled. Use /api/backfill-moolre-ids to actually perform the backfill.';

