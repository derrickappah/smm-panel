-- Update Messages Table for Tickets
-- Run this in your Supabase SQL Editor

-- Add ticket_id column to messages table (nullable for backward compatibility)
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE;

-- Create index for ticket_id
CREATE INDEX IF NOT EXISTS idx_messages_ticket_id ON messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_messages_ticket_created ON messages(ticket_id, created_at DESC);

-- Update RLS policies to include ticket-based access

-- Policy: Users can SELECT messages in their own tickets
CREATE POLICY "Users can view messages in their tickets"
    ON messages FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM tickets
            WHERE tickets.id = messages.ticket_id
            AND tickets.user_id = auth.uid()
        )
        OR
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = messages.conversation_id
            AND conversations.user_id = auth.uid()
        )
    );

-- Policy: Users can INSERT messages in their own tickets (with sender_role='user')
-- Only if ticket status is 'Replied' (enforced by trigger)
CREATE POLICY "Users can create messages in their tickets"
    ON messages FOR INSERT
    TO authenticated
    WITH CHECK (
        (
            EXISTS (
                SELECT 1 FROM tickets
                WHERE tickets.id = messages.ticket_id
                AND tickets.user_id = auth.uid()
            )
        )
        OR
        (
            EXISTS (
                SELECT 1 FROM conversations
                WHERE conversations.id = messages.conversation_id
                AND conversations.user_id = auth.uid()
            )
        )
        AND sender_role = 'user'
        AND sender_id = auth.uid()
    );

-- Policy: Users can UPDATE only their own user messages (for editing)
CREATE POLICY "Users can update their own ticket messages"
    ON messages FOR UPDATE
    TO authenticated
    USING (
        sender_id = auth.uid()
        AND sender_role = 'user'
        AND (
            EXISTS (
                SELECT 1 FROM tickets
                WHERE tickets.id = messages.ticket_id
                AND tickets.user_id = auth.uid()
            )
            OR
            EXISTS (
                SELECT 1 FROM conversations
                WHERE conversations.id = messages.conversation_id
                AND conversations.user_id = auth.uid()
            )
        )
    )
    WITH CHECK (
        sender_id = auth.uid()
        AND sender_role = 'user'
        AND (
            EXISTS (
                SELECT 1 FROM tickets
                WHERE tickets.id = messages.ticket_id
                AND tickets.user_id = auth.uid()
            )
            OR
            EXISTS (
                SELECT 1 FROM conversations
                WHERE conversations.id = messages.conversation_id
                AND conversations.user_id = auth.uid()
            )
        )
    );

-- Policy: Admins can INSERT messages in any ticket
CREATE POLICY "Admins can create messages in any ticket"
    ON messages FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_admin()
        AND sender_role = 'admin'
        AND sender_id = auth.uid()
    );

-- Add comment for documentation
COMMENT ON COLUMN messages.ticket_id IS 'Ticket ID this message belongs to (for ticket-based support)';

