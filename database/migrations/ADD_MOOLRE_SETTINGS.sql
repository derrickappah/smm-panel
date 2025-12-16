-- Add Moolre payment method settings to app_settings table
-- Run this in Supabase SQL Editor

-- Insert default Moolre payment method settings
INSERT INTO app_settings (key, value, description) 
VALUES 
    ('payment_method_moolre_enabled', 'true', 'Enable/disable Moolre payment method'),
    ('payment_method_moolre_min_deposit', '1', 'Minimum deposit amount for Moolre payment method')
ON CONFLICT (key) DO NOTHING;
