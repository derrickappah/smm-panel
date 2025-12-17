-- Add comprehensive transaction types and additional columns
-- This migration expands the transaction system to record all balance-affecting transactions
-- Run this in Supabase SQL Editor

-- Step 1: Add new columns to transactions table
ALTER TABLE transactions 
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_classified BOOLEAN DEFAULT FALSE;

-- Step 2: Drop existing type constraint
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;

-- Step 3: Add new constraint with all transaction types
ALTER TABLE transactions 
ADD CONSTRAINT transactions_type_check 
CHECK (type IN ('deposit', 'order', 'refund', 'referral_bonus', 'manual_adjustment', 'unknown'));

-- Step 4: Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_admin_id ON transactions(admin_id);
CREATE INDEX IF NOT EXISTS idx_transactions_auto_classified ON transactions(auto_classified);
CREATE INDEX IF NOT EXISTS idx_transactions_type_description ON transactions(type, description);

-- Step 5: Update comments for documentation
COMMENT ON COLUMN transactions.type IS 'Transaction type: deposit (money added via payment), order (money spent), refund (money returned), referral_bonus (referral reward), manual_adjustment (admin balance change), unknown (unclassified)';
COMMENT ON COLUMN transactions.description IS 'Human-readable description of the transaction (e.g., reason for manual adjustment, refund details)';
COMMENT ON COLUMN transactions.admin_id IS 'Admin user who created this transaction (for manual adjustments and classifications)';
COMMENT ON COLUMN transactions.auto_classified IS 'Whether this transaction was automatically classified by the system';
