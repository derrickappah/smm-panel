-- Add 'moolre_web' to deposit_method check constraint
-- This allows Moolre Web payment transactions to be properly labeled
-- Run this in Supabase SQL Editor

-- Drop the existing constraint
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_deposit_method_check;

-- Recreate the constraint with 'moolre_web' included
ALTER TABLE transactions
ADD CONSTRAINT transactions_deposit_method_check
CHECK (deposit_method IN ('paystack', 'manual', 'momo', 'hubtel', 'korapay', 'ref_bonus', 'moolre', 'moolre_web'));

-- Update comment
COMMENT ON COLUMN transactions.deposit_method IS 'Method used for deposit: paystack, manual, momo, hubtel, korapay, ref_bonus (referral bonus), moolre, or moolre_web';
