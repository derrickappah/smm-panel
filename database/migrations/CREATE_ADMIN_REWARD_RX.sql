-- Migration: Admin Reward Logic (RPC Functions)
-- Serverless management of reward tiers

-- Function 1: Upsert Reward Tier (Add or Edit)
CREATE OR REPLACE FUNCTION admin_upsert_reward_tier(
    id_param UUID,
    name_param TEXT,
    required_amount_param NUMERIC,
    reward_likes_param NUMERIC,
    reward_views_param NUMERIC,
    position_param INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID;
    is_admin BOOLEAN;
    new_id UUID;
BEGIN
    -- Auth check
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Admin check
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = current_user_id AND role = 'admin'
    ) INTO is_admin;

    IF NOT is_admin THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;

    -- Logic
    IF id_param IS NOT NULL THEN
        -- Update
        UPDATE reward_tiers
        SET 
            name = name_param,
            required_amount = required_amount_param,
            reward_likes = reward_likes_param,
            reward_views = reward_views_param,
            position = position_param,
            updated_at = NOW()
        WHERE id = id_param
        RETURNING id INTO new_id;
        
        IF new_id IS NULL THEN
            RAISE EXCEPTION 'Tier not found to update';
        END IF;
    ELSE
        -- Insert
        INSERT INTO reward_tiers (
            name, required_amount, reward_likes, reward_views, position
        ) VALUES (
            name_param, required_amount_param, reward_likes_param, reward_views_param, position_param
        )
        RETURNING id INTO new_id;
    END IF;

    RETURN json_build_object(
        'success', true,
        'id', new_id
    );
END;
$$;


-- Function 2: Delete Reward Tier
CREATE OR REPLACE FUNCTION admin_delete_reward_tier(
    tier_id_param UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID;
    is_admin BOOLEAN;
BEGIN
    -- Auth check
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Admin check
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = current_user_id AND role = 'admin'
    ) INTO is_admin;

    IF NOT is_admin THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;

    -- Delete
    DELETE FROM reward_tiers WHERE id = tier_id_param;

    RETURN json_build_object(
        'success', true,
        'message', 'Tier deleted successfully'
    );
END;
$$;
