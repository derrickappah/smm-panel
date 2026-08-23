-- Migration: 20260823_create_banned_users_table_and_trigger.sql
-- Description: Creates the public.banned_users table, RLS policies, and an automatic trigger to sync bans from auth.users.

CREATE TABLE IF NOT EXISTS public.banned_users (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    reason TEXT DEFAULT 'Suspended by admin',
    banned_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.banned_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role and admins to manage banned_users" ON public.banned_users;

CREATE POLICY "Allow service role and admins to manage banned_users"
    ON public.banned_users
    FOR ALL
    USING (
        auth.role() = 'service_role' OR
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND (profiles.role = 'admin' OR profiles.role = 'superadmin')
        )
    );

-- Backfill existing banned users from auth.users
INSERT INTO public.banned_users (user_id, reason, banned_at)
SELECT id, 'Suspended user (banned_until set)', COALESCE(banned_until, now())
FROM auth.users
WHERE banned_until IS NOT NULL AND banned_until > now()
ON CONFLICT (user_id) DO NOTHING;

-- Automatic trigger function to sync bans when auth.users.banned_until changes
CREATE OR REPLACE FUNCTION public.sync_auth_user_ban_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.banned_until IS NOT NULL AND NEW.banned_until > now() THEN
        INSERT INTO public.banned_users (user_id, reason, banned_at)
        VALUES (NEW.id, 'Account suspended in auth.users', COALESCE(NEW.banned_until, now()))
        ON CONFLICT (user_id) DO NOTHING;
    ELSE
        DELETE FROM public.banned_users WHERE user_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_ban_sync ON auth.users;

CREATE TRIGGER on_auth_user_ban_sync
AFTER UPDATE OF banned_until ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_auth_user_ban_status();
