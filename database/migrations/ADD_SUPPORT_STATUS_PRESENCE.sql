-- Migration: Add last_seen_at for Support Presence Tracking
-- This script adds heart-beat tracking for admin presence.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
COMMENT ON COLUMN profiles.last_seen_at IS 'Last time the user was seen active on the site (heartbeat).';

-- Allow anyone to view basic info of admin profiles (for presence check)
DROP POLICY IF EXISTS "Anyone can view admin profiles" ON profiles;
CREATE POLICY "Anyone can view admin profiles" 
    ON profiles FOR SELECT 
    USING (role = 'admin');

COMMENT ON POLICY "Anyone can view admin profiles" ON profiles IS 'Allows all users to see admin presence status.';
