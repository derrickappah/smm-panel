-- Update RLS policy for app_settings to allow public access to payment method settings
-- This fix ensures that the frontend can correctly identify which payment methods are enabled.

BEGIN;

-- Drop the existing restrictive select policy
DROP POLICY IF EXISTS "rls_app_settings_select_public" ON "public"."app_settings";

-- Create the updated policy with additional keys for payment methods
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
        'terms_and_conditions'::text
    ])
);

COMMIT;
