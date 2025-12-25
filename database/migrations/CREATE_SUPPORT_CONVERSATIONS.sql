-- Create Support Conversations Table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'resolved')),
    subject TEXT,
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_to ON conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_conversations_priority ON conversations(priority);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_status_user ON conversations(status, user_id) WHERE status = 'open';

-- Enable Row Level Security
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can SELECT their own conversations
CREATE POLICY "Users can view their own conversations"
    ON conversations FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Policy: Users can INSERT their own conversations
CREATE POLICY "Users can create their own conversations"
    ON conversations FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Policy: Users can UPDATE their own conversations (but not admin-only fields)
CREATE POLICY "Users can update their own conversations"
    ON conversations FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (
        user_id = auth.uid() 
        AND (
            -- Users cannot modify admin-only fields
            (OLD.assigned_to IS NULL AND NEW.assigned_to IS NULL) OR
            (OLD.assigned_to = NEW.assigned_to)
        )
        AND (
            (OLD.priority = NEW.priority)
        )
    );

-- Policy: Admins can SELECT all conversations
CREATE POLICY "Admins can view all conversations"
    ON conversations FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- Policy: Admins can UPDATE all conversations
CREATE POLICY "Admins can update all conversations"
    ON conversations FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Function to update updated_at and last_message_at timestamps
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_conversation_timestamp_trigger
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_timestamp();

-- Add comments for documentation
COMMENT ON TABLE conversations IS 'Support conversations between users and admins';
COMMENT ON COLUMN conversations.status IS 'Conversation status: open, closed, resolved';
COMMENT ON COLUMN conversations.assigned_to IS 'Admin user assigned to handle this conversation (admin-only field)';
COMMENT ON COLUMN conversations.priority IS 'Conversation priority: low, medium, high, urgent (admin-only field)';
COMMENT ON COLUMN conversations.last_message_at IS 'Timestamp of the last message in this conversation';

