-- Drop Old Support System Tables
-- Run this in your Supabase SQL Editor after migrating data (if needed)
-- WARNING: This will permanently delete all data in the old support tables

-- Drop old support chat messages table
DROP TABLE IF EXISTS support_chat_messages CASCADE;

-- Drop old support tickets table
DROP TABLE IF EXISTS support_tickets CASCADE;

-- Note: If you need to migrate data from the old tables to the new ones, do that BEFORE running this migration
-- Example migration query (adjust as needed):
-- INSERT INTO conversations (user_id, status, subject, created_at, updated_at, last_message_at)
-- SELECT 
--   user_id,
--   CASE 
--     WHEN status = 'open' THEN 'open'
--     WHEN status = 'closed' THEN 'closed'
--     WHEN status = 'resolved' THEN 'resolved'
--     ELSE 'closed'
--   END,
--   COALESCE(subject, LEFT(message, 100)),
--   created_at,
--   updated_at,
--   updated_at
-- FROM support_tickets;

-- Then migrate messages:
-- INSERT INTO messages (conversation_id, sender_id, sender_role, content, created_at)
-- SELECT 
--   c.id,
--   scm.sender_id,
--   scm.sender_type,
--   scm.message,
--   scm.created_at
-- FROM support_chat_messages scm
-- JOIN support_tickets st ON scm.ticket_id = st.id
-- JOIN conversations c ON c.user_id = st.user_id AND c.created_at = st.created_at;

