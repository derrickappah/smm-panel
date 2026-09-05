-- Fix Admin RLS Policies & Grants
-- This script fixes the circular dependency issue with admin policies and restores table permissions
-- Run this in your Supabase SQL Editor

-- Step 1: Create a function to check if user is admin (bypasses RLS, STABLE for query caching)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Step 2: Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;

-- Step 3: Grant table-level permissions to authenticated role
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.transactions TO authenticated;

-- Step 4: Drop existing admin policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
DROP POLICY IF EXISTS "Admins can update orders" ON orders;
DROP POLICY IF EXISTS "Admins can view all transactions" ON transactions;
DROP POLICY IF EXISTS "Admins can insert transactions" ON transactions;
DROP POLICY IF EXISTS "Admins can update transactions" ON transactions;
DROP POLICY IF EXISTS "rls_transactions_insert_admin" ON transactions;
DROP POLICY IF EXISTS "rls_transactions_update_admin" ON transactions;
DROP POLICY IF EXISTS "rls_transactions_select_admin" ON transactions;
DROP POLICY IF EXISTS "rls_profiles_update_admin" ON profiles;
DROP POLICY IF EXISTS "rls_profiles_select_admin" ON profiles;

-- Step 5: Recreate admin policies using the function wrapped in (SELECT ...) for InitPlan optimization
CREATE POLICY "Admins can view all profiles" 
    ON profiles FOR SELECT 
    USING ((SELECT public.is_admin()));

CREATE POLICY "Admins can update all profiles" 
    ON profiles FOR UPDATE 
    USING ((SELECT public.is_admin()));

CREATE POLICY "Admins can view all orders" 
    ON orders FOR SELECT 
    USING ((SELECT public.is_admin()));

CREATE POLICY "Admins can update orders" 
    ON orders FOR UPDATE 
    USING ((SELECT public.is_admin()));

CREATE POLICY "Admins can view all transactions" 
    ON transactions FOR SELECT 
    USING ((SELECT public.is_admin()));

CREATE POLICY "Admins can insert transactions" 
    ON transactions FOR INSERT 
    WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "Admins can update transactions" 
    ON transactions FOR UPDATE 
    USING ((SELECT public.is_admin()))
    WITH CHECK ((SELECT public.is_admin()));

-- Verify policies were created
SELECT 
    tablename,
    policyname,
    cmd as command
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'orders', 'transactions')
AND policyname LIKE '%Admin%'
ORDER BY tablename, policyname;
