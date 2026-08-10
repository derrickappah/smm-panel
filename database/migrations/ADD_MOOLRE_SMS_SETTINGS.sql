-- Add Moolre SMS settings to app_settings table and update RLS policy
-- Allows admins to configure Moolre SMS credentials and toggle phone verification

INSERT INTO app_settings (key, value, description)
VALUES 
  ('require_phone_verification', 'true', 'Require phone number verification via Moolre SMS during user signup'),
  ('moolre_sender_id', 'BoostUpGH', 'Moolre Approved Sender ID for sending SMS notifications'),
  ('moolre_vaskey', '', 'Moolre API VAS Key (X-API-VASKEY) for SMS integration')
ON CONFLICT (key) DO NOTHING;

-- Recreate the public select policy to include public settings
DROP POLICY IF EXISTS "rls_app_settings_select_public" ON "public"."app_settings";

CREATE POLICY "rls_app_settings_select_public" ON "public"."app_settings"
AS PERMISSIVE FOR SELECT
TO anon, authenticated
USING (
    key = ANY (ARRAY[
        'payment_method_paystack_enabled'::text,
        'payment_method_manual_enabled'::text,
        'payment_method_hubtel_enabled'::text,
        'payment_method_korapay_enabled'::text,
        'payment_method_moolre_enabled'::text,
        'payment_method_moolre_web_enabled'::text,
        'payment_method_paystack_min_deposit'::text,
        'payment_method_manual_min_deposit'::text,
        'payment_method_hubtel_min_deposit'::text,
        'payment_method_korapay_min_deposit'::text,
        'payment_method_moolre_min_deposit'::text,
        'payment_method_moolre_web_min_deposit'::text,
        'manual_deposit_phone_number'::text,
        'manual_deposit_account_name'::text,
        'manual_deposit_instructions'::text,
        'whatsapp_number'::text,
        'terms_and_conditions'::text,
        'require_captcha'::text,
        'require_otp'::text,
        'require_phone_verification'::text,
        'moolre_sender_id'::text,
        'support_phone_number'::text
    ])
);
