-- Add moolre_id column to transactions table
-- This stores the Moolre-generated transaction ID (different from externalref)
-- Run this in Supabase SQL Editor

-- Add moolre_id column to store Moolre transaction ID
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS moolre_id TEXT;

-- Add comment for documentation
COMMENT ON COLUMN transactions.moolre_id IS 'Moolre-generated transaction ID (used with idtype: 2 for verification)';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_moolre_id ON transactions(moolre_id);
