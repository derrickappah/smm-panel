-- Add Moolre Web payment method settings to app_settings table
-- Run this in Supabase SQL Editor

-- Insert default Moolre Web payment method settings
INSERT INTO app_settings (key, value, description) 
VALUES 
    ('payment_method_moolre_web_enabled', 'true', 'Enable/disable Moolre Web payment method'),
    ('payment_method_moolre_web_min_deposit', '1', 'Minimum deposit amount for Moolre Web payment method')
ON CONFLICT (key) DO NOTHING;
