-- Fix RLS Policy to Allow Viewing Referred User Profiles
-- Using SECURITY DEFINER function to safely check referrals without recursion

-- Step 1: Drop only the policies we're recreating (don't drop is_admin() function - it's used by other policies)
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view referred profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own referrals" ON referrals;
DROP POLICY IF EXISTS "Admins can view all referrals" ON referrals;
DROP FUNCTION IF EXISTS public.check_user_is_admin();
DROP FUNCTION IF EXISTS public.is_admin(UUID);
DROP FUNCTION IF EXISTS public.user_referred_profile(UUID, UUID);
-- Note: We don't drop is_admin() because it's used by other policies

-- Step 2: Create a SECURITY DEFINER function to check if user referred a profile
-- This function bypasses RLS when querying referrals
CREATE OR REPLACE FUNCTION public.user_referred_profile(p_referrer_id UUID, p_referee_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- SECURITY DEFINER bypasses RLS, so this won't cause recursion
    RETURN EXISTS (
        SELECT 1 FROM public.referrals
        WHERE referrer_id = p_referrer_id
        AND referee_id = p_referee_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.user_referred_profile(UUID, UUID) TO authenticated;

-- Step 3: Create simple policies
-- Policy 1: Users can view their own profile
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

-- Policy 2: Users can view profiles of users they've referred
-- Uses the SECURITY DEFINER function to avoid recursion
CREATE POLICY "Users can view referred profiles"
    ON profiles FOR SELECT
    USING (public.user_referred_profile(auth.uid(), id));

-- Step 4: Ensure is_admin() function exists and is correct (CREATE OR REPLACE won't drop dependent policies)
-- If the function already exists from FIX_ADMIN_RLS.sql, this will just update it if needed
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    -- SECURITY DEFINER bypasses RLS, so this won't cause recursion
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute to authenticated users (idempotent - won't error if already granted)
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Step 5: Add admin policy for profiles (using function to avoid recursion)
CREATE POLICY "Admins can view all profiles"
    ON profiles FOR SELECT
    USING (public.is_admin());

-- Step 6: Referrals table policies
-- Users can view referrals where they are the referrer
CREATE POLICY "Users can view own referrals"
    ON referrals FOR SELECT
    USING (auth.uid() = referrer_id);

-- Admins can view all referrals
CREATE POLICY "Admins can view all referrals"
    ON referrals FOR SELECT
    USING (public.is_admin());
