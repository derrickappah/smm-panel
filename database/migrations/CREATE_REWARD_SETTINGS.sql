-- Create reward_settings table for admin-configurable deposit limits
-- This table stores global settings for the daily reward system

-- Create the table
CREATE TABLE IF NOT EXISTS reward_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    daily_deposit_limit NUMERIC(10, 2) NOT NULL DEFAULT 15.00 CHECK (daily_deposit_limit >= 1 AND daily_deposit_limit <= 10000),
    updated_by UUID REFERENCES profiles(id),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add constraint to ensure only one row exists
CREATE UNIQUE INDEX IF NOT EXISTS reward_settings_singleton ON reward_settings ((true));

-- Insert initial settings
INSERT INTO reward_settings (daily_deposit_limit)
VALUES (15.00)
ON CONFLICT DO NOTHING;

-- Enable Row Level Security
ALTER TABLE reward_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view reward settings" ON reward_settings;
DROP POLICY IF EXISTS "Admins can update reward settings" ON reward_settings;

-- RLS Policies
-- Anyone (authenticated users) can read settings to check eligibility
CREATE POLICY "Anyone can view reward settings"
    ON reward_settings FOR SELECT
    USING (true);

-- Only admins can update settings
CREATE POLICY "Admins can update reward settings"
    ON reward_settings FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Grant permissions
GRANT SELECT ON reward_settings TO authenticated;
GRANT UPDATE ON reward_settings TO authenticated;

-- Add helpful comment
COMMENT ON TABLE reward_settings IS 'Global settings for daily reward system. Only one row should exist.';
COMMENT ON COLUMN reward_settings.daily_deposit_limit IS 'Minimum deposit amount (GHS) required to claim daily reward';
