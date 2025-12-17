-- Create function for auto-classifying transactions based on context
-- This function analyzes balance change context and returns appropriate transaction type
-- Run this in Supabase SQL Editor

CREATE OR REPLACE FUNCTION auto_classify_transaction(
    p_user_id UUID,
    p_amount NUMERIC,
    p_order_id UUID DEFAULT NULL,
    p_payment_method TEXT DEFAULT NULL,
    p_payment_reference TEXT DEFAULT NULL,
    p_is_admin_action BOOLEAN DEFAULT FALSE
)
RETURNS JSONB AS $$
DECLARE
    v_order_status TEXT;
    v_order_refund_status TEXT;
    v_referral_exists BOOLEAN;
    v_classification JSONB;
BEGIN
    -- Check if linked to an order (refund scenario)
    IF p_order_id IS NOT NULL AND p_amount > 0 THEN
        SELECT status, refund_status INTO v_order_status, v_order_refund_status
        FROM orders
        WHERE id = p_order_id;
        
        IF v_order_status IN ('cancelled', 'canceled') OR v_order_refund_status = 'succeeded' THEN
            RETURN jsonb_build_object(
                'type', 'refund',
                'description', format('Refund for cancelled order %s', p_order_id),
                'auto_classified', true
            );
        END IF;
    END IF;
    
    -- Check for referral bonus scenario
    -- If there's a referral relationship and this is a positive amount, it might be a referral bonus
    IF p_amount > 0 THEN
        SELECT EXISTS(
            SELECT 1 FROM referrals
            WHERE referee_id = p_user_id
            AND bonus_awarded = true
            AND referral_bonus = p_amount
        ) INTO v_referral_exists;
        
        IF v_referral_exists THEN
            RETURN jsonb_build_object(
                'type', 'referral_bonus',
                'description', 'Referral bonus for first deposit',
                'auto_classified', true
            );
        END IF;
    END IF;
    
    -- Check if admin action (manual adjustment)
    IF p_is_admin_action THEN
        RETURN jsonb_build_object(
            'type', 'manual_adjustment',
            'description', CASE 
                WHEN p_amount > 0 THEN format('Manual balance credit of ₵%s', p_amount)
                ELSE format('Manual balance debit of ₵%s', ABS(p_amount))
            END,
            'auto_classified', false
        );
    END IF;
    
    -- Check for payment method (deposit scenario)
    IF p_payment_method IS NOT NULL OR p_payment_reference IS NOT NULL THEN
        DECLARE
            v_method_name TEXT;
        BEGIN
            v_method_name := CASE p_payment_method
                WHEN 'paystack' THEN 'Paystack'
                WHEN 'korapay' THEN 'Korapay'
                WHEN 'moolre' THEN 'Moolre'
                WHEN 'moolre_web' THEN 'Moolre Web'
                WHEN 'hubtel' THEN 'Hubtel'
                WHEN 'manual' THEN 'Manual Deposit'
                WHEN 'momo' THEN 'Mobile Money'
                ELSE COALESCE(p_payment_method, 'Payment')
            END;
            
            RETURN jsonb_build_object(
                'type', 'deposit',
                'description', format('Deposit via %s%s', 
                    v_method_name,
                    CASE WHEN p_payment_reference IS NOT NULL 
                        THEN format(' (%s)', p_payment_reference)
                        ELSE ''
                    END
                ),
                'auto_classified', true
            );
        END;
    END IF;
    
    -- Default to unknown if no pattern matches
    RETURN jsonb_build_object(
        'type', 'unknown',
        'description', format('Unclassified balance change of ₵%s', ABS(p_amount)),
        'auto_classified', true
    );
END;
$$ LANGUAGE plpgsql;

-- Add comment for documentation
COMMENT ON FUNCTION auto_classify_transaction IS 'Auto-classifies a transaction based on context (order links, referral relationships, payment methods, admin actions). Returns JSONB with type, description, and auto_classified flag.';
