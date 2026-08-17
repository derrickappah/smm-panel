-- Migration 251: Enforce a strict maximum limit of 3 administrators
-- Prevents adding or upgrading more than 3 accounts to the 'admin' role.

CREATE OR REPLACE FUNCTION public.enforce_max_admins()
RETURNS TRIGGER AS $$
DECLARE
    admin_count INTEGER;
BEGIN
    -- Only check if this row is being inserted as admin or updated to admin
    IF (TG_OP = 'INSERT' AND NEW.role = 'admin') OR 
       (TG_OP = 'UPDATE' AND NEW.role = 'admin' AND (OLD.role IS DISTINCT FROM NEW.role)) THEN
        
        -- Count existing admins excluding the current row
        SELECT COUNT(*) INTO admin_count
        FROM public.profiles
        WHERE role = 'admin' AND id <> NEW.id;

        IF admin_count >= 3 THEN
            RAISE EXCEPTION 'Admin limit reached: The system allows a maximum of 3 administrators.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger on public.profiles
DROP TRIGGER IF EXISTS trigger_enforce_max_admins ON public.profiles;

CREATE TRIGGER trigger_enforce_max_admins
BEFORE INSERT OR UPDATE OF role
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_max_admins();
