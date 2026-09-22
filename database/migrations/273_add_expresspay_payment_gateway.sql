-- Migration: 273_add_expresspay_payment_gateway.sql
-- Description: Add expressPay Ghana payment gateway support, columns, app_settings, RLS policies, and universal approval handler

-- 1. Add expressPay columns to public.transactions
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS expresspay_token TEXT,
ADD COLUMN IF NOT EXISTS expresspay_order_id TEXT,
ADD COLUMN IF NOT EXISTS expresspay_status TEXT,
ADD COLUMN IF NOT EXISTS expresspay_transaction_id TEXT;

-- Create indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_transactions_expresspay_token ON public.transactions(expresspay_token);
CREATE INDEX IF NOT EXISTS idx_transactions_expresspay_order_id ON public.transactions(expresspay_order_id);

-- Update transactions_deposit_method_check constraint to include 'expresspay'
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_deposit_method_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_deposit_method_check 
CHECK (deposit_method IN ('paystack', 'manual', 'momo', 'hubtel', 'korapay', 'ref_bonus', 'moolre', 'moolre_web', 'expresspay'));

-- 2. Insert expressPay default app_settings
INSERT INTO public.app_settings (key, value, description)
VALUES 
  ('payment_method_expresspay_enabled', 'true', 'Enable/disable expressPay payment method'),
  ('payment_method_expresspay_min_deposit', '1', 'Minimum deposit amount for expressPay payment method'),
  ('expresspay_merchant_id', '332604139135', 'expressPay Ghana Merchant ID'),
  ('expresspay_api_key', 'yMKBvZToq1Qkv4Vx7jFqs-Qs84utOyvl5zmfrhO27q-T2pi8YTuGAKdS9TcKFDK-VEbuTviKFqzMF3qtQ4O', 'expressPay Ghana Security API Key'),
  ('expresspay_mode', 'sandbox', 'expressPay Ghana environment mode (sandbox or live)')
ON CONFLICT (key) DO UPDATE 
SET value = EXCLUDED.value,
    description = EXCLUDED.description;

-- 3. Update public whitelist policy for app_settings to include expressPay public keys
DROP POLICY IF EXISTS "rls_app_settings_public_whitelist" ON public.app_settings;

