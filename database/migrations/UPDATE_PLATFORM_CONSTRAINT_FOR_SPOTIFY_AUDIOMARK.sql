-- Update Platform Constraint to Include Spotify and Audio Mark
-- This migration updates the services_platform_check constraint to allow spotify and audiomark platforms
-- Run this in Supabase SQL Editor BEFORE running ADD_SPOTIFY_AUDIOMARK_SERVICES.sql

-- Step 1: Drop the existing platform constraint
ALTER TABLE services 
DROP CONSTRAINT IF EXISTS services_platform_check;

-- Step 2: Add the new constraint with all allowed platforms including spotify and audiomark
ALTER TABLE services 
ADD CONSTRAINT services_platform_check 
CHECK (platform IN ('instagram', 'tiktok', 'youtube', 'facebook', 'twitter', 'whatsapp', 'telegram', 'spotify', 'audiomark'));

-- Verify the constraint was updated
SELECT 
    constraint_name,
    check_clause
FROM information_schema.check_constraints 
WHERE constraint_name = 'services_platform_check'
AND table_name = 'services';

