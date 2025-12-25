-- Create Support Messages Table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
    sender_role TEXT NOT NULL CHECK (sender_role IN ('user', 'admin')),
    content TEXT NOT NULL,
    attachment_url TEXT,
    attachment_type TEXT CHECK (attachment_type IN ('image', 'file')),
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_read_at ON messages(read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at DESC);

-- Enable Row Level Security
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can SELECT messages in their own conversations
CREATE POLICY "Users can view messages in their conversations"
    ON messages FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = messages.conversation_id
            AND conversations.user_id = auth.uid()
        )
    );

-- Policy: Users can INSERT messages in their own conversations (with sender_role='user')
CREATE POLICY "Users can create messages in their conversations"
    ON messages FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = messages.conversation_id
            AND conversations.user_id = auth.uid()
        )
        AND sender_role = 'user'
        AND sender_id = auth.uid()
    );

-- Policy: Users can UPDATE only their own user messages (for editing)
CREATE POLICY "Users can update their own messages"
    ON messages FOR UPDATE
    TO authenticated
    USING (
        sender_id = auth.uid()
        AND sender_role = 'user'
        AND EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = messages.conversation_id
            AND conversations.user_id = auth.uid()
        )
    )
    WITH CHECK (
        sender_id = auth.uid()
        AND sender_role = 'user'
        AND EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = messages.conversation_id
            AND conversations.user_id = auth.uid()
        )
    );

-- Policy: Admins can SELECT all messages
CREATE POLICY "Admins can view all messages"
    ON messages FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- Policy: Admins can INSERT messages in any conversation
CREATE POLICY "Admins can create messages in any conversation"
    ON messages FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_admin()
        AND sender_role = 'admin'
        AND sender_id = auth.uid()
    );

-- Policy: Admins can UPDATE all messages
CREATE POLICY "Admins can update all messages"
    ON messages FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- SECURITY DEFINER function to mark messages as read
-- This allows users/admins to mark messages as read without broad UPDATE permissions
CREATE OR REPLACE FUNCTION mark_conversation_messages_read(p_conversation_id UUID)
RETURNS void AS $$
DECLARE
    v_user_id UUID;
    v_is_admin BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    
    -- Check if user is admin
    v_is_admin := public.is_admin();
    
    -- Verify user has access to this conversation
    IF NOT v_is_admin THEN
        -- For non-admins, verify they own the conversation
        IF NOT EXISTS (
            SELECT 1 FROM conversations
            WHERE id = p_conversation_id
            AND user_id = v_user_id
        ) THEN
            RAISE EXCEPTION 'Access denied: You do not have permission to access this conversation';
        END IF;
    END IF;
    
    -- Mark messages as read (only messages not sent by the current user)
    UPDATE messages
    SET read_at = NOW()
    WHERE conversation_id = p_conversation_id
    AND sender_id != v_user_id
    AND read_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION mark_conversation_messages_read(UUID) TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE messages IS 'Messages within support conversations';
COMMENT ON COLUMN messages.sender_role IS 'Role of the sender: user or admin';
COMMENT ON COLUMN messages.read_at IS 'Timestamp when the message was read by the recipient';
COMMENT ON COLUMN messages.attachment_type IS 'Type of attachment: image or file';

