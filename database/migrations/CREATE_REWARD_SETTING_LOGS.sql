-- Create reward_setting_logs table for audit trail
-- This table tracks all changes to the deposit limit setting

-- Create the table
CREATE TABLE IF NOT EXISTS reward_setting_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID NOT NULL REFERENCES profiles(id),
    old_value NUMERIC(10, 2) NOT NULL,
    new_value NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for performance
CREATE INDEX IF NOT EXISTS reward_setting_logs_admin_id_idx ON reward_setting_logs(admin_id);
CREATE INDEX IF NOT EXISTS reward_setting_logs_created_at_idx ON reward_setting_logs(created_at DESC);

-- Enable Row Level Security
ALTER TABLE reward_setting_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins can view reward setting logs" ON reward_setting_logs;
DROP POLICY IF EXISTS "Admins can insert reward setting logs" ON reward_setting_logs;

-- RLS Policies
-- Only admins can view logs
CREATE POLICY "Admins can view reward setting logs"
    ON reward_setting_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Only admins can insert logs (via backend API)
CREATE POLICY "Admins can insert reward setting logs"
    ON reward_setting_logs FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Grant permissions
GRANT SELECT, INSERT ON reward_setting_logs TO authenticated;

-- Add helpful comments
COMMENT ON TABLE reward_setting_logs IS 'Audit trail for reward deposit limit changes. Immutable log for compliance.';
COMMENT ON COLUMN reward_setting_logs.admin_id IS 'Admin user who made the change';
COMMENT ON COLUMN reward_setting_logs.old_value IS 'Previous deposit limit value';
COMMENT ON COLUMN reward_setting_logs.new_value IS 'New deposit limit value';
