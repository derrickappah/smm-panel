-- Fix log_activity_from_trigger function signature
-- This ensures PostgreSQL can properly match the function when called from triggers
-- Run this in Supabase SQL Editor

-- Drop and recreate the function with explicit type casting
DROP FUNCTION IF EXISTS log_activity_from_trigger(UUID, TEXT, TEXT, UUID, TEXT, JSONB, TEXT);
DROP FUNCTION IF EXISTS log_activity_from_trigger(UUID, TEXT, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS log_activity_from_trigger(UUID, TEXT, TEXT, UUID, TEXT, JSONB);

-- Recreate with explicit parameter types
CREATE OR REPLACE FUNCTION log_activity_from_trigger(
    p_user_id UUID,
    p_action_type TEXT,
    p_entity_type TEXT,
    p_entity_id UUID,
    p_description TEXT,
    p_metadata JSONB DEFAULT '{}'::JSONB,
    p_severity TEXT DEFAULT 'info'
)
RETURNS void AS $$
BEGIN
    INSERT INTO activity_logs (
        user_id,
        action_type,
        entity_type,
        entity_id,
        description,
        metadata,
        severity,
        created_at
    )
    VALUES (
        p_user_id,
        p_action_type,
        p_entity_type,
        p_entity_id,
        p_description,
        p_metadata,
        p_severity,
        NOW()
    );
EXCEPTION WHEN OTHERS THEN
    -- Silently fail - logging should not break main functionality
    RAISE WARNING 'Failed to log activity: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION log_activity_from_trigger(UUID, TEXT, TEXT, UUID, TEXT, JSONB, TEXT) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION log_activity_from_trigger(UUID, TEXT, TEXT, UUID, TEXT, JSONB) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION log_activity_from_trigger(UUID, TEXT, TEXT, UUID, TEXT) TO service_role, authenticated;

-- Add comment
COMMENT ON FUNCTION log_activity_from_trigger IS 'Helper function to insert activity logs from triggers. Supports optional metadata and severity parameters.';

-- Fix the trigger functions to explicitly cast parameters
-- This ensures PostgreSQL can properly match the function signature

-- Fix log_order_created trigger function
CREATE OR REPLACE FUNCTION log_order_created()
RETURNS TRIGGER AS $$
DECLARE
    v_metadata JSONB;
BEGIN
    v_metadata := jsonb_build_object(
        'order_id', NEW.id,
        'service_id', NEW.service_id,
        'quantity', NEW.quantity,
        'total_cost', NEW.total_cost,
        'status', NEW.status,
        'link', NEW.link
    );
    
    PERFORM log_activity_from_trigger(
        NEW.user_id::UUID,
        'order_placed'::TEXT,
        'order'::TEXT,
        NEW.id::UUID,
        format('Order placed: %s x %s (Total: %s)', NEW.quantity, NEW.total_cost, NEW.total_cost)::TEXT,
        v_metadata::JSONB,
        'info'::TEXT
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix log_order_status_change trigger function
CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_metadata JSONB;
    v_description TEXT;
    v_severity TEXT := 'info';
BEGIN
    -- Only log if status actually changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        v_metadata := jsonb_build_object(
            'old_status', OLD.status,
            'new_status', NEW.status,
            'order_id', NEW.id,
            'service_id', NEW.service_id,
            'quantity', NEW.quantity,
            'total_cost', NEW.total_cost
        );
        
        v_description := format('Order status changed from %s to %s', OLD.status, NEW.status);
        
        -- Mark cancellations and rejections as warnings
        IF NEW.status IN ('cancelled', 'rejected') THEN
            v_severity := 'warning';
        END IF;
        
        PERFORM log_activity_from_trigger(
            NEW.user_id::UUID,
            'order_status_changed'::TEXT,
            'order'::TEXT,
            NEW.id::UUID,
            v_description::TEXT,
            v_metadata::JSONB,
            v_severity::TEXT
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix log_profile_update trigger function
CREATE OR REPLACE FUNCTION log_profile_update()
RETURNS TRIGGER AS $$
DECLARE
    v_metadata JSONB := '{}'::JSONB;
    v_action_type TEXT;
    v_description TEXT;
    v_severity TEXT := 'info';
BEGIN
    -- Log balance changes
    IF OLD.balance IS DISTINCT FROM NEW.balance THEN
        v_metadata := jsonb_build_object(
            'old_balance', OLD.balance,
            'new_balance', NEW.balance,
            'change_amount', NEW.balance - OLD.balance
        );
        v_action_type := 'balance_changed';
        v_description := format('Balance changed from %s to %s', OLD.balance, NEW.balance);
        
        -- If balance decreased significantly, mark as warning
        IF (NEW.balance - OLD.balance) < -100 THEN
            v_severity := 'warning';
        END IF;
        
        PERFORM log_activity_from_trigger(
            NEW.id::UUID,
            v_action_type::TEXT,
            'profile'::TEXT,
            NEW.id::UUID,
            v_description::TEXT,
            v_metadata::JSONB,
            v_severity::TEXT
        );
    END IF;
    
    -- Log role changes
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        v_metadata := jsonb_build_object(
            'old_role', OLD.role,
            'new_role', NEW.role
        );
        v_action_type := 'role_changed';
        v_description := format('Role changed from %s to %s', OLD.role, NEW.role);
        v_severity := 'security';
        
        PERFORM log_activity_from_trigger(
            COALESCE(auth.uid(), NEW.id)::UUID,
            v_action_type::TEXT,
            'profile'::TEXT,
            NEW.id::UUID,
            v_description::TEXT,
            v_metadata::JSONB,
            v_severity::TEXT
        );
    END IF;
    
    -- Log email changes
    IF OLD.email IS DISTINCT FROM NEW.email THEN
        v_metadata := jsonb_build_object(
            'old_email', OLD.email,
            'new_email', NEW.email
        );
        v_action_type := 'email_changed';
        v_description := format('Email changed from %s to %s', OLD.email, NEW.email);
        v_severity := 'security';
        
        PERFORM log_activity_from_trigger(
            NEW.id::UUID,
            v_action_type::TEXT,
            'profile'::TEXT,
            NEW.id::UUID,
            v_description::TEXT,
            v_metadata::JSONB,
            v_severity::TEXT
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix log_transaction_status_change trigger function
CREATE OR REPLACE FUNCTION log_transaction_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_metadata JSONB := '{}'::JSONB;
    v_description TEXT;
    v_severity TEXT := 'info';
BEGIN
    -- Only log if status actually changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        v_metadata := jsonb_build_object(
            'old_status', OLD.status,
            'new_status', NEW.status,
            'transaction_id', NEW.id,
            'amount', NEW.amount,
            'type', NEW.type
        );
        
        v_description := format('Transaction status changed from %s to %s', OLD.status, NEW.status);
        
        -- Mark rejections as warnings, approvals as info
        IF NEW.status = 'rejected' THEN
            v_severity := 'warning';
        ELSIF NEW.status = 'approved' THEN
            v_severity := 'info';
        END IF;
        
        PERFORM log_activity_from_trigger(
            NEW.user_id::UUID,
            'transaction_status_changed'::TEXT,
            'transaction'::TEXT,
            NEW.id::UUID,
            v_description::TEXT,
            v_metadata::JSONB,
            v_severity::TEXT
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix log_transaction_created trigger function
CREATE OR REPLACE FUNCTION log_transaction_created()
RETURNS TRIGGER AS $$
DECLARE
    v_metadata JSONB;
    v_action_type TEXT;
BEGIN
    v_metadata := jsonb_build_object(
        'transaction_id', NEW.id,
        'amount', NEW.amount,
        'type', NEW.type,
        'status', NEW.status
    );
    
    v_action_type := CASE 
        WHEN NEW.type = 'deposit' THEN 'deposit_created'
        WHEN NEW.type = 'order' THEN 'transaction_created'
        ELSE 'transaction_created'
    END;
    
    PERFORM log_activity_from_trigger(
        NEW.user_id::UUID,
        v_action_type::TEXT,
        'transaction'::TEXT,
        NEW.id::UUID,
        format('%s transaction created: %s (Status: %s)', NEW.type, NEW.amount, NEW.status)::TEXT,
        v_metadata::JSONB,
        'info'::TEXT
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix log_settings_change trigger function
CREATE OR REPLACE FUNCTION log_settings_change()
RETURNS TRIGGER AS $$
DECLARE
    v_metadata JSONB;
    v_description TEXT;
    v_severity TEXT := 'info';
    v_current_user_id UUID;
BEGIN
    -- Try to get current user ID from auth context
    BEGIN
        v_current_user_id := auth.uid();
    EXCEPTION WHEN OTHERS THEN
        v_current_user_id := NULL;
    END;
    
    v_metadata := jsonb_build_object(
        'setting_key', NEW.key,
        'old_value', OLD.value,
        'new_value', NEW.value,
        'description', NEW.description
    );
    
    v_description := format('Setting %s changed from %s to %s', NEW.key, OLD.value, NEW.value);
    
    -- Payment method settings are security-sensitive
    IF NEW.key LIKE 'payment_method%' THEN
        v_severity := 'security';
    END IF;
    
    PERFORM log_activity_from_trigger(
        COALESCE(v_current_user_id, '00000000-0000-0000-0000-000000000000'::UUID)::UUID,
        'settings_changed'::TEXT,
        'settings'::TEXT,
        NEW.id::UUID,
        v_description::TEXT,
        v_metadata::JSONB,
        v_severity::TEXT
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify the function was created correctly
SELECT 
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS arguments,
    pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'log_activity_from_trigger'
ORDER BY p.oid;
