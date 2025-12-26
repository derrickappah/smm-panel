-- Create Ticket Functions
-- Run this in your Supabase SQL Editor

-- Function to check if user can send a message to a ticket
CREATE OR REPLACE FUNCTION can_user_send_message(p_ticket_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_ticket_status TEXT;
    v_ticket_user_id UUID;
    v_current_user_id UUID;
BEGIN
    v_current_user_id := auth.uid();
    
    -- Get ticket status and user_id
    SELECT status, user_id INTO v_ticket_status, v_ticket_user_id
    FROM tickets
    WHERE id = p_ticket_id;
    
    -- If ticket doesn't exist, return false
    IF v_ticket_status IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- If user doesn't own the ticket, return false
    IF v_ticket_user_id != v_current_user_id THEN
        RETURN FALSE;
    END IF;
    
    -- User can send message only if status is 'Replied' (admin has replied)
    -- Status 'Pending' means waiting for admin, 'Closed' means no more messages
    RETURN v_ticket_status = 'Replied';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION can_user_send_message(UUID) TO authenticated;

-- Function to update ticket status when a message is sent
CREATE OR REPLACE FUNCTION update_ticket_status_on_message()
RETURNS TRIGGER AS $$
DECLARE
    v_ticket_id UUID;
    v_sender_role TEXT;
    v_ticket_status TEXT;
BEGIN
    -- Only process if message has a ticket_id
    IF NEW.ticket_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    v_ticket_id := NEW.ticket_id;
    v_sender_role := NEW.sender_role;
    
    -- Get current ticket status
    SELECT status INTO v_ticket_status
    FROM tickets
    WHERE id = v_ticket_id;
    
    -- If ticket is closed, prevent new messages (this should be caught by trigger, but double-check)
    IF v_ticket_status = 'Closed' THEN
        RAISE EXCEPTION 'Cannot send message to closed ticket';
    END IF;
    
    -- Update ticket status based on sender role
    IF v_sender_role = 'user' THEN
        -- User sends message -> status becomes 'Pending' (waiting for admin)
        UPDATE tickets
        SET status = 'Pending',
            last_message_at = NEW.created_at,
            updated_at = NOW()
        WHERE id = v_ticket_id;
    ELSIF v_sender_role = 'admin' THEN
        -- Admin sends message -> status becomes 'Replied' (user can now respond)
        UPDATE tickets
        SET status = 'Replied',
            last_message_at = NEW.created_at,
            updated_at = NOW()
        WHERE id = v_ticket_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update ticket status when message is inserted
CREATE TRIGGER update_ticket_status_on_message_trigger
    AFTER INSERT ON messages
    FOR EACH ROW
    WHEN (NEW.ticket_id IS NOT NULL)
    EXECUTE FUNCTION update_ticket_status_on_message();

-- Function to validate message insertion (prevent user from sending when status is Pending)
CREATE OR REPLACE FUNCTION validate_ticket_message_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_ticket_status TEXT;
    v_ticket_user_id UUID;
    v_current_user_id UUID;
BEGIN
    -- Only validate if message has a ticket_id
    IF NEW.ticket_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    v_current_user_id := auth.uid();
    
    -- Get ticket status and user_id
    SELECT status, user_id INTO v_ticket_status, v_ticket_user_id
    FROM tickets
    WHERE id = NEW.ticket_id;
    
    -- If ticket doesn't exist, reject
    IF v_ticket_status IS NULL THEN
        RAISE EXCEPTION 'Ticket does not exist';
    END IF;
    
    -- If ticket is closed, reject
    IF v_ticket_status = 'Closed' THEN
        RAISE EXCEPTION 'Cannot send message to closed ticket';
    END IF;
    
    -- If user is sending message (not admin)
    IF NEW.sender_role = 'user' THEN
        -- Verify user owns the ticket
        IF v_ticket_user_id != v_current_user_id THEN
            RAISE EXCEPTION 'You do not have permission to send messages to this ticket';
        END IF;
        
        -- User can only send if status is 'Replied' (admin has replied)
        IF v_ticket_status != 'Replied' THEN
            RAISE EXCEPTION 'Cannot send message. Ticket status is %. Please wait for admin reply.', v_ticket_status;
        END IF;
    END IF;
    
    -- Admins can always send messages (unless ticket is closed, which is already checked)
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to validate message insertion
CREATE TRIGGER validate_ticket_message_insert_trigger
    BEFORE INSERT ON messages
    FOR EACH ROW
    WHEN (NEW.ticket_id IS NOT NULL)
    EXECUTE FUNCTION validate_ticket_message_insert();

-- Function for admin to close a ticket
CREATE OR REPLACE FUNCTION close_ticket(p_ticket_id UUID)
RETURNS void AS $$
DECLARE
    v_is_admin BOOLEAN;
BEGIN
    -- Check if user is admin
    v_is_admin := public.is_admin();
    
    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'Only admins can close tickets';
    END IF;
    
    -- Close the ticket
    UPDATE tickets
    SET status = 'Closed',
        updated_at = NOW()
    WHERE id = p_ticket_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket not found';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION close_ticket(UUID) TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION can_user_send_message(UUID) IS 'Returns true if user can send a message to the ticket (status must be Replied)';
COMMENT ON FUNCTION update_ticket_status_on_message() IS 'Trigger function that updates ticket status when messages are sent';
COMMENT ON FUNCTION validate_ticket_message_insert() IS 'Trigger function that validates message insertion based on ticket status';
COMMENT ON FUNCTION close_ticket(UUID) IS 'Admin function to close a ticket (prevents further messages)';