CREATE POLICY "rls_app_settings_public_whitelist" 
  ON public.app_settings FOR SELECT TO anon, authenticated
  USING (
    key = ANY (ARRAY[
      'payment_method_paystack_enabled'::text,
      'payment_method_manual_enabled'::text,
      'payment_method_hubtel_enabled'::text,
      'payment_method_korapay_enabled'::text,
      'payment_method_moolre_enabled'::text,
      'payment_method_moolre_web_enabled'::text,
      'payment_method_expresspay_enabled'::text,
      'payment_method_paystack_min_deposit'::text,
      'payment_method_manual_min_deposit'::text,
      'payment_method_hubtel_min_deposit'::text,
      'payment_method_korapay_min_deposit'::text,
      'payment_method_moolre_min_deposit'::text,
      'payment_method_moolre_web_min_deposit'::text,
      'payment_method_expresspay_min_deposit'::text,
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

-- 4. Update universal atomic approval function to support expresspay
CREATE OR REPLACE FUNCTION public.approve_deposit_transaction_universal_v2(
    p_transaction_id uuid,
    p_payment_method text DEFAULT 'paystack'::text,
    p_payment_status text DEFAULT 'success'::text,
    p_payment_reference text DEFAULT NULL::text,
    p_actual_amount numeric DEFAULT NULL::numeric,
    p_provider_event_id text DEFAULT NULL::text,
    p_admin_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(success boolean, message text, old_status text, new_status text, old_balance numeric, new_balance numeric, final_amount numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_transaction RECORD;
    v_profile RECORD;
    v_old_status TEXT;
    v_old_balance NUMERIC;
    v_new_balance NUMERIC;
    v_final_amount NUMERIC;
BEGIN
    -- 1. Lock the transaction row to prevent race conditions
    SELECT * INTO v_transaction
    FROM public.transactions
    WHERE id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Transaction not found'::TEXT, NULL::TEXT, NULL::TEXT, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC;
        RETURN;
    END IF;

    -- 2. Idempotency Check: check if provider_event_id was already credited on another transaction
    IF p_provider_event_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.transactions 
        WHERE (provider_event_id = p_provider_event_id OR moolre_id = p_provider_event_id OR hubtel_transaction_id = p_provider_event_id OR expresspay_transaction_id = p_provider_event_id) 
          AND id != p_transaction_id 
          AND status = 'approved'
    ) THEN
        RETURN QUERY SELECT FALSE, 'Duplicate provider event ID detected'::TEXT, v_transaction.status, v_transaction.status, NULL::NUMERIC, NULL::NUMERIC, NULL::NUMERIC;
        RETURN;
    END IF;

    -- 3. Determine authoritative credit amount (prioritize actual amount verified from gateway)
    v_final_amount := COALESCE(p_actual_amount, v_transaction.amount, 0);

    IF v_final_amount <= 0 THEN
        RETURN QUERY SELECT FALSE, 'Invalid deposit amount'::TEXT, v_transaction.status, v_transaction.status, NULL::NUMERIC, NULL::NUMERIC, v_final_amount;
        RETURN;
    END IF;

    -- 4. Validate transaction type
    IF v_transaction.type != 'deposit' THEN
        RETURN QUERY SELECT FALSE, 'Transaction is not a deposit'::TEXT, v_transaction.status, v_transaction.status, NULL::NUMERIC, NULL::NUMERIC, v_final_amount;
        RETURN;
    END IF;

    v_old_status := v_transaction.status;

    -- 5. If already approved, return idempotent success without duplicate crediting
    IF v_transaction.status = 'approved' THEN
        SELECT balance INTO v_old_balance FROM public.profiles WHERE id = v_transaction.user_id;
        RETURN QUERY SELECT TRUE, 'Transaction already approved'::TEXT, v_old_status, 'approved'::TEXT, v_old_balance, v_old_balance, v_transaction.amount;
        RETURN;
    END IF;

    -- 6. Check if status allows approval
    IF v_transaction.status NOT IN ('pending', 'rejected', 'expired') THEN
        RETURN QUERY SELECT FALSE, ('Transaction status is ' || v_transaction.status || ', cannot approve')::TEXT, v_old_status, v_old_status, NULL::NUMERIC, NULL::NUMERIC, v_final_amount;
        RETURN;
    END IF;

    -- 7. If expired, require admin authorization
    IF v_transaction.status = 'expired' AND p_admin_id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Only admins can approve an expired deposit'::TEXT, v_old_status, v_old_status, NULL::NUMERIC, NULL::NUMERIC, v_final_amount;
        RETURN;
    END IF;

    -- 8. Lock user profile row before balance mutation
    SELECT * INTO v_profile FROM public.profiles WHERE id = v_transaction.user_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'User profile not found'::TEXT, v_old_status, v_old_status, NULL::NUMERIC, NULL::NUMERIC, v_final_amount;
        RETURN;
    END IF;

    v_old_balance := COALESCE(v_profile.balance, 0);
    v_new_balance := v_old_balance + v_final_amount;

    -- 9. Update transaction record
    UPDATE public.transactions
    SET 
        status = 'approved',
        amount = v_final_amount,
        payment_method = COALESCE(p_payment_method, payment_method, deposit_method),
        provider_event_id = COALESCE(p_provider_event_id, provider_event_id),
        paystack_status = CASE WHEN p_payment_method = 'paystack' THEN COALESCE(p_payment_status, paystack_status, 'success') ELSE paystack_status END,
        paystack_reference = CASE WHEN p_payment_method = 'paystack' THEN COALESCE(p_payment_reference, paystack_reference) ELSE paystack_reference END,
        korapay_status = CASE WHEN p_payment_method = 'korapay' THEN COALESCE(p_payment_status, korapay_status, 'success') ELSE korapay_status END,
        korapay_reference = CASE WHEN p_payment_method = 'korapay' THEN COALESCE(p_payment_reference, korapay_reference) ELSE korapay_reference END,
        moolre_status = CASE WHEN p_payment_method IN ('moolre', 'moolre_web') THEN COALESCE(p_payment_status, moolre_status, 'success') ELSE moolre_status END,
        moolre_reference = CASE WHEN p_payment_method IN ('moolre', 'moolre_web') THEN COALESCE(p_payment_reference, moolre_reference) ELSE moolre_reference END,
        hubtel_status = CASE WHEN p_payment_method = 'hubtel' THEN COALESCE(p_payment_status, hubtel_status, 'Paid') ELSE hubtel_status END,
        hubtel_transaction_id = CASE WHEN p_payment_method = 'hubtel' THEN COALESCE(p_provider_event_id, hubtel_transaction_id) ELSE hubtel_transaction_id END,
        expresspay_status = CASE WHEN p_payment_method = 'expresspay' THEN COALESCE(p_payment_status, expresspay_status, 'Approved') ELSE expresspay_status END,
        expresspay_token = CASE WHEN p_payment_method = 'expresspay' THEN COALESCE(p_payment_reference, expresspay_token) ELSE expresspay_token END,
        expresspay_transaction_id = CASE WHEN p_payment_method = 'expresspay' THEN COALESCE(p_provider_event_id, expresspay_transaction_id) ELSE expresspay_transaction_id END,
        admin_approved_by = COALESCE(p_admin_id, admin_approved_by),
        admin_approved_at = CASE WHEN p_admin_id IS NOT NULL THEN NOW() ELSE admin_approved_at END,
        updated_at = NOW()
    WHERE id = p_transaction_id;

    -- 10. Atomic balance update
    UPDATE public.profiles 
    SET balance = v_new_balance,
        updated_at = NOW()
    WHERE id = v_transaction.user_id;

    RETURN QUERY SELECT TRUE, 'Deposit approved successfully'::TEXT, v_old_status, 'approved'::TEXT, v_old_balance, v_new_balance, v_final_amount;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.approve_deposit_transaction_universal_v2(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_deposit_transaction_universal_v2(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, UUID) TO service_role;
