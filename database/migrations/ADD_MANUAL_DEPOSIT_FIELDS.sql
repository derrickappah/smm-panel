-- Add fields for manual deposit (Mobile Money) transactions
-- Run this in Supabase SQL Editor

-- Add momo_number column to store the Mobile Money number used for payment
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS momo_number TEXT;

-- Add manual_reference column to store the reference used in the payment
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS manual_reference TEXT;

-- Add payment_proof_url column to store URL of payment proof/screenshot
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS payment_proof_url TEXT;

-- Add deposit_method column to distinguish between Paystack and Manual (Mobile Money)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS deposit_method TEXT CHECK (deposit_method IN ('paystack', 'manual', 'momo'));

-- Add comments for documentation
COMMENT ON COLUMN transactions.momo_number IS 'Mobile Money number used for manual deposit payment';
COMMENT ON COLUMN transactions.manual_reference IS 'Reference used in manual deposit payment (usually username)';
COMMENT ON COLUMN transactions.payment_proof_url IS 'URL to payment proof/screenshot for manual deposits';
COMMENT ON COLUMN transactions.deposit_method IS 'Method used for deposit: paystack, manual, or momo';

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_transactions_deposit_method ON transactions(deposit_method);
CREATE INDEX IF NOT EXISTS idx_transactions_momo_number ON transactions(momo_number);

