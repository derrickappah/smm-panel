-- Populate Services Table with Sample Data
-- Run this in Supabase SQL Editor after creating the services table

-- IMPORTANT: Run FIX_SERVICES_CONSTRAINT.sql first if you get constraint errors!

-- Clear existing services (optional - comment out if you want to keep existing)
-- DELETE FROM services;

-- Insert sample services for different platforms
-- These are example services - adjust rates and quantities based on your needs

-- Instagram Services
INSERT INTO services (platform, service_type, name, rate, min_quantity, max_quantity, description) VALUES
('instagram', 'followers', 'Instagram Followers - High Quality', 2.50, 100, 100000, 'High quality Instagram followers with real engagement'),
('instagram', 'likes', 'Instagram Likes - Real', 1.80, 50, 50000, 'Real Instagram likes from active accounts'),
('instagram', 'views', 'Instagram Video Views', 0.50, 1000, 1000000, 'Fast Instagram video views'),
('instagram', 'comments', 'Instagram Comments', 3.00, 10, 1000, 'Real Instagram comments'),
('instagram', 'story_views', 'Instagram Story Views', 0.30, 100, 100000, 'Instagram story views');

-- TikTok Services
INSERT INTO services (platform, service_type, name, rate, min_quantity, max_quantity, description) VALUES
('tiktok', 'followers', 'TikTok Followers', 3.00, 100, 50000, 'High quality TikTok followers'),
('tiktok', 'likes', 'TikTok Likes', 2.00, 100, 100000, 'TikTok video likes'),
('tiktok', 'views', 'TikTok Views', 0.80, 1000, 10000000, 'TikTok video views'),
('tiktok', 'shares', 'TikTok Shares', 4.00, 50, 5000, 'TikTok video shares');

-- YouTube Services
INSERT INTO services (platform, service_type, name, rate, min_quantity, max_quantity, description) VALUES
('youtube', 'subscribers', 'YouTube Subscribers', 5.00, 100, 100000, 'Real YouTube subscribers'),
('youtube', 'views', 'YouTube Views', 1.50, 1000, 10000000, 'YouTube video views'),
('youtube', 'likes', 'YouTube Likes', 2.50, 100, 100000, 'YouTube video likes'),
('youtube', 'comments', 'YouTube Comments', 4.00, 10, 1000, 'YouTube video comments');

-- Facebook Services
INSERT INTO services (platform, service_type, name, rate, min_quantity, max_quantity, description) VALUES
('facebook', 'page_likes', 'Facebook Page Likes', 3.50, 100, 100000, 'Facebook page likes'),
('facebook', 'post_likes', 'Facebook Post Likes', 2.00, 50, 50000, 'Facebook post likes'),
('facebook', 'followers', 'Facebook Followers', 4.00, 100, 100000, 'Facebook page followers'),
('facebook', 'shares', 'Facebook Shares', 3.00, 50, 10000, 'Facebook post shares');

-- Twitter Services
INSERT INTO services (platform, service_type, name, rate, min_quantity, max_quantity, description) VALUES
('twitter', 'followers', 'Twitter Followers', 3.00, 100, 100000, 'Real Twitter followers'),
('twitter', 'retweets', 'Twitter Retweets', 2.50, 50, 10000, 'Twitter retweets'),
('twitter', 'likes', 'Twitter Likes', 1.50, 100, 50000, 'Twitter likes'),
('twitter', 'views', 'Twitter Views', 0.40, 1000, 1000000, 'Twitter tweet views');

-- Verify services were inserted
SELECT 
    platform,
    COUNT(*) as service_count,
    MIN(rate) as min_rate,
    MAX(rate) as max_rate
FROM services
GROUP BY platform
ORDER BY platform;

-- Show all services
SELECT 
    id,
    platform,
    service_type,
    name,
    rate,
    min_quantity,
    max_quantity
FROM services
ORDER BY platform, service_type;

