-- Add Hubtel-specific fields to transactions table
-- Run this in Supabase SQL Editor

-- 1. Add new columns if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'client_reference') THEN
        ALTER TABLE transactions ADD COLUMN client_reference VARCHAR(32) UNIQUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'checkout_id') THEN
        ALTER TABLE transactions ADD COLUMN checkout_id VARCHAR(255);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'hubtel_transaction_id') THEN
        ALTER TABLE transactions ADD COLUMN hubtel_transaction_id VARCHAR(255);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'external_transaction_id') THEN
        ALTER TABLE transactions ADD COLUMN external_transaction_id VARCHAR(255);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'payment_method') THEN
        ALTER TABLE transactions ADD COLUMN payment_method VARCHAR(50);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'raw_initiate_response') THEN
        ALTER TABLE transactions ADD COLUMN raw_initiate_response JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'raw_callback') THEN
        ALTER TABLE transactions ADD COLUMN raw_callback JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'raw_status_check') THEN
        ALTER TABLE transactions ADD COLUMN raw_status_check JSONB;
    END IF;
END $$;

-- 2. Update the deposit_method check constraint to ensure 'hubtel' is included
-- Note: It might already be there from ADD_HUBTEL_TO_DEPOSIT_METHOD.sql
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_deposit_method_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_deposit_method_check 
CHECK (deposit_method IN ('paystack', 'manual', 'momo', 'hubtel', 'korapay', 'moolre', 'moolre_web'));

-- 3. Add index on client_reference for faster lookups
CREATE INDEX IF NOT EXISTS idx_transactions_client_reference ON transactions(client_reference);

-- 4. Add comment
COMMENT ON COLUMN transactions.client_reference IS 'Hubtel unique client reference (max 32 chars)';
COMMENT ON COLUMN transactions.checkout_id IS 'Hubtel Checkout ID';
