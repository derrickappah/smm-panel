-- Add Users Update Transactions Policy
-- This migration adds the missing RLS policy that allows users to update their own transactions
-- This is critical for deposit tracking - users need to update their transaction status and paystack_reference
-- Run this in Supabase SQL Editor

-- Drop existing policy if it exists (to avoid conflicts)
DROP POLICY IF EXISTS "Users can update own transactions" ON transactions;

-- Create policy for users to update their own transactions
-- This allows users to update status, paystack_reference, and other fields on their own transactions
CREATE POLICY "Users can update own transactions"
    ON transactions FOR UPDATE
    USING (auth.uid() = user_id);

-- Verify the policy was created
SELECT 
    tablename,
    policyname,
    cmd as command
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'transactions'
AND policyname LIKE '%update%'
ORDER BY policyname;

