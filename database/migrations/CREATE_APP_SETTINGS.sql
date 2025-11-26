-- Create app_settings table for storing application-wide settings
-- Run this in Supabase SQL Editor

-- Create app_settings table
CREATE TABLE IF NOT EXISTS app_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(key);

-- Insert default payment method settings (all enabled by default)
INSERT INTO app_settings (key, value, description) 
VALUES 
    ('payment_method_paystack_enabled', 'true', 'Enable/disable Paystack payment method'),
    ('payment_method_manual_enabled', 'true', 'Enable/disable Manual (Mobile Money) payment method'),
    ('payment_method_hubtel_enabled', 'true', 'Enable/disable Hubtel payment method'),
    ('payment_method_korapay_enabled', 'true', 'Enable/disable Korapay payment method')
ON CONFLICT (key) DO NOTHING;

-- Add comment
COMMENT ON TABLE app_settings IS 'Application-wide settings stored as key-value pairs';

-- Enable RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to allow re-running this migration)
DROP POLICY IF EXISTS "Admins can read app settings" ON app_settings;
DROP POLICY IF EXISTS "Admins can update app settings" ON app_settings;
DROP POLICY IF EXISTS "Admins can insert app settings" ON app_settings;
DROP POLICY IF EXISTS "Authenticated users can read app settings" ON app_settings;

-- Policy: Admins can read all settings
CREATE POLICY "Admins can read app settings"
ON app_settings
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
);

-- Policy: Admins can update all settings
CREATE POLICY "Admins can update app settings"
ON app_settings
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
);

-- Policy: Admins can insert settings
CREATE POLICY "Admins can insert app settings"
ON app_settings
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
);

-- Policy: All authenticated users can read settings (for checking payment method availability)
CREATE POLICY "Authenticated users can read app settings"
ON app_settings
FOR SELECT
TO authenticated
USING (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_app_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_app_settings_updated_at ON app_settings;

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON app_settings
FOR EACH ROW
EXECUTE FUNCTION update_app_settings_updated_at();

