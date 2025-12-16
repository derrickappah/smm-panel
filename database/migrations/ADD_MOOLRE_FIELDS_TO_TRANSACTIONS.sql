-- Add Moolre-specific fields to transactions table
-- Run this in Supabase SQL Editor

-- Add moolre_reference column to store Moolre transaction externalref
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS moolre_reference TEXT;

-- Add moolre_status column to store Moolre payment status
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS moolre_status TEXT;

-- Add moolre_error column to store any error messages from Moolre
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS moolre_error TEXT;

-- Add moolre_channel column to store network (MTN/AT/Vodafone)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS moolre_channel TEXT;

-- Add comments for documentation
COMMENT ON COLUMN transactions.moolre_reference IS 'Moolre transaction externalref/ID';
COMMENT ON COLUMN transactions.moolre_status IS 'Moolre payment status: success, failed, pending, etc.';
COMMENT ON COLUMN transactions.moolre_error IS 'Error message from Moolre if payment failed';
COMMENT ON COLUMN transactions.moolre_channel IS 'Mobile Money network used: MTN, AT (AirtelTigo), or Vodafone';

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_moolre_reference ON transactions(moolre_reference);
CREATE INDEX IF NOT EXISTS idx_transactions_moolre_status ON transactions(moolre_status);
