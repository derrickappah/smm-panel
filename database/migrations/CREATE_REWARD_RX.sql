-- Migration: Reward System Logic (RPC Functions)
-- This moves the logic from the Node.js backend to the Database.

-- Function 1: Get User Reward Status
-- Returns current deposits and tier status for the UI
CREATE OR REPLACE FUNCTION get_user_reward_status()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with privileges of the creator (postgres/service_role)
AS $$
DECLARE
    current_user_id UUID;
    today_date DATE;
    total_deposits NUMERIC(10, 2);
    tiers_json JSON;
    limit_setting NUMERIC(10, 2);
BEGIN
    -- Get current user
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RETURN json_build_object('status', 'error', 'message', 'Not authenticated');
    END IF;

    today_date := CURRENT_DATE;

    -- Calculate total deposits for today
    SELECT COALESCE(SUM(amount), 0)
    INTO total_deposits
    FROM transactions
    WHERE user_id = current_user_id
    AND type = 'deposit'
    AND status = 'approved'
    AND created_at >= (today_date || 'T00:00:00Z')::TIMESTAMPTZ
    AND created_at <= (today_date || 'T23:59:59Z')::TIMESTAMPTZ;

    -- Fetch Tiers and Calculate Status
    SELECT json_agg(
        json_build_object(
            'id', t.id,
            'name', t.name,
            'required_amount', t.required_amount,
            'reward_likes', t.reward_likes,
            'reward_views', t.reward_views,
            'position', t.position,
            'isClaimed', (EXISTS (
                SELECT 1 FROM daily_reward_claims c 
                WHERE c.user_id = current_user_id 
                AND c.claim_date = today_date 
                AND c.tier_id = t.id
            )),
            'isUnlocked', (total_deposits >= t.required_amount),
            'progress', (
                CASE 
                    WHEN t.required_amount > 0 THEN LEAST(100, (total_deposits / t.required_amount) * 100)
                    ELSE 100 
                END
            )
        ) ORDER BY t.position ASC
    )
    INTO tiers_json
    FROM reward_tiers t;

    -- Return compiled response
    RETURN json_build_object(
        'status', 'success',
        'data', json_build_object(
            'current', total_deposits,
            'tiers', COALESCE(tiers_json, '[]'::json)
        )
    );
END;
$$;


-- Function 2: Claim Reward Tier
-- securely claims a reward if eligible
CREATE OR REPLACE FUNCTION claim_reward_tier(
    tier_id_param UUID,
    link_param TEXT,
    reward_type_param TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID;
    today_date DATE;
    total_deposits NUMERIC(10, 2);
    tier_record RECORD;
    existing_claim_id UUID;
BEGIN
    -- Auth check
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    today_date := CURRENT_DATE;

    -- 1. Get Tier Config
    SELECT * INTO tier_record FROM reward_tiers WHERE id = tier_id_param;
    IF tier_record IS NULL THEN
         RAISE EXCEPTION 'Invalid tier selected';
    END IF;

    -- 2. Verify Deposits (Security Check)
    SELECT COALESCE(SUM(amount), 0)
    INTO total_deposits
    FROM transactions
    WHERE user_id = current_user_id
    AND type = 'deposit'
    AND status = 'approved'
    AND created_at >= (today_date || 'T00:00:00Z')::TIMESTAMPTZ
    AND created_at <= (today_date || 'T23:59:59Z')::TIMESTAMPTZ;

    IF total_deposits < tier_record.required_amount THEN
        RAISE EXCEPTION 'Insufficient deposits for this tier';
    END IF;

    -- 3. Check Duplicate Claim
    SELECT id INTO existing_claim_id
    FROM daily_reward_claims
    WHERE user_id = current_user_id
    AND claim_date = today_date
    AND tier_id = tier_id_param;

    IF existing_claim_id IS NOT NULL THEN
        RAISE EXCEPTION 'Already claimed this tier today';
    END IF;

    -- 4. Insert Claim
    INSERT INTO daily_reward_claims (
        user_id,
        deposit_total,
        link,
        claim_date,
        tier_id,
        reward_type,
        reward_amount
    ) VALUES (
        current_user_id,
        total_deposits,
        link_param,
        today_date,
        tier_id_param,
        reward_type_param,
        CASE 
            WHEN reward_type_param = 'views' THEN tier_record.reward_views
            ELSE tier_record.reward_likes
        END
    );

    RETURN json_build_object(
        'success', true,
        'message', 'Reward claimed successfully!'
    );
END;
$$;
