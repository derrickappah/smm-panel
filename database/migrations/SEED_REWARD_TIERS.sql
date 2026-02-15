-- Seed Reward Tiers (Force Insert)
-- Run this if your reward tiers are missing!

INSERT INTO reward_tiers (name, required_amount, reward_likes, reward_views, position)
VALUES 
    ('Tier 1', 15.00, 500, 1000, 1),
    ('Tier 2', 25.00, 1000, 2000, 2),
    ('Tier 3', 50.00, 2500, 5000, 3);
