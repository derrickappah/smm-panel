-- Add manual deposit details settings to app_settings table
-- Run this in Supabase SQL Editor

-- Insert default manual deposit settings
INSERT INTO app_settings (key, value, description) 
VALUES 
    ('manual_deposit_phone_number', '0559272762', 'Phone number for manual deposit payments'),
    ('manual_deposit_account_name', 'MTN - APPIAH MANASSEH ATTAH', 'Account holder name for manual deposits'),
    ('manual_deposit_instructions', 'Make PAYMENT to 0559272762\nMTN - APPIAH MANASSEH ATTAH\nuse your USERNAME as reference\nsend SCREENSHOT of PAYMENT when done', 'Instructions text for manual deposit process')
ON CONFLICT (key) DO NOTHING;

-- Add comments for documentation
COMMENT ON COLUMN app_settings.value IS 'Setting value - can be text, number, or JSON';
