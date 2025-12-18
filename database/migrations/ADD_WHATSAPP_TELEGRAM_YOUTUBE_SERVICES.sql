-- Add Services for WhatsApp, Telegram, and Additional YouTube Services
-- Run this in Supabase SQL Editor
-- 
-- IMPORTANT: If you get a constraint error, first run UPDATE_PLATFORM_CONSTRAINT_FOR_WHATSAPP_TELEGRAM.sql
-- to update the platform check constraint to allow whatsapp and telegram platforms

-- Step 1: Update platform constraint to include whatsapp and telegram
ALTER TABLE services 
DROP CONSTRAINT IF EXISTS services_platform_check;

ALTER TABLE services 
ADD CONSTRAINT services_platform_check 
CHECK (platform IN ('instagram', 'tiktok', 'youtube', 'facebook', 'twitter', 'whatsapp', 'telegram'));

-- WhatsApp Services
INSERT INTO services (platform, service_type, name, rate, min_quantity, max_quantity, description, enabled) VALUES
('whatsapp', 'members', 'WhatsApp Group Members', 4.00, 50, 10000, 'Add real WhatsApp group members to your group', TRUE),
('whatsapp', 'views', 'WhatsApp Channel Views', 2.50, 100, 100000, 'Increase views on your WhatsApp channel posts', TRUE),
('whatsapp', 'subscribers', 'WhatsApp Channel Subscribers', 5.00, 100, 50000, 'Get real WhatsApp channel subscribers', TRUE),
('whatsapp', 'reactions', 'WhatsApp Status Reactions', 3.00, 50, 50000, 'Get reactions on your WhatsApp status updates', TRUE);

-- Telegram Services
INSERT INTO services (platform, service_type, name, rate, min_quantity, max_quantity, description, enabled) VALUES
('telegram', 'members', 'Telegram Group Members', 3.50, 100, 100000, 'Add real Telegram group members', TRUE),
('telegram', 'subscribers', 'Telegram Channel Subscribers', 4.50, 100, 500000, 'Get real Telegram channel subscribers', TRUE),
('telegram', 'views', 'Telegram Channel Views', 2.00, 1000, 10000000, 'Increase views on your Telegram channel posts', TRUE),
('telegram', 'reactions', 'Telegram Post Reactions', 2.50, 50, 100000, 'Get reactions on your Telegram posts', TRUE);

-- Additional YouTube Services
INSERT INTO services (platform, service_type, name, rate, min_quantity, max_quantity, description, enabled) VALUES
('youtube', 'watch_hours', 'YouTube Watch Hours', 8.00, 100, 4000, 'Get watch hours for YouTube monetization', TRUE),
('youtube', 'shares', 'YouTube Shares', 3.00, 50, 10000, 'Increase shares on your YouTube videos', TRUE),
('youtube', 'live_stream_viewers', 'YouTube Live Viewers', 4.00, 100, 50000, 'Get viewers for your YouTube live streams', TRUE);

-- Verify services were inserted
SELECT 
    platform,
    COUNT(*) as service_count,
    MIN(rate) as min_rate,
    MAX(rate) as max_rate
FROM services
WHERE platform IN ('whatsapp', 'telegram', 'youtube')
GROUP BY platform
ORDER BY platform;

-- Show all new services
SELECT 
    id,
    platform,
    service_type,
    name,
    rate,
    min_quantity,
    max_quantity,
    enabled
FROM services
WHERE platform IN ('whatsapp', 'telegram')
   OR (platform = 'youtube' AND service_type IN ('watch_hours', 'shares', 'live_stream_viewers'))
ORDER BY platform, service_type;
