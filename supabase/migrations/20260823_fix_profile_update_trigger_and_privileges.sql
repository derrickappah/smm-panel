-- Migration: 20260823_fix_profile_update_trigger_and_privileges.sql
-- Description: Hardens validate_profile_update trigger function by using auth.role() and public.is_admin()
--              checks, eliminating the SECURITY DEFINER current_user defect, and restructures column permissions.

BEGIN;

-- 1. Replace flawed trigger function with auth.role() and public.is_admin() check
CREATE OR REPLACE FUNCTION public.validate_profile_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent non-admins from modifying balance or role directly
    IF (NEW.balance IS DISTINCT FROM OLD.balance OR NEW.role IS DISTINCT FROM OLD.role) THEN
        IF (auth.role() = 'authenticated' OR auth.role() = 'anon') AND NOT public.is_admin() THEN
            RAISE EXCEPTION 'Security Violation: Direct modification of balance or role is forbidden.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 2. Ensure the trigger is active on public.profiles
DROP TRIGGER IF EXISTS tr_validate_profile_update ON public.profiles;

CREATE TRIGGER tr_validate_profile_update
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_profile_update();

-- 3. Restrict column-level UPDATE grants for defense-in-depth
REVOKE UPDATE ON public.profiles FROM authenticated, anon, public;
GRANT UPDATE (name, phone_number, terms_accepted_at, last_seen_at, updated_at) ON public.profiles TO authenticated;

COMMIT;
