-- Migration: 261_persistent_device_identification_and_ban_system.sql
-- Description: Creates the user_devices table for persistent browser/device identification,
--              tracks anonymous and authenticated devices, and enforces device bans.

-- 1. Create public.user_devices table
CREATE TABLE IF NOT EXISTS public.user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    device_id_hash TEXT NOT NULL UNIQUE,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_banned BOOLEAN NOT NULL DEFAULT false,
    banned_at TIMESTAMPTZ,
    ban_reason TEXT,
    banned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_agent TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create indexes for high-frequency queries
CREATE INDEX IF NOT EXISTS idx_user_devices_device_hash ON public.user_devices(device_id_hash);
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON public.user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_is_banned ON public.user_devices(is_banned) WHERE is_banned = true;
CREATE INDEX IF NOT EXISTS idx_user_devices_last_seen_at ON public.user_devices(last_seen_at DESC);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

-- 4. Drop any pre-existing policies to allow idempotent re-runs
DROP POLICY IF EXISTS "Allow service role and admins full access on user_devices" ON public.user_devices;
DROP POLICY IF EXISTS "Allow authenticated users to view own devices" ON public.user_devices;

-- Policy 1: Service Role and Admins have full access
CREATE POLICY "Allow service role and admins full access on user_devices"
    ON public.user_devices
    FOR ALL
    USING (
        auth.role() = 'service_role' OR
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND (profiles.role = 'admin' OR profiles.role = 'superadmin')
        )
    );

-- Policy 2: Authenticated users can view their own device records (read-only)
CREATE POLICY "Allow authenticated users to view own devices"
    ON public.user_devices
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL AND user_id = auth.uid()
    );

-- 5. Trigger to automatically update updated_at column on user_devices
CREATE OR REPLACE FUNCTION public.handle_user_devices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_devices_updated_at ON public.user_devices;
CREATE TRIGGER trigger_user_devices_updated_at
BEFORE UPDATE ON public.user_devices
FOR EACH ROW
EXECUTE FUNCTION public.handle_user_devices_updated_at();

-- 6. Trigger to automatically mark devices banned when an admin bans a user
CREATE OR REPLACE FUNCTION public.sync_user_device_bans()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.banned_until IS NOT NULL AND NEW.banned_until > now() THEN
        -- User was banned, mark all associated devices as banned
        UPDATE public.user_devices
        SET is_banned = true,
            banned_at = COALESCE(NEW.banned_until, now()),
            ban_reason = 'Associated account suspended (' || COALESCE(NEW.email, NEW.id::text) || ')'
        WHERE user_id = NEW.id AND is_banned = false;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_sync_user_device_bans ON auth.users;
CREATE TRIGGER trigger_sync_user_device_bans
AFTER UPDATE OF banned_until ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_user_device_bans();

COMMENT ON TABLE public.user_devices IS 'Stores persistent browser/device identification hashes and ban statuses';
COMMENT ON COLUMN public.user_devices.device_id_hash IS 'HMAC-SHA-256 digest of the client device cookie';
COMMENT ON COLUMN public.user_devices.user_id IS 'Associated user ID in auth.users; NULL for anonymous visitors';
