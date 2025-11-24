-- Add paystack_status field to transactions table
-- Run this in Supabase SQL Editor

-- Add paystack_status column to store the actual Paystack payment status
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS paystack_status TEXT;

-- Add comment for documentation
COMMENT ON COLUMN transactions.paystack_status IS 'Paystack payment status: success, failed, abandoned, pending, etc. This is the actual status from Paystack API.';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_paystack_status ON transactions(paystack_status);

