-- Migration 260: Grant Authenticated Table Privileges for Profiles & Transactions
-- Description:
-- Restores table-level UPDATE privileges on `public.profiles` and `public.transactions` to role `authenticated`.
-- Security is strictly enforced by:
-- 1. `tr_validate_profile_update` trigger (blocks non-admins from modifying balance or role).
-- 2. Row Level Security policies (`public.is_admin()`, `auth.uid() = id`).

BEGIN;

-- Table privileges for authenticated users
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.transactions TO authenticated;

-- Ensure triggers and functions are active
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

DROP TRIGGER IF EXISTS tr_validate_profile_update ON public.profiles;

CREATE TRIGGER tr_validate_profile_update
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_profile_update();

COMMIT;
