-- Create daily_reward_claims table to track user reward claims
-- This table enforces once-per-day claims via unique constraint

-- Create the table
CREATE TABLE IF NOT EXISTS daily_reward_claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    deposit_total NUMERIC(10, 2) NOT NULL,
    link TEXT NOT NULL,
    claim_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add unique constraint to prevent duplicate claims per day
CREATE UNIQUE INDEX IF NOT EXISTS daily_reward_claims_user_date_unique 
    ON daily_reward_claims (user_id, claim_date);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS daily_reward_claims_user_id_idx ON daily_reward_claims(user_id);
CREATE INDEX IF NOT EXISTS daily_reward_claims_claim_date_idx ON daily_reward_claims(claim_date);
CREATE INDEX IF NOT EXISTS daily_reward_claims_created_at_idx ON daily_reward_claims(created_at DESC);

-- Enable Row Level Security
ALTER TABLE daily_reward_claims ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own reward claims" ON daily_reward_claims;
DROP POLICY IF EXISTS "Users can insert own reward claims" ON daily_reward_claims;
DROP POLICY IF EXISTS "Admins can view all reward claims" ON daily_reward_claims;

-- RLS Policies
-- Users can view their own claims
CREATE POLICY "Users can view own reward claims"
    ON daily_reward_claims FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own claims
CREATE POLICY "Users can insert own reward claims"
    ON daily_reward_claims FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Admins can view all claims
CREATE POLICY "Admins can view all reward claims"
    ON daily_reward_claims FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Grant permissions
GRANT SELECT, INSERT ON daily_reward_claims TO authenticated;

-- Add helpful comments
COMMENT ON TABLE daily_reward_claims IS 'Tracks daily reward claims. Unique constraint on (user_id, claim_date) enforces once-per-day claims.';
COMMENT ON COLUMN daily_reward_claims.deposit_total IS 'Total approved deposits for the claim date';
COMMENT ON COLUMN daily_reward_claims.link IS 'User submitted personal link (social media, etc.)';
COMMENT ON COLUMN daily_reward_claims.claim_date IS 'Date of claim (server date, not timestamp)';
