-- Fix Conversation Timestamp Functions
-- This migration fixes the function name conflict between conversation and message triggers
-- Run this in your Supabase SQL Editor

-- Function to update conversation's updated_at and last_message_at when a message is inserted
-- This is called from the messages table trigger
CREATE OR REPLACE FUNCTION update_conversation_on_message_insert()
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

-- Function to update conversation's updated_at when conversation is updated directly
-- This is called from the conversations table trigger
CREATE OR REPLACE FUNCTION update_conversation_on_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update the trigger on messages to use the correct function
DROP TRIGGER IF EXISTS update_conversation_on_message_insert ON messages;
CREATE TRIGGER update_conversation_on_message_insert
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_on_message_insert();

-- Update the trigger on conversations to use the correct function
DROP TRIGGER IF EXISTS update_conversation_timestamp_trigger ON conversations;
CREATE TRIGGER update_conversation_timestamp_trigger
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_on_update();

-- Drop the old conflicting function (if it still exists with the old signature)
DROP FUNCTION IF EXISTS update_conversation_timestamp();

-- Add comments for documentation
COMMENT ON FUNCTION update_conversation_on_message_insert() IS 'Updates conversation timestamps when a message is inserted';
COMMENT ON FUNCTION update_conversation_on_update() IS 'Updates conversation updated_at timestamp when conversation is updated directly';

