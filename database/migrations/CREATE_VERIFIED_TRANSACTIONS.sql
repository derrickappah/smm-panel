-- Create Verified Transactions Table
-- This table stores which transactions have been verified to have their balance updated
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS verified_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
    verified_status TEXT NOT NULL CHECK (verified_status IN ('updated', 'not_updated', 'unknown')),
    verified_at TIMESTAMPTZ DEFAULT NOW(),
    verified_by UUID REFERENCES profiles(id) ON DELETE SET NULL, -- Admin who verified (optional)
    notes TEXT, -- Optional notes about the verification
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_verified_transactions_transaction_id ON verified_transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_verified_transactions_verified_status ON verified_transactions(verified_status);

-- Add comment for documentation
COMMENT ON TABLE verified_transactions IS 'Stores verification status of transactions to avoid re-checking already verified transactions';
COMMENT ON COLUMN verified_transactions.transaction_id IS 'Reference to the transaction that was verified';
COMMENT ON COLUMN verified_transactions.verified_status IS 'Status: updated (balance confirmed), not_updated (balance missing), unknown (cannot verify)';
COMMENT ON COLUMN verified_transactions.verified_by IS 'Admin user who verified this transaction (optional)';

-- Enable Row Level Security (RLS)
ALTER TABLE verified_transactions ENABLE ROW LEVEL SECURITY;

-- Policy for admins to view all verified transactions
CREATE POLICY "Admins can view all verified transactions"
    ON verified_transactions FOR SELECT
    USING (public.is_admin());

-- Policy for admins to insert verified transactions
CREATE POLICY "Admins can insert verified transactions"
    ON verified_transactions FOR INSERT
    WITH CHECK (public.is_admin());

-- Policy for admins to update verified transactions
CREATE POLICY "Admins can update verified transactions"
    ON verified_transactions FOR UPDATE
    USING (public.is_admin());

-- Policy for admins to delete verified transactions (for re-verification)
CREATE POLICY "Admins can delete verified transactions"
    ON verified_transactions FOR DELETE
    USING (public.is_admin());

-- Create a trigger to update `updated_at` timestamp
CREATE OR REPLACE FUNCTION update_verified_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER update_verified_transactions_updated_at
BEFORE UPDATE ON verified_transactions
FOR EACH ROW
EXECUTE FUNCTION update_verified_transactions_updated_at();

