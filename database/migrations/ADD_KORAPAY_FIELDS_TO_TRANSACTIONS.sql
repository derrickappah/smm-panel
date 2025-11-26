-- Add Korapay-specific fields to transactions table
-- Run this in Supabase SQL Editor

-- Add korapay_reference column to store Korapay transaction reference
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS korapay_reference TEXT;

-- Add korapay_status column to store Korapay payment status
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS korapay_status TEXT;

-- Add korapay_error column to store any error messages from Korapay
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS korapay_error TEXT;

-- Add comments for documentation
COMMENT ON COLUMN transactions.korapay_reference IS 'Korapay transaction reference/ID';
COMMENT ON COLUMN transactions.korapay_status IS 'Korapay payment status: success, failed, pending, etc.';
COMMENT ON COLUMN transactions.korapay_error IS 'Error message from Korapay if payment failed';

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_korapay_reference ON transactions(korapay_reference);
CREATE INDEX IF NOT EXISTS idx_transactions_korapay_status ON transactions(korapay_status);
