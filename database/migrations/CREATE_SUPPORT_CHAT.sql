-- Create Support Chat Messages Table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS support_chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'admin')),
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_ticket_id ON support_chat_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON support_chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON support_chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_read ON support_chat_messages(read) WHERE read = FALSE;

-- Enable Row Level Security
ALTER TABLE support_chat_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view messages for their own tickets
CREATE POLICY "Users can view messages for their tickets"
    ON support_chat_messages FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM support_tickets
            WHERE support_tickets.id = support_chat_messages.ticket_id
            AND support_tickets.user_id = auth.uid()
        )
    );

-- Policy: Admins can view all messages
CREATE POLICY "Admins can view all chat messages"
    ON support_chat_messages FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Policy: Users can insert messages for their own tickets
CREATE POLICY "Users can create messages for their tickets"
    ON support_chat_messages FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM support_tickets
            WHERE support_tickets.id = support_chat_messages.ticket_id
            AND support_tickets.user_id = auth.uid()
        )
        AND sender_type = 'user'
        AND sender_id = auth.uid()
    );

-- Policy: Admins can insert messages for any ticket
CREATE POLICY "Admins can create messages for any ticket"
    ON support_chat_messages FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
        AND sender_type = 'admin'
        AND sender_id = auth.uid()
    );

-- Policy: Users can update read status for their own messages
CREATE POLICY "Users can update read status for their messages"
    ON support_chat_messages FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM support_tickets
            WHERE support_tickets.id = support_chat_messages.ticket_id
            AND support_tickets.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM support_tickets
            WHERE support_tickets.id = support_chat_messages.ticket_id
            AND support_tickets.user_id = auth.uid()
        )
    );

-- Policy: Admins can update read status for any message
CREATE POLICY "Admins can update read status for any message"
    ON support_chat_messages FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );






