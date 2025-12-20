-- Fix log_order_status_change trigger function to explicitly cast all parameters
-- This ensures PostgreSQL can properly match the log_activity_from_trigger function signature
-- Run this in Supabase SQL Editor

-- First, ensure log_activity_from_trigger function exists with proper signature
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

-- Drop and recreate the trigger function with explicit type casts
CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS TRIGGER AS $$
DECLARE
    v_metadata JSONB;
    v_action_type TEXT := 'order_status_changed';
    v_entity_type TEXT := 'order';
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
        IF NEW.status IN ('cancelled', 'rejected', 'canceled') THEN
            v_severity := 'warning';
        END IF;
        
        -- Call with all 7 parameters explicitly typed (including severity)
        PERFORM log_activity_from_trigger(
            (NEW.user_id)::UUID,
            v_action_type::TEXT,
            v_entity_type::TEXT,
            (NEW.id)::UUID,
            v_description::TEXT,
            v_metadata::JSONB,
            v_severity::TEXT
        );
    END IF;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Silently fail - logging should not break order status updates
    RAISE WARNING 'Failed to log order status change activity: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify the trigger function was updated
SELECT 
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'log_order_status_change';
