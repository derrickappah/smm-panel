-- Enforce Single Conversation Per User
-- This migration ensures each user has exactly one conversation
-- Run this in your Supabase SQL Editor

-- Step 1: Merge existing multiple conversations per user
-- For each user with multiple conversations, keep the most recent one and merge messages

DO $$
DECLARE
    v_user_id UUID;
    v_keep_conversation_id UUID;
    v_other_conversation_id UUID;
    v_max_last_message_at TIMESTAMPTZ;
    v_max_created_at TIMESTAMPTZ;
BEGIN
    -- Loop through all users who have multiple conversations
    FOR v_user_id IN 
        SELECT user_id 
        FROM conversations 
        GROUP BY user_id 
        HAVING COUNT(*) > 1
    LOOP
        -- Find the conversation to keep (most recent last_message_at, or created_at if no messages)
        SELECT id, last_message_at, created_at INTO v_keep_conversation_id, v_max_last_message_at, v_max_created_at
        FROM conversations
        WHERE user_id = v_user_id
        ORDER BY 
            COALESCE(last_message_at, '1970-01-01'::TIMESTAMPTZ) DESC,
            created_at DESC
        LIMIT 1;

        -- Move all messages from other conversations to the kept conversation
        UPDATE messages
        SET conversation_id = v_keep_conversation_id
        WHERE conversation_id IN (
            SELECT id 
            FROM conversations 
            WHERE user_id = v_user_id 
            AND id != v_keep_conversation_id
        );

        -- Move all typing indicators from other conversations
        -- First, delete typing indicators from other conversations where the user already has one in the kept conversation
        DELETE FROM typing_indicators
        WHERE conversation_id IN (
            SELECT id 
            FROM conversations 
            WHERE user_id = v_user_id 
            AND id != v_keep_conversation_id
        )
        AND user_id IN (
            SELECT user_id 
            FROM typing_indicators 
            WHERE conversation_id = v_keep_conversation_id
        );
        
        -- Now update the remaining typing indicators (those that don't conflict)
        UPDATE typing_indicators
        SET conversation_id = v_keep_conversation_id
        WHERE conversation_id IN (
            SELECT id 
            FROM conversations 
            WHERE user_id = v_user_id 
            AND id != v_keep_conversation_id
        );

        -- Move all conversation tags from other conversations
        -- First, delete tags from other conversations where the tag already exists in the kept conversation
        DELETE FROM conversation_tags
        WHERE conversation_id IN (
            SELECT id 
            FROM conversations 
            WHERE user_id = v_user_id 
            AND id != v_keep_conversation_id
        )
        AND tag IN (
            SELECT tag 
            FROM conversation_tags 
            WHERE conversation_id = v_keep_conversation_id
        );
        
        -- Now update the remaining tags (those that don't conflict)
        UPDATE conversation_tags
        SET conversation_id = v_keep_conversation_id
        WHERE conversation_id IN (
            SELECT id 
            FROM conversations 
            WHERE user_id = v_user_id 
            AND id != v_keep_conversation_id
        );

        -- Move all admin notes from other conversations
        UPDATE admin_notes
        SET conversation_id = v_keep_conversation_id
        WHERE conversation_id IN (
            SELECT id 
            FROM conversations 
            WHERE user_id = v_user_id 
            AND id != v_keep_conversation_id
        );

        -- Update the kept conversation's last_message_at to the most recent message
        -- Temporarily disable the timestamp trigger to avoid function signature conflicts
        ALTER TABLE conversations DISABLE TRIGGER update_conversation_timestamp_trigger;
        UPDATE conversations
        SET 
            last_message_at = (
                SELECT MAX(created_at)
                FROM messages
                WHERE conversation_id = v_keep_conversation_id
            ),
            updated_at = NOW()
        WHERE id = v_keep_conversation_id
        AND EXISTS (
            SELECT 1 FROM messages WHERE conversation_id = v_keep_conversation_id
        );
        ALTER TABLE conversations ENABLE TRIGGER update_conversation_timestamp_trigger;

        -- Delete the other conversations
        DELETE FROM conversations
        WHERE user_id = v_user_id
        AND id != v_keep_conversation_id;

        RAISE NOTICE 'Merged conversations for user % into conversation %', v_user_id, v_keep_conversation_id;
    END LOOP;
END $$;

-- Step 2: Add unique constraint to prevent multiple conversations per user
-- First, drop the existing index if it exists (we'll replace it with a unique constraint)
DROP INDEX IF EXISTS idx_conversations_user_id;

-- Add unique constraint on user_id to enforce single conversation per user
ALTER TABLE conversations 
ADD CONSTRAINT conversations_user_id_unique UNIQUE (user_id);

-- Recreate the index for performance (unique constraint already creates an index, but we can add additional indexes)
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);

-- Step 3: Update the enforce function to actually prevent multiple conversations
CREATE OR REPLACE FUNCTION enforce_single_conversation_per_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Only enforce for non-admin users
    IF NOT public.is_admin() THEN
        -- Check if user already has a conversation
        IF EXISTS (
            SELECT 1 FROM conversations
            WHERE user_id = NEW.user_id
            AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
        ) THEN
            -- If this is an INSERT, raise an error
            IF TG_OP = 'INSERT' THEN
                RAISE EXCEPTION 'User already has a conversation. Each user can only have one conversation.';
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce single conversation per user
DROP TRIGGER IF EXISTS enforce_single_conversation_trigger ON conversations;
CREATE TRIGGER enforce_single_conversation_trigger
    BEFORE INSERT ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION enforce_single_conversation_per_user();

-- Add comments for documentation
COMMENT ON CONSTRAINT conversations_user_id_unique ON conversations IS 'Ensures each user can only have one conversation';
COMMENT ON FUNCTION enforce_single_conversation_per_user() IS 'Enforces that non-admin users can only have one conversation';

