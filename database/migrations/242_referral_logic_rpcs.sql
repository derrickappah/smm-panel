-- 242_referral_logic_rpcs.sql
-- Referral Commission Logic and RPCs

-- 1. Automated Commission Calculation
CREATE OR REPLACE FUNCTION public.process_referral_commission()
RETURNS TRIGGER AS $$
DECLARE
    v_referrer_id UUID;
    v_commission_amount DECIMAL(15, 2);
BEGIN
    -- Check if transaction is an approved deposit
    IF NEW.type = 'deposit' AND NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
        
        -- Find the referrer for this user
        SELECT referrer_id INTO v_referrer_id
        FROM public.referrals
        WHERE referee_id = NEW.user_id;

        -- If user was referred, calculate 5% commission
        IF v_referrer_id IS NOT NULL THEN
            v_commission_amount := NEW.amount * 0.05;

            -- Update referral wallet of the referrer
            UPDATE public.referral_wallets
            SET balance = balance + v_commission_amount,
                total_earned = total_earned + v_commission_amount,
                updated_at = NOW()
            WHERE user_id = v_referrer_id;

            -- Log the commission transaction
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-hook the trigger to the transactions table
DROP TRIGGER IF EXISTS tr_process_referral_commission ON public.transactions;
CREATE TRIGGER tr_process_referral_commission
    AFTER UPDATE ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.process_referral_commission();

-- 2. RPC: Transfer Referral Balance to Main Wallet
CREATE OR REPLACE FUNCTION public.transfer_referral_to_main_wallet(p_amount DECIMAL)
RETURNS JSON AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_current_balance DECIMAL;
BEGIN
    -- Validation: Minimum amount
    IF p_amount < 10 THEN
        RETURN json_build_object('success', false, 'message', 'Minimum transfer amount is GHS 10');
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RPC: Request Direct Withdrawal
CREATE OR REPLACE FUNCTION public.request_referral_withdrawal(p_amount DECIMAL, p_details TEXT)
RETURNS JSON AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_current_balance DECIMAL;
BEGIN
    -- Validation: Minimum amount (usually higher for cash out, let's say 20)
    IF p_amount < 20 THEN
        RETURN json_build_object('success', false, 'message', 'Minimum withdrawal amount is GHS 20');
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
    -- Note: We deduct the balance immediately to "lock" the funds
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
