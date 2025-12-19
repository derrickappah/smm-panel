-- Create Activity Log Triggers
-- This migration creates database triggers to automatically log activities
-- Run this in Supabase SQL Editor

-- Function to log activity from triggers
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

-- ============================================
-- Profile Update Triggers
-- ============================================

-- Function to log profile updates
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
            NEW.id,
            v_action_type,
            'profile',
            NEW.id,
            v_description,
            v_metadata,
            v_severity
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
        v_severity := 'security'; -- Role changes are security-sensitive
        
        PERFORM log_activity_from_trigger(
            COALESCE(auth.uid(), NEW.id), -- Use current user if available, otherwise profile owner
            v_action_type,
            'profile',
            NEW.id,
            v_description,
            v_metadata,
            v_severity
        );
    END IF;
    
    -- Log other profile field changes (name, email, etc.)
    IF (OLD.name IS DISTINCT FROM NEW.name) OR 
       (OLD.email IS DISTINCT FROM NEW.email) THEN
        v_metadata := jsonb_build_object(
            'old_name', OLD.name,
            'new_name', NEW.name,
            'old_email', OLD.email,
            'new_email', NEW.email
        );
        v_action_type := 'profile_updated';
        v_description := 'Profile information updated';
        
        PERFORM log_activity_from_trigger(
            NEW.id,
            v_action_type,
            'profile',
            NEW.id,
            v_description,
            v_metadata,
            v_severity
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for profile updates
DROP TRIGGER IF EXISTS profile_update_activity_trigger ON profiles;
CREATE TRIGGER profile_update_activity_trigger
    AFTER UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION log_profile_update();

-- ============================================
-- Order Status Change Triggers
-- ============================================

-- Function to log order status changes
CREATE OR REPLACE FUNCTION log_order_status_change()
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
            NEW.user_id,
            'order_status_changed',
            'order',
            NEW.id,
            v_description,
            v_metadata,
            v_severity
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for order status changes
DROP TRIGGER IF EXISTS order_status_change_activity_trigger ON orders;
CREATE TRIGGER order_status_change_activity_trigger
    AFTER UPDATE OF status ON orders
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION log_order_status_change();

-- Function to log new order creation
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
        NEW.user_id,
        'order_placed',
        'order',
        NEW.id,
        format('Order placed: %s x %s (Total: %s)', NEW.quantity, NEW.total_cost, NEW.total_cost),
        v_metadata,
        'info'
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new orders
DROP TRIGGER IF EXISTS order_created_activity_trigger ON orders;
CREATE TRIGGER order_created_activity_trigger
    AFTER INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION log_order_created();

-- ============================================
-- Transaction Status Change Triggers
-- ============================================

-- Function to log transaction status changes
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
        
        v_description := format('Transaction %s status changed from %s to %s', NEW.type, OLD.status, NEW.status);
        
        -- Mark rejections as warnings, approvals as info
        IF NEW.status = 'rejected' THEN
            v_severity := 'warning';
        ELSIF NEW.status = 'approved' THEN
            v_severity := 'info';
        END IF;
        
        PERFORM log_activity_from_trigger(
            NEW.user_id,
            'transaction_status_changed',
            'transaction',
            NEW.id,
            v_description,
            v_metadata,
            v_severity
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for transaction status changes
DROP TRIGGER IF EXISTS transaction_status_change_activity_trigger ON transactions;
CREATE TRIGGER transaction_status_change_activity_trigger
    AFTER UPDATE OF status ON transactions
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION log_transaction_status_change();

-- Function to log new transaction creation
CREATE OR REPLACE FUNCTION log_transaction_created()
RETURNS TRIGGER AS $$
DECLARE
    v_metadata JSONB;
BEGIN
    v_metadata := jsonb_build_object(
        'transaction_id', NEW.id,
        'amount', NEW.amount,
        'type', NEW.type,
        'status', NEW.status
    );
    
    PERFORM log_activity_from_trigger(
        NEW.user_id,
        CASE 
            WHEN NEW.type = 'deposit' THEN 'deposit_created'
            WHEN NEW.type = 'order' THEN 'transaction_created'
            ELSE 'transaction_created'
        END,
        'transaction',
        NEW.id,
        format('%s transaction created: %s (Status: %s)', NEW.type, NEW.amount, NEW.status),
        v_metadata,
        'info'
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new transactions
DROP TRIGGER IF EXISTS transaction_created_activity_trigger ON transactions;
CREATE TRIGGER transaction_created_activity_trigger
    AFTER INSERT ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION log_transaction_created();

-- ============================================
-- App Settings Change Triggers
-- ============================================

-- Function to log app settings changes
CREATE OR REPLACE FUNCTION log_app_settings_change()
RETURNS TRIGGER AS $$
DECLARE
    v_metadata JSONB := '{}'::JSONB;
    v_description TEXT;
    v_severity TEXT := 'info';
    v_current_user_id UUID;
BEGIN
    -- Get current user ID (if available)
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
        v_current_user_id,
        'settings_changed',
        'settings',
        NEW.id,
        v_description,
        v_metadata,
        v_severity
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for app settings changes
DROP TRIGGER IF EXISTS app_settings_change_activity_trigger ON app_settings;
CREATE TRIGGER app_settings_change_activity_trigger
    AFTER UPDATE ON app_settings
    FOR EACH ROW
    WHEN (OLD.value IS DISTINCT FROM NEW.value)
    EXECUTE FUNCTION log_app_settings_change();

-- Add comments for documentation
COMMENT ON FUNCTION log_activity_from_trigger IS 'Helper function to insert activity logs from triggers';
COMMENT ON FUNCTION log_profile_update IS 'Logs profile updates including balance and role changes';
COMMENT ON FUNCTION log_order_status_change IS 'Logs order status changes';
COMMENT ON FUNCTION log_order_created IS 'Logs new order creation';
COMMENT ON FUNCTION log_transaction_status_change IS 'Logs transaction status changes';
COMMENT ON FUNCTION log_transaction_created IS 'Logs new transaction creation';
COMMENT ON FUNCTION log_app_settings_change IS 'Logs app settings changes';
