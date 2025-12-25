-- Optimize Conversation Unread Counts
-- This migration creates functions to efficiently calculate unread counts and sort conversations
-- Run this in your Supabase SQL Editor

-- Function to get unread counts for multiple conversations in a single query
CREATE OR REPLACE FUNCTION get_conversation_unread_counts(p_admin_id UUID)
RETURNS TABLE(conversation_id UUID, unread_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.conversation_id,
    COUNT(*)::BIGINT as unread_count
  FROM messages m
  WHERE m.read_at IS NULL
    AND m.sender_id != p_admin_id
  GROUP BY m.conversation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get unread counts with most recent unread timestamp
CREATE OR REPLACE FUNCTION get_conversation_unread_details(p_admin_id UUID)
RETURNS TABLE(conversation_id UUID, unread_count BIGINT, latest_unread_at TIMESTAMPTZ) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.conversation_id,
    COUNT(*)::BIGINT as unread_count,
    MAX(m.created_at) as latest_unread_at
  FROM messages m
  WHERE m.read_at IS NULL
    AND m.sender_id != p_admin_id
  GROUP BY m.conversation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_conversation_unread_counts(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_conversation_unread_details(UUID) TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION get_conversation_unread_counts(UUID) IS 'Efficiently calculates unread message counts for all conversations. Returns conversation_id and unread_count pairs.';
COMMENT ON FUNCTION get_conversation_unread_details(UUID) IS 'Efficiently calculates unread message counts and most recent unread timestamp for all conversations. Useful for sorting conversations by unread status.';

