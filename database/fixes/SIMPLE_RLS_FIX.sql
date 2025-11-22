-- Simple RLS Fix - Removes circular dependencies
-- Run this if you're still getting 500 errors

-- Drop all admin policies that might cause circular dependencies
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
DROP POLICY IF EXISTS "Admins can update orders" ON orders;
DROP POLICY IF EXISTS "Admins can view all transactions" ON transactions;
DROP POLICY IF EXISTS "Admins can update transactions" ON transactions;

-- Keep only the essential user policies
-- Users can view/update their own data
-- These should work without issues

-- For admin access, we'll create a simpler approach later
-- For now, focus on getting basic user operations working

-- Verify essential policies exist
SELECT 
    tablename,
    policyname,
    cmd
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'services', 'orders', 'transactions')
AND policyname NOT LIKE '%Admin%'
ORDER BY tablename, policyname;

-- Test query to see if you can read your own profile
-- Replace YOUR_USER_ID with your actual user ID
-- SELECT * FROM profiles WHERE id = 'YOUR_USER_ID';

