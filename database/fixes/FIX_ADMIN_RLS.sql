-- Fix Admin RLS Policies
-- This script fixes the circular dependency issue with admin policies
-- Run this in your Supabase SQL Editor

-- Step 1: Create a function to check if user is admin (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 2: Drop existing admin policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
DROP POLICY IF EXISTS "Admins can update orders" ON orders;
DROP POLICY IF EXISTS "Admins can view all transactions" ON transactions;
DROP POLICY IF EXISTS "Admins can update transactions" ON transactions;

-- Step 3: Recreate admin policies using the function
CREATE POLICY "Admins can view all profiles" 
    ON profiles FOR SELECT 
    USING (public.is_admin());

CREATE POLICY "Admins can update all profiles" 
    ON profiles FOR UPDATE 
    USING (public.is_admin());

CREATE POLICY "Admins can view all orders" 
    ON orders FOR SELECT 
    USING (public.is_admin());

CREATE POLICY "Admins can update orders" 
    ON orders FOR UPDATE 
    USING (public.is_admin());

CREATE POLICY "Admins can view all transactions" 
    ON transactions FOR SELECT 
    USING (public.is_admin());

CREATE POLICY "Admins can update transactions" 
    ON transactions FOR UPDATE 
    USING (public.is_admin());

-- Step 4: Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;

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

