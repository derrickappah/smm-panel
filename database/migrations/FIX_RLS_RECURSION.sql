-- Migration: Fix RLS Recursion and Consolidate Admin Checks
-- This script replaces recursive subqueries in RLS policies with a SECURITY DEFINER function.

-- 1. Create a security definer function to check admin status
-- This function bypasses RLS and prevents infinite recursion.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Use a direct query that bypasses RLS check on profiles
  -- This is safe because the function is SECURITY DEFINER
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN v_role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create a security definer function to check any role
-- Useful for future role-based checks
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Fix Profiles RLS Policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles" 
    ON profiles FOR SELECT 
    USING ( is_admin() );

-- 4. Fix Orders RLS Policies
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
CREATE POLICY "Admins can view all orders" 
    ON orders FOR SELECT 
    USING ( is_admin() );

DROP POLICY IF EXISTS "Admins can update orders" ON orders;
CREATE POLICY "Admins can update orders" 
    ON orders FOR UPDATE 
    USING ( is_admin() );

-- 5. Fix Transactions RLS Policies
DROP POLICY IF EXISTS "Admins can view all transactions" ON transactions;
CREATE POLICY "Admins can view all transactions" 
    ON transactions FOR SELECT 
    USING ( is_admin() );

DROP POLICY IF EXISTS "Admins can update transactions" ON transactions;
CREATE POLICY "Admins can update transactions" 
    ON transactions FOR UPDATE 
    USING ( is_admin() );

DROP POLICY IF EXISTS "Admins can insert transactions" ON transactions;
CREATE POLICY "Admins can insert transactions" 
    ON transactions FOR INSERT 
    WITH CHECK ( is_admin() );

-- 6. Fix App Settings RLS Policies
DROP POLICY IF EXISTS "Admins can read app settings" ON app_settings;
CREATE POLICY "Admins can read app settings"
    ON app_settings FOR SELECT
    USING ( is_admin() );

DROP POLICY IF EXISTS "Admins can update app settings" ON app_settings;
CREATE POLICY "Admins can update app settings"
    ON app_settings FOR UPDATE
    USING ( is_admin() );

DROP POLICY IF EXISTS "Admins can insert app settings" ON app_settings;
CREATE POLICY "Admins can insert app settings"
    ON app_settings FOR INSERT
    WITH CHECK ( is_admin() );

-- 7. Log this major fix
SELECT log_system_event(
    'security_patch_applied',
    'info',
    'database-fixer',
    'Fixed RLS infinite recursion by implementing is_admin() security definer function.',
    '{"affected_tables": ["profiles", "orders", "transactions", "app_settings"], "patch": "rls_recursion_fix"}'::JSONB,
    'system',
    'database'
);

COMMENT ON FUNCTION public.is_admin() IS 'Checks if the current authenticated user has the admin role. SECURITY DEFINER prevents RLS recursion.';
