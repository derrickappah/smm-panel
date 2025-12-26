-- Add Services for Spotify and Audio Mark
-- Run this in Supabase SQL Editor
-- 
-- IMPORTANT: If you get a constraint error, first run UPDATE_PLATFORM_CONSTRAINT_FOR_SPOTIFY_AUDIOMARK.sql
-- to update the platform check constraint to allow spotify and audiomark platforms

-- Step 1: Update platform constraint to include spotify and audiomark
ALTER TABLE services 
DROP CONSTRAINT IF EXISTS services_platform_check;

ALTER TABLE services 
ADD CONSTRAINT services_platform_check 
CHECK (platform IN ('instagram', 'tiktok', 'youtube', 'facebook', 'twitter', 'whatsapp', 'telegram', 'spotify', 'audiomark'));

-- Spotify Services
INSERT INTO services (platform, service_type, name, rate, min_quantity, max_quantity, description, enabled) VALUES
('spotify', 'followers', 'Spotify Followers', 3.50, 100, 100000, 'Get real Spotify followers for your artist profile', TRUE),
('spotify', 'monthly_listeners', 'Spotify Monthly Listeners', 4.00, 1000, 1000000, 'Increase your monthly listeners count on Spotify', TRUE),
('spotify', 'plays', 'Spotify Plays/Streams', 2.50, 1000, 10000000, 'Get plays and streams for your Spotify tracks', TRUE),
('spotify', 'playlist_followers', 'Spotify Playlist Followers', 3.00, 100, 500000, 'Increase followers for your Spotify playlists', TRUE),
('spotify', 'saves', 'Spotify Saves', 2.00, 500, 1000000, 'Get saves on your Spotify tracks and albums', TRUE);

-- Audio Mark Services
INSERT INTO services (platform, service_type, name, rate, min_quantity, max_quantity, description, enabled) VALUES
('audiomark', 'followers', 'Audio Mark Followers', 3.50, 100, 100000, 'Get real Audio Mark followers for your artist profile', TRUE),
('audiomark', 'plays', 'Audio Mark Plays/Streams', 2.50, 1000, 10000000, 'Get plays and streams for your Audio Mark tracks', TRUE),
('audiomark', 'likes', 'Audio Mark Likes', 2.00, 500, 1000000, 'Get likes on your Audio Mark tracks', TRUE),
('audiomark', 'monthly_listeners', 'Audio Mark Monthly Listeners', 4.00, 1000, 1000000, 'Increase your monthly listeners count on Audio Mark', TRUE);

-- Verify services were inserted
SELECT 
    platform,
    COUNT(*) as service_count,
    MIN(rate) as min_rate,
    MAX(rate) as max_rate
FROM services
WHERE platform IN ('spotify', 'audiomark')
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
WHERE platform IN ('spotify', 'audiomark')
ORDER BY platform, service_type;

