-- fix(admin): Fix for balance_audit_log RLS violation and trigger function security
-- Redefine log_balance_change to be SECURITY DEFINER to bypass RLS for audit logging
-- Also add missing RLS policies for admin management of audit logs

-- 1. Fix log_balance_change to be SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.log_balance_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if balance actually changed
  IF COALESCE(OLD.balance, 0) IS DISTINCT FROM COALESCE(NEW.balance, 0) THEN
    INSERT INTO public.balance_audit_log (
      user_id,
      old_balance,
      new_balance,
      change_amount,
      change_reason,
      created_at
    )
    VALUES (
      NEW.id,
      COALESCE(OLD.balance, 0),
      COALESCE(NEW.balance, 0),
      COALESCE(NEW.balance, 0) - COALESCE(OLD.balance, 0),
      COALESCE(current_setting('application_name', true), 'unknown') || ' balance update',
      NOW()
    );
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error to warning but don't fail the user profile update
  RAISE WARNING 'Failed to log balance change for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Add RLS policies for balance_audit_log
-- Ensure RLS is enabled
ALTER TABLE public.balance_audit_log ENABLE ROW LEVEL SECURITY;

-- Allow admins to insert/update audit logs (rarely needed but prevents RLS violations)
DROP POLICY IF EXISTS rls_bal_audit_insert_admin ON public.balance_audit_log;
CREATE POLICY rls_bal_audit_insert_admin ON public.balance_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS rls_bal_audit_update_admin ON public.balance_audit_log;
CREATE POLICY rls_bal_audit_update_admin ON public.balance_audit_log
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Ensure select policy exists
DROP POLICY IF EXISTS rls_bal_audit_select_admin ON public.balance_audit_log;
CREATE POLICY rls_bal_audit_select_admin ON public.balance_audit_log
  FOR SELECT TO authenticated
  USING (is_admin());

-- Also grant permissions to authenticated users to invoke the trigger indirectly
GRANT INSERT ON public.balance_audit_log TO authenticated;
GRANT SELECT ON public.balance_audit_log TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION public.log_balance_change() IS 'Trigger function that logs all balance changes to balance_audit_log table. Runs with SECURITY DEFINER privileges.';
