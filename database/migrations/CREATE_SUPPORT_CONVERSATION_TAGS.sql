-- Create Support Conversation Tags Table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS conversation_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
    tag TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(conversation_id, tag)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_conversation_tags_conversation_id ON conversation_tags(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_tags_tag ON conversation_tags(tag);
CREATE INDEX IF NOT EXISTS idx_conversation_tags_created_at ON conversation_tags(created_at DESC);

-- Enable Row Level Security
ALTER TABLE conversation_tags ENABLE ROW LEVEL SECURITY;

-- Policy: Users can SELECT tags in their own conversations
CREATE POLICY "Users can view tags in their conversations"
    ON conversation_tags FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = conversation_tags.conversation_id
            AND conversations.user_id = auth.uid()
        )
    );

-- Policy: Admins can SELECT all tags
CREATE POLICY "Admins can view all tags"
    ON conversation_tags FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- Policy: Admins can INSERT tags
CREATE POLICY "Admins can create tags"
    ON conversation_tags FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

-- Policy: Admins can UPDATE tags
CREATE POLICY "Admins can update tags"
    ON conversation_tags FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Policy: Admins can DELETE tags
CREATE POLICY "Admins can delete tags"
    ON conversation_tags FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- Add comments for documentation
COMMENT ON TABLE conversation_tags IS 'Tags associated with support conversations (admin-only management)';
COMMENT ON COLUMN conversation_tags.tag IS 'Tag text (e.g., "billing", "technical", "urgent")';

