-- Add policy to allow public (unauthenticated) users to read terms and conditions
-- This is needed so users can view terms during signup before they are authenticated
-- Run this in Supabase SQL Editor

-- Drop existing policy if it exists (to allow re-running this migration)
DROP POLICY IF EXISTS "Public can read terms and conditions" ON app_settings;

-- Create policy to allow public (unauthenticated) users to read terms_and_conditions
CREATE POLICY "Public can read terms and conditions"
ON app_settings
FOR SELECT
TO public
USING (key = 'terms_and_conditions');

