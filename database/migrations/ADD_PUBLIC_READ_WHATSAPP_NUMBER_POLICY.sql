-- Add policy to allow public (unauthenticated) users to read the WhatsApp number setting
-- This is needed so users can see the WhatsApp button correctly before they are authenticated
-- Run this in Supabase SQL Editor

-- Drop existing policy if it exists (to allow re-running this migration)
DROP POLICY IF EXISTS "Public can read whatsapp number" ON app_settings;

-- Create policy to allow public (unauthenticated) users to read whatsapp_number
CREATE POLICY "Public can read whatsapp number"
ON app_settings
FOR SELECT
TO public
USING (key = 'whatsapp_number');
