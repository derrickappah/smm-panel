-- Create empty conversations for all existing users who don't have one
-- This ensures every user has a conversation ready for support
-- Run this in your Supabase SQL Editor

INSERT INTO conversations (user_id, status, subject, created_at, updated_at, last_message_at)
SELECT 
    u.id as user_id,
    'open' as status,
    COALESCE(p.name, 'Support Conversation') as subject,
    NOW() as created_at,
    NOW() as updated_at,
    NOW() as last_message_at
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE u.id NOT IN (
    SELECT DISTINCT user_id 
    FROM conversations
    WHERE user_id IS NOT NULL
)
ON CONFLICT (user_id) DO NOTHING;

-- Verify the results
SELECT 
    (SELECT COUNT(DISTINCT id) FROM auth.users) as total_users,
    (SELECT COUNT(DISTINCT user_id) FROM conversations) as users_with_conversations,
    (SELECT COUNT(*) FROM conversations) as total_conversations;

