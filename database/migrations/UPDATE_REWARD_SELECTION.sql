-- Migration: Add reward selection columns
-- This migration updates reward_settings and daily_reward_claims to support choosing between likes and views

-- 1. Update reward_settings with configurable amounts
ALTER TABLE reward_settings 
ADD COLUMN IF NOT EXISTS likes_amount NUMERIC(10, 0) NOT NULL DEFAULT 1000,
ADD COLUMN IF NOT EXISTS views_amount NUMERIC(10, 0) NOT NULL DEFAULT 1000;

-- Update initial row if it exists
UPDATE reward_settings 
SET likes_amount = 1000, views_amount = 1000 
WHERE likes_amount IS NULL OR views_amount IS NULL;

-- 2. Update daily_reward_claims to track selection
ALTER TABLE daily_reward_claims
ADD COLUMN IF NOT EXISTS reward_type TEXT DEFAULT 'likes',
ADD COLUMN IF NOT EXISTS reward_amount NUMERIC(10, 0);

-- Update existing records with fallback values
UPDATE daily_reward_claims
SET reward_type = 'likes', reward_amount = 1000
WHERE reward_type IS NULL;

-- Add check constraint for reward_type
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_reward_claims_reward_type_check') THEN
        ALTER TABLE daily_reward_claims ADD CONSTRAINT daily_reward_claims_reward_type_check CHECK (reward_type IN ('likes', 'views'));
    END IF;
END $$;

-- Update comments
COMMENT ON COLUMN reward_settings.likes_amount IS 'Number of likes offered as a reward choice';
COMMENT ON COLUMN reward_settings.views_amount IS 'Number of views offered as a reward choice';
COMMENT ON COLUMN daily_reward_claims.reward_type IS 'The type of reward selected by the user (likes or views)';
COMMENT ON COLUMN daily_reward_claims.reward_amount IS 'The amount of reward that was claimable at the time of claim';
