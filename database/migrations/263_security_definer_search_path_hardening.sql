-- Migration: 263_security_definer_search_path_hardening.sql
-- Description: Hardens historical PostgreSQL SECURITY DEFINER functions with explicit 
--              'SET search_path = public, pg_temp' to remediate OWASP A02:2025 Security Misconfigurations 
--              (Search Path Hijacking).

BEGIN;

-- 1. Hardened is_admin() function
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 2. Hardened log_balance_change() trigger function
CREATE OR REPLACE FUNCTION public.log_balance_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if balance actually changed
  IF COALESCE(OLD.balance, 0) IS DISTINCT FROM COALESCE(NEW.balance, 0) THEN
    INSERT INTO public.balance_audit_log (
      user_id,
      old_balance,
      new_balance,
      change_amount,
      change_reason,
      created_at
    )
    VALUES (
      NEW.id,
      COALESCE(OLD.balance, 0),
      COALESCE(NEW.balance, 0),
      COALESCE(NEW.balance, 0) - COALESCE(OLD.balance, 0),
      COALESCE(current_setting('application_name', true), 'unknown') || ' balance update',
      NOW()
    );
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error as warning without failing the user profile update
  RAISE WARNING 'Failed to log balance change for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 3. Hardened initialize_referral_wallet() trigger function
CREATE OR REPLACE FUNCTION public.initialize_referral_wallet()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.referral_wallets (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 4. Hardened process_referral_commission() trigger function
CREATE OR REPLACE FUNCTION public.process_referral_commission()
RETURNS TRIGGER AS $$
DECLARE
    v_referrer_id UUID;
    v_commission_rate DECIMAL := 0.05; -- 5% commission
    v_commission_amount DECIMAL;
BEGIN
    -- Only process on deposit completion
    IF NEW.type = 'deposit' AND (NEW.status = 'approved' OR NEW.status = 'completed') AND (OLD.status = 'pending') THEN
        -- Check if user was referred
        SELECT referrer_id INTO v_referrer_id
        FROM public.referrals
        WHERE referee_id = NEW.user_id;

        IF v_referrer_id IS NOT NULL THEN
            v_commission_amount := ROUND((NEW.amount * v_commission_rate)::numeric, 2);

            -- 1. Credit Referrer Wallet
            UPDATE public.referral_wallets
            SET balance = balance + v_commission_amount,
                total_earned = total_earned + v_commission_amount,
                updated_at = NOW()
            WHERE user_id = v_referrer_id;

            -- 2. Log Referral Transaction
            INSERT INTO public.referral_transactions (
                user_id, 
                amount, 
                type, 
                status, 
                reference_id, 
                description
            ) VALUES (
                v_referrer_id,
                v_commission_amount,
                'commission',
                'completed',
                NEW.id,
                'Referral commission from deposit of ' || NEW.amount
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 5. Hardened transfer_referral_to_main_wallet(p_amount DECIMAL) RPC
CREATE OR REPLACE FUNCTION public.transfer_referral_to_main_wallet(p_amount DECIMAL)
RETURNS JSON AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_current_balance DECIMAL;
BEGIN
    -- Ensure caller is authenticated
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Authentication required');
    END IF;

    -- Validation: Minimum amount
    IF p_amount < 0.1 THEN
        RETURN json_build_object('success', false, 'message', 'Minimum transfer amount is GHS 0.1');
    END IF;

    -- Get current referral balance
    SELECT balance INTO v_current_balance
    FROM public.referral_wallets
    WHERE user_id = v_user_id;

    -- Validation: Insufficient balance
    IF v_current_balance IS NULL OR v_current_balance < p_amount THEN
        RETURN json_build_object('success', false, 'message', 'Insufficient referral balance');
    END IF;

    -- Atomic Transfer
    -- a. Deduct from referral wallet
    UPDATE public.referral_wallets
    SET balance = balance - p_amount,
        total_withdrawn = total_withdrawn + p_amount,
        updated_at = NOW()
    WHERE user_id = v_user_id;

    -- b. Add to main profile balance
    UPDATE public.profiles
    SET balance = balance + p_amount
    WHERE id = v_user_id;

    -- c. Log in referral transactions
    INSERT INTO public.referral_transactions (user_id, amount, type, status, description)
    VALUES (v_user_id, -p_amount, 'transfer', 'completed', 'Transfer to main wallet');

    -- d. Log in main transactions for history
    INSERT INTO public.transactions (user_id, amount, type, status, description)
    VALUES (v_user_id, p_amount, 'deposit', 'approved', 'Referral wallet transfer');

    RETURN json_build_object('success', true, 'message', 'Successfully transferred GHS ' || p_amount || ' to main wallet');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 6. Hardened request_referral_withdrawal(p_amount DECIMAL, p_details TEXT) RPC
CREATE OR REPLACE FUNCTION public.request_referral_withdrawal(p_amount DECIMAL, p_details TEXT)
RETURNS JSON AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_current_balance DECIMAL;
BEGIN
    -- Ensure caller is authenticated
    IF v_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Authentication required');
    END IF;

    -- Validation: Minimum amount
    IF p_amount < 5 THEN
        RETURN json_build_object('success', false, 'message', 'Minimum withdrawal amount is GHS 5');
    END IF;

    -- Get current referral balance
    SELECT balance INTO v_current_balance
    FROM public.referral_wallets
    WHERE user_id = v_user_id;

    -- Validation: Insufficient balance
    IF v_current_balance IS NULL OR v_current_balance < p_amount THEN
        RETURN json_build_object('success', false, 'message', 'Insufficient referral balance');
    END IF;

    -- Log the withdrawal request as PENDING
    UPDATE public.referral_wallets
    SET balance = balance - p_amount,
        total_withdrawn = total_withdrawn + p_amount,
        updated_at = NOW()
    WHERE user_id = v_user_id;

    INSERT INTO public.referral_transactions (
        user_id, 
        amount, 
        type, 
        status, 
        description
    ) VALUES (
        v_user_id,
        -p_amount,
        'withdrawal',
        'pending',
        'Cash out request: ' || p_details
    );

    RETURN json_build_object('success', true, 'message', 'Withdrawal request submitted for GHS ' || p_amount || '. Pending approval.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 7. Hardened enforce_max_admins() trigger function
CREATE OR REPLACE FUNCTION public.enforce_max_admins()
RETURNS TRIGGER AS $$
DECLARE
    admin_count INTEGER;
BEGIN
    -- Only check if this row is being inserted as admin or updated to admin
    IF (TG_OP = 'INSERT' AND NEW.role = 'admin') OR 
       (TG_OP = 'UPDATE' AND NEW.role = 'admin' AND (OLD.role IS DISTINCT FROM NEW.role)) THEN
        
        -- Count existing admins excluding the current row
        SELECT COUNT(*) INTO admin_count
        FROM public.profiles
        WHERE role = 'admin' AND id <> NEW.id;

        IF admin_count >= 3 THEN
            RAISE EXCEPTION 'Admin limit reached: The system allows a maximum of 3 administrators.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMIT;
