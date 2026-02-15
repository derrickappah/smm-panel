-- Fix RLS Policies for Reward Tiers
-- This ensures that users can actually SEE the rewards in the database.

BEGIN;

-- 1. Enable RLS (just in case)
ALTER TABLE reward_tiers ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Anyone can view reward tiers" ON reward_tiers;
DROP POLICY IF EXISTS "Admins can manage reward tiers" ON reward_tiers;
DROP POLICY IF EXISTS "Service role has full access" ON reward_tiers;

-- 3. Re-create policies

-- ALLOW READ access for everyone (authenticated & anon)
CREATE POLICY "Anyone can view reward tiers"
ON reward_tiers FOR SELECT
USING (true);

-- ALLOW FULL access for service_role
CREATE POLICY "Service role has full access"
ON reward_tiers FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ALLOW FULL access for Admins
CREATE POLICY "Admins can manage reward tiers"
ON reward_tiers FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

COMMIT;
