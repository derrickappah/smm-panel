-- Migration: Implement Tiered Reward System
-- 1. Create reward_tiers table
-- 2. Modify daily_reward_claims to link to tiers and allow multiple claims per day (one per tier)
-- 3. Deprecate legacy columns in reward_settings (optional cleanliness, but we'll keep them for safety for now)

-- 1. Create reward_tiers table
CREATE TABLE IF NOT EXISTS reward_tiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    required_amount NUMERIC(10, 2) NOT NULL,
    reward_likes NUMERIC(10, 0) DEFAULT 0,
    reward_views NUMERIC(10, 0) DEFAULT 0,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE reward_tiers ENABLE ROW LEVEL SECURITY;

-- Policies for reward_tiers
-- Everyone can read
CREATE POLICY "Anyone can view reward tiers"
    ON reward_tiers FOR SELECT
    USING (true);

-- Only admins can modify
CREATE POLICY "Admins can manage reward tiers"
    ON reward_tiers FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Grant permissions
GRANT SELECT ON reward_tiers TO authenticated;
GRANT ALL ON reward_tiers TO service_role;


-- 2. Modify daily_reward_claims
-- Add tier_id column
ALTER TABLE daily_reward_claims
ADD COLUMN IF NOT EXISTS tier_id UUID REFERENCES reward_tiers(id);

-- Drop the old unique constraint (one claim per user per day)
DROP INDEX IF EXISTS daily_reward_claims_user_date_unique;

-- Add new unique constraint (one claim per user per day PER TIER)
-- Note: for existing claims where tier_id is NULL, this might be tricky.
-- Strategy: We will treat legacy claims (tier_id IS NULL) as a specific "legacy" tier implicitly via the index or update them.
-- For now, let's allow tier_id to be nullable for legacy records, but new claims should have it.

-- Create unique index including tier_id
-- We use COALESCE to handle NULL tier_ids if we want to enforce uniqueness even for legacy, 
-- but strictly speaking, we just want to ensure future tiered claims are unique.
CREATE UNIQUE INDEX IF NOT EXISTS daily_reward_claims_user_date_tier_unique 
    ON daily_reward_claims (user_id, claim_date, tier_id);


-- Seed initial tiers based on user request (15, 25, 50)
-- We check if table is empty to avoid duplicates on re-runs
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM reward_tiers) THEN
        INSERT INTO reward_tiers (name, required_amount, reward_likes, reward_views, position)
        VALUES 
            ('Tier 1', 15.00, 500, 1000, 1),
            ('Tier 2', 25.00, 1000, 2000, 2),
            ('Tier 3', 50.00, 2500, 5000, 3);
    END IF;
END $$;
