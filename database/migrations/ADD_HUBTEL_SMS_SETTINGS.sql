-- Migration: Add Hubtel SMS Gateway Settings and Provider Routing Preferences
-- Date: 2026-09-13

INSERT INTO public.app_settings (key, value, description)
VALUES 
  ('hubtel_client_id', '', 'Hubtel SMS API Client ID'),
  ('hubtel_client_secret', '', 'Hubtel SMS API Client Secret'),
  ('hubtel_sender_id', 'Boostupgh', 'Hubtel Approved Sender ID (Max 11 characters)'),
  ('primary_sms_provider', 'moolre', 'Primary SMS Provider for OTP & Notifications (moolre | hubtel)'),
  ('fallback_sms_provider', 'hubtel', 'Fallback SMS Provider if Primary fails (moolre | hubtel | none)')
ON CONFLICT (key) DO UPDATE 
SET description = EXCLUDED.description;
