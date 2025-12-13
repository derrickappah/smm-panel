-- Add safe function to update paystack_reference
-- This function ensures no duplicate references are created
-- Run this in Supabase SQL Editor

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS safe_update_paystack_reference(UUID, TEXT);

-- Create function to safely update paystack_reference
CREATE OR REPLACE FUNCTION safe_update_paystack_reference(
  p_transaction_id UUID,
  p_reference TEXT
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  transaction_id UUID,
  existing_transaction_id UUID
) AS $$
DECLARE
  v_existing_tx_id UUID;
  v_current_ref TEXT;
BEGIN
  -- Check if transaction exists
  SELECT paystack_reference INTO v_current_ref
  FROM transactions
  WHERE id = p_transaction_id;
  
  IF v_current_ref IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Transaction not found'::TEXT, p_transaction_id, NULL::UUID;
    RETURN;
  END IF;
  
  -- If transaction already has this reference, success
  IF v_current_ref = p_reference THEN
    RETURN QUERY SELECT TRUE, 'Reference already set'::TEXT, p_transaction_id, NULL::UUID;
    RETURN;
  END IF;
  
  -- Check if another transaction already has this reference
  SELECT id INTO v_existing_tx_id
  FROM transactions
  WHERE paystack_reference = p_reference
    AND id != p_transaction_id
  LIMIT 1;
  
  IF v_existing_tx_id IS NOT NULL THEN
    -- Another transaction has this reference
    RETURN QUERY SELECT 
      FALSE,
      'Another transaction already has this reference'::TEXT,
      p_transaction_id,
      v_existing_tx_id;
    RETURN;
  END IF;
  
  -- Safe to update
  UPDATE transactions
  SET paystack_reference = p_reference
  WHERE id = p_transaction_id;
  
  IF FOUND THEN
    RETURN QUERY SELECT TRUE, 'Reference updated successfully'::TEXT, p_transaction_id, NULL::UUID;
  ELSE
    RETURN QUERY SELECT FALSE, 'Transaction not found'::TEXT, p_transaction_id, NULL::UUID;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION safe_update_paystack_reference(UUID, TEXT) TO service_role, authenticated;

-- Add comment
COMMENT ON FUNCTION safe_update_paystack_reference IS 'Safely updates paystack_reference on a transaction, ensuring no duplicate references are created. Returns the existing transaction ID if a duplicate is detected.';
