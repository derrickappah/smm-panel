-- Update Platform Constraint to Include WhatsApp and Telegram
-- This migration updates the services_platform_check constraint to allow whatsapp and telegram platforms
-- Run this in Supabase SQL Editor BEFORE running ADD_WHATSAPP_TELEGRAM_YOUTUBE_SERVICES.sql

-- Step 1: Drop the existing platform constraint
ALTER TABLE services 
DROP CONSTRAINT IF EXISTS services_platform_check;

-- Step 2: Add the new constraint with all allowed platforms including whatsapp and telegram
ALTER TABLE services 
ADD CONSTRAINT services_platform_check 
CHECK (platform IN ('instagram', 'tiktok', 'youtube', 'facebook', 'twitter', 'whatsapp', 'telegram'));

-- Verify the constraint was updated
SELECT 
    constraint_name,
    check_clause
FROM information_schema.check_constraints 
WHERE constraint_name = 'services_platform_check'
AND table_name = 'services';
