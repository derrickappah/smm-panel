-- Add whatsapp_number setting to app_settings table
-- Run this in Supabase SQL Editor

-- Insert default whatsapp number setting
INSERT INTO app_settings (key, value, description) 
VALUES 
    ('whatsapp_number', '0500865092', 'WhatsApp number for support and deposits')
ON CONFLICT (key) DO NOTHING;
