-- Add Paystack Reference to Transactions
-- This allows us to verify payment status with Paystack API
-- Run this in Supabase SQL Editor

-- Add paystack_reference column to transactions table
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS paystack_reference TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_transactions_paystack_reference ON transactions(paystack_reference) WHERE paystack_reference IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN transactions.paystack_reference IS 'Paystack payment reference for verifying payment status';

