-- Migration: Harden Database Security
-- This script fixes critical vulnerabilities where users can update their own balance and role.

-- 1. Create a function to validate profile updates
CREATE OR REPLACE FUNCTION validate_profile_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if balance or role is being modified
    IF (NEW.balance IS DISTINCT FROM OLD.balance OR NEW.role IS DISTINCT FROM OLD.role) THEN
        -- Only allow the update if it's NOT coming from a non-admin role via PostgREST
        -- In Supabase, 'authenticated' and 'anon' are the roles used by PostgREST
        IF current_user IN ('authenticated', 'anon') THEN
            -- Check if the user is an admin by querying their profile
            -- (We use the OLD record's role to prevent a user from making themselves admin first)
            IF OLD.role != 'admin' THEN
                RAISE EXCEPTION 'Security Violation: Direct modification of balance or role is not allowed.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Add the trigger to profiles
DROP TRIGGER IF EXISTS tr_validate_profile_update ON profiles;
CREATE TRIGGER tr_validate_profile_update
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION validate_profile_update();

-- 3. Harden Transaction RLS
-- Users should never be able to insert an 'approved' transaction directly.
-- They should only create 'pending' deposits.
DROP POLICY IF EXISTS "Users can create own transactions" ON transactions;
CREATE POLICY "Users can create own transactions" 
    ON transactions FOR INSERT 
    WITH CHECK (
        auth.uid() = user_id 
        AND status = 'pending' 
        AND type = 'deposit'
    );

-- 4. Harden Profile RLS
-- We keep the "update own profile" policy but the trigger above will handle column-level security.
-- However, for extra safety, we can restrict it further.
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" 
    ON profiles FOR UPDATE 
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- 5. Revoke direct column updates for sensitive columns (optional but recommended)
-- This is a secondary layer of defense.
-- REVOKE UPDATE (balance, role) ON profiles FROM authenticated;
-- REVOKE UPDATE (amount, status, type) ON transactions FROM authenticated;

-- 6. Add comment to track this hardening
COMMENT ON TRIGGER tr_validate_profile_update ON profiles IS 'Critical security trigger to prevent unauthorized direct balance or role manipulation via PostgREST.';

-- 7. Log this hardening event
SELECT log_system_event(
    'security_patch_applied',
    'info',
    'system-hardener',
    'Applied HARDEN_DATABASE_SECURITY.sql to fix balance and role manipulation vulnerabilities.',
    '{"version": "1.0", "target": "profiles, transactions"}'::JSONB,
    'system',
    'database'
);
