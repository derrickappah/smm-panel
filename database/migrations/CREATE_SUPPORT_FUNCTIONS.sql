-- Create Support System Functions and Triggers
-- Run this in your Supabase SQL Editor

-- Function to update conversation's updated_at and last_message_at when a message is inserted
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations
    SET 
        updated_at = NOW(),
        last_message_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update conversation timestamps when a message is inserted
DROP TRIGGER IF EXISTS update_conversation_on_message_insert ON messages;
CREATE TRIGGER update_conversation_on_message_insert
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_timestamp();

-- Function to automatically set sender_role based on user's role
-- This ensures sender_role is always correct and prevents privilege escalation
CREATE OR REPLACE FUNCTION set_message_sender_role()
RETURNS TRIGGER AS $$
DECLARE
    v_user_role TEXT;
BEGIN
    -- Get user's role from profiles table
    SELECT role INTO v_user_role
    FROM profiles
    WHERE id = NEW.sender_id;
    
    -- Set sender_role based on user's role
    IF v_user_role = 'admin' THEN
        NEW.sender_role := 'admin';
    ELSE
        NEW.sender_role := 'user';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically set sender_role before insert
DROP TRIGGER IF EXISTS set_message_sender_role_trigger ON messages;
CREATE TRIGGER set_message_sender_role_trigger
    BEFORE INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION set_message_sender_role();

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION set_message_sender_role() TO authenticated;

-- Function to enforce single open conversation per user
-- This is called before inserting a new conversation
CREATE OR REPLACE FUNCTION enforce_single_open_conversation()
RETURNS TRIGGER AS $$
BEGIN
    -- Only enforce for non-admin users
    IF NOT public.is_admin() THEN
        -- Check if user already has an open conversation
        IF EXISTS (
            SELECT 1 FROM conversations
            WHERE user_id = NEW.user_id
            AND status = 'open'
            AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
        ) THEN
            -- If inserting, prevent creation of multiple open conversations
            -- Instead, we'll let the application handle this logic
            -- This function can be used to check, but we won't block here
            -- to allow flexibility in the application layer
            NULL;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: We'll handle single conversation enforcement in the application layer
-- for better user experience and error handling

-- Add comments for documentation
COMMENT ON FUNCTION update_conversation_timestamp() IS 'Updates conversation timestamps when a message is inserted';
COMMENT ON FUNCTION set_message_sender_role() IS 'Automatically sets sender_role based on user profile role to prevent privilege escalation';
COMMENT ON FUNCTION enforce_single_open_conversation() IS 'Helper function to check for single open conversation per user (enforced in application layer)';

