-- Fix RLS Policies Script
-- Run this if you're getting 500 errors on SELECT queries
-- This will recreate all RLS policies correctly

-- First, temporarily disable RLS to check if that's the issue
-- (Don't do this in production without proper security!)

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Anyone can view services" ON services;
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Users can create own orders" ON orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
DROP POLICY IF EXISTS "Admins can update orders" ON orders;
DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can create own transactions" ON transactions;
DROP POLICY IF EXISTS "Admins can view all transactions" ON transactions;
DROP POLICY IF EXISTS "Admins can update transactions" ON transactions;

-- Recreate Profiles Policies
CREATE POLICY "Users can view own profile" 
    ON profiles FOR SELECT 
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
    ON profiles FOR UPDATE 
    USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" 
    ON profiles FOR INSERT 
    WITH CHECK (auth.uid() = id);

-- Allow admins to view all profiles
-- Note: This uses a function to avoid circular dependency
-- For now, we'll use a simpler approach - admins can view all if they have admin role in their metadata
CREATE POLICY "Admins can view all profiles" 
    ON profiles FOR SELECT 
    USING (
        -- Check if current user is admin by checking their own profile
        -- This works because users can always see their own profile
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    );

-- Services Policies (public read)
CREATE POLICY "Anyone can view services" 
    ON services FOR SELECT 
    USING (true);

-- Orders Policies
CREATE POLICY "Users can view own orders" 
    ON orders FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own orders" 
    ON orders FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all orders" 
    ON orders FOR SELECT 
    USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    );

CREATE POLICY "Admins can update orders" 
    ON orders FOR UPDATE 
    USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    );

-- Transactions Policies
CREATE POLICY "Users can view own transactions" 
    ON transactions FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create own transactions" 
    ON transactions FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all transactions" 
    ON transactions FOR SELECT 
    USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    );

CREATE POLICY "Admins can update transactions" 
    ON transactions FOR UPDATE 
    USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    );

-- Verify policies were created
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd as command
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'services', 'orders', 'transactions')
ORDER BY tablename, policyname;

