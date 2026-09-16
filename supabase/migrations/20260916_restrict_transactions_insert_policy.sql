-- Migration: 20260916_restrict_transactions_insert_policy.sql
-- Restrict direct client INSERT on transactions to only allow legitimate manual deposits.
-- Prevents clients from injecting arbitrary amounts or fake gateway deposits directly into the database.

BEGIN;

-- Drop the overly broad insert policy
DROP POLICY IF EXISTS "Users can create own pending deposit transactions" ON public.transactions;

-- Create strict manual-only deposit insert policy
CREATE POLICY "Users can create own manual deposit transactions" 
  ON public.transactions FOR INSERT TO authenticated 
  WITH CHECK (
    auth.uid() = user_id 
    AND status = 'pending' 
    AND type = 'deposit'
    AND deposit_method = 'manual'
    AND amount = 0
    AND payment_proof_url IS NOT NULL
  );

COMMIT;
