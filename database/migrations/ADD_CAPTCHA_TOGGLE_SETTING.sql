-- Add require_captcha setting to app_settings table and update RLS policy
-- This allows admins to turn CAPTCHA protection on/off via the admin settings

INSERT INTO app_settings (key, value, description)
VALUES ('require_captcha', 'true', 'Require CAPTCHA verification for registration and login')
ON CONFLICT (key) DO NOTHING;

-- Recreate the public select policy to include require_captcha
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
        'require_captcha'::text
    ])
);
