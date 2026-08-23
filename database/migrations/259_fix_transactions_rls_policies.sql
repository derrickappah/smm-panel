-- Migration 259: Fix Transactions Table RLS Policies
-- Description: 
-- 1. Permits authenticated users to create pending deposit transactions with amount >= 0 (allowing manual deposit proof submissions).
-- 2. Grants administrators full INSERT and UPDATE permissions on the transactions table for manual adjustments, refunds, and audits.
-- 3. Cleans up redundant/overlapping policies on public.transactions.

-- Ensure is_admin() function exists and is robust
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- Drop redundant / outdated policies
DROP POLICY IF EXISTS "Users can create own pending deposit transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can create own transactions" ON public.transactions;
DROP POLICY IF EXISTS "rls_transactions_insert_admin" ON public.transactions;
DROP POLICY IF EXISTS "Admins can insert transactions" ON public.transactions;

DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
DROP POLICY IF EXISTS "rls_transactions_select_own" ON public.transactions;
DROP POLICY IF EXISTS "Admins can view all transactions" ON public.transactions;
DROP POLICY IF EXISTS "rls_transactions_select_admin" ON public.transactions;

DROP POLICY IF EXISTS "Admins can update transactions" ON public.transactions;
DROP POLICY IF EXISTS "rls_transactions_update_admin" ON public.transactions;
DROP POLICY IF EXISTS "Admins can update all transactions" ON public.transactions;

-- 1. SELECT: Users can view their own transactions
CREATE POLICY "Users can view own transactions"
    ON public.transactions FOR SELECT
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- 2. SELECT: Admins can view all transactions
CREATE POLICY "Admins can view all transactions"
    ON public.transactions FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- 3. INSERT: Users can create own pending deposit transactions (amount >= 0)
CREATE POLICY "Users can create own pending deposit transactions"
    ON public.transactions FOR INSERT
    TO authenticated
    WITH CHECK (
        (auth.uid() = user_id)
        AND (status = 'pending')
        AND (type = 'deposit')
        AND (amount >= 0)
    );

-- 4. INSERT: Admins can insert any transaction
CREATE POLICY "Admins can insert transactions"
    ON public.transactions FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

-- 5. UPDATE: Admins can update any transaction
CREATE POLICY "Admins can update transactions"
    ON public.transactions FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
