-- Create Support Typing Indicators Table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS typing_indicators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    is_typing BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_typing_indicators_conversation_id ON typing_indicators(conversation_id);
CREATE INDEX IF NOT EXISTS idx_typing_indicators_user_id ON typing_indicators(user_id);
CREATE INDEX IF NOT EXISTS idx_typing_indicators_is_typing ON typing_indicators(is_typing) WHERE is_typing = true;
CREATE INDEX IF NOT EXISTS idx_typing_indicators_updated_at ON typing_indicators(updated_at DESC);

-- Enable Row Level Security
ALTER TABLE typing_indicators ENABLE ROW LEVEL SECURITY;

-- Policy: Users can SELECT typing indicators in their own conversations
CREATE POLICY "Users can view typing indicators in their conversations"
    ON typing_indicators FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = typing_indicators.conversation_id
            AND conversations.user_id = auth.uid()
        )
        OR typing_indicators.user_id = auth.uid()
    );

-- Policy: Users can INSERT/UPDATE typing indicators in their own conversations
CREATE POLICY "Users can manage typing indicators in their conversations"
    ON typing_indicators FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = typing_indicators.conversation_id
            AND conversations.user_id = auth.uid()
        )
        OR typing_indicators.user_id = auth.uid()
    )
    WITH CHECK (
        user_id = auth.uid()
        AND (
            EXISTS (
                SELECT 1 FROM conversations
                WHERE conversations.id = typing_indicators.conversation_id
                AND conversations.user_id = auth.uid()
            )
            OR public.is_admin()
        )
    );

-- Policy: Admins can SELECT all typing indicators
CREATE POLICY "Admins can view all typing indicators"
    ON typing_indicators FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- Policy: Admins can MANAGE all typing indicators
CREATE POLICY "Admins can manage all typing indicators"
    ON typing_indicators FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Function to update typing indicator timestamp
CREATE OR REPLACE FUNCTION update_typing_indicator_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_typing_indicator_timestamp_trigger
    BEFORE UPDATE ON typing_indicators
    FOR EACH ROW
    EXECUTE FUNCTION update_typing_indicator_timestamp();

-- Add comments for documentation
COMMENT ON TABLE typing_indicators IS 'Real-time typing indicators for support conversations';
COMMENT ON COLUMN typing_indicators.is_typing IS 'Whether the user is currently typing';

