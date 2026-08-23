-- Fix All RLS Policies Script
-- This script fixes RLS policies for profiles, services, orders, and transactions tables

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

-- Step 2: Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;

-- Step 3: Drop existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;

DROP POLICY IF EXISTS "Anyone can view services" ON services;
DROP POLICY IF EXISTS "Admins can manage services" ON services;

DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Users can create own orders" ON orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
DROP POLICY IF EXISTS "Admins can update orders" ON orders;

DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can create own transactions" ON transactions;
DROP POLICY IF EXISTS "Users can create own pending deposit transactions" ON transactions;
DROP POLICY IF EXISTS "Admins can view all transactions" ON transactions;
DROP POLICY IF EXISTS "Admins can insert transactions" ON transactions;
DROP POLICY IF EXISTS "Admins can update transactions" ON transactions;
DROP POLICY IF EXISTS "rls_transactions_insert_admin" ON transactions;
DROP POLICY IF EXISTS "rls_transactions_update_admin" ON transactions;
DROP POLICY IF EXISTS "rls_transactions_select_admin" ON transactions;
DROP POLICY IF EXISTS "rls_transactions_select_own" ON transactions;

-- Profiles Policies
CREATE POLICY "Users can view own profile" 
    ON profiles FOR SELECT 
    USING ((SELECT auth.uid()) = id);

CREATE POLICY "Users can update own profile" 
    ON profiles FOR UPDATE 
    USING ((SELECT auth.uid()) = id);

CREATE POLICY "Admins can view all profiles" 
    ON profiles FOR SELECT 
    USING (public.is_admin());

CREATE POLICY "Admins can update all profiles" 
    ON profiles FOR UPDATE 
    USING (public.is_admin());

-- Services Policies
CREATE POLICY "Anyone can view services" 
    ON services FOR SELECT 
    USING (true);

CREATE POLICY "Admins can manage services" 
    ON services FOR ALL 
    USING (public.is_admin());

-- Orders Policies
CREATE POLICY "Users can view own orders" 
    ON orders FOR SELECT 
    USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can create own orders" 
    ON orders FOR INSERT 
    WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Admins can view all orders" 
    ON orders FOR SELECT 
    USING (public.is_admin());

CREATE POLICY "Admins can update orders" 
    ON orders FOR UPDATE 
    USING (public.is_admin());

-- Transactions Policies
CREATE POLICY "Users can view own transactions" 
    ON transactions FOR SELECT 
    TO authenticated
    USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can create own pending deposit transactions" 
    ON transactions FOR INSERT 
    TO authenticated
    WITH CHECK (
        (auth.uid() = user_id)
        AND (status = 'pending')
        AND (type = 'deposit')
        AND (amount >= 0)
    );

CREATE POLICY "Admins can view all transactions" 
    ON transactions FOR SELECT 
    TO authenticated
    USING (public.is_admin());

CREATE POLICY "Admins can insert transactions" 
    ON transactions FOR INSERT 
    TO authenticated
    WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update transactions" 
    ON transactions FOR UPDATE 
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Recreate Security Triggers
CREATE OR REPLACE FUNCTION validate_profile_update()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.balance IS DISTINCT FROM OLD.balance OR NEW.role IS DISTINCT FROM OLD.role) THEN
        IF current_user IN ('authenticated', 'anon') THEN
            IF OLD.role != 'admin' THEN
                RAISE EXCEPTION 'Security Violation: Direct modification of balance or role is not allowed.';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_validate_profile_update ON profiles;
CREATE TRIGGER tr_validate_profile_update
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION validate_profile_update();

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
