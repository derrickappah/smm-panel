-- Migration 257: Harden Security Logging & Activity Log RLS (OWASP A09:2025 Remediation)
-- Restricts audit log creation to prevent regular clients from forging audit trails or framing users.

-- 1. Activity Logs RLS Hardening
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Drop legacy/overly-permissive policies
DROP POLICY IF EXISTS "Authenticated users can insert activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Users can insert own activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Authenticated users can only insert own logs" ON public.activity_logs;

-- Policy: Only allow authenticated users to insert their OWN basic info activity logs
-- Prevents spoofing other user IDs or inserting false security/admin logs from the client.
CREATE POLICY "Authenticated users can only insert own logs"
    ON public.activity_logs FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND severity = 'info'
    );

-- Policy: Service role has full permissions on activity_logs (used by serverless endpoints & background jobs)
CREATE POLICY "Service role full access on activity_logs"
    ON public.activity_logs FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 2. System Events Table RLS Hardening
ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view system events" ON public.system_events;
DROP POLICY IF EXISTS "Service role full access on system_events" ON public.system_events;
DROP POLICY IF EXISTS "No client inserts on system_events" ON public.system_events;

CREATE POLICY "Admins can view system events"
    ON public.system_events FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "Service role full access on system_events"
    ON public.system_events FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Revoke dangerous direct client table mutation permissions
REVOKE UPDATE, DELETE, TRUNCATE ON public.activity_logs FROM anon, authenticated, public;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.system_events FROM anon, authenticated, public;

COMMENT ON POLICY "Authenticated users can only insert own logs" ON public.activity_logs IS 
'Enforces audit log integrity: authenticated clients can only record their own actions with info severity.';
