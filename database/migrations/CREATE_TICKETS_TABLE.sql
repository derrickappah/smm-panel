-- Create Tickets Table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Refill', 'Cancel', 'Speed Up', 'Restart', 'Fake Complete')),
    subcategory TEXT,
    order_id TEXT,
    status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Replied', 'Closed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_last_message_at ON tickets(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_status_user ON tickets(status, user_id) WHERE status = 'Pending';

-- Enable Row Level Security
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- Policy: Users can SELECT their own tickets
CREATE POLICY "Users can view their own tickets"
    ON tickets FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Policy: Users can INSERT their own tickets
CREATE POLICY "Users can create their own tickets"
    ON tickets FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Policy: Users can UPDATE their own tickets (but not status to Closed - only admins can close)
CREATE POLICY "Users can update their own tickets"
    ON tickets FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (
        user_id = auth.uid()
        AND (NEW.status != 'Closed' OR OLD.status = 'Closed')
    );

-- Policy: Admins can SELECT all tickets
CREATE POLICY "Admins can view all tickets"
    ON tickets FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- Policy: Admins can UPDATE all tickets
CREATE POLICY "Admins can update all tickets"
    ON tickets FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ticket_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_ticket_timestamp_trigger
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_ticket_timestamp();

-- Add comments for documentation
COMMENT ON TABLE tickets IS 'Support tickets for order-related issues';
COMMENT ON COLUMN tickets.category IS 'Ticket category: Refill, Cancel, Speed Up, Restart, Fake Complete';
COMMENT ON COLUMN tickets.status IS 'Ticket status: Pending (waiting for admin), Replied (admin replied, user can respond), Closed (no more messages)';
COMMENT ON COLUMN tickets.order_id IS 'Optional order ID related to this ticket';
COMMENT ON COLUMN tickets.last_message_at IS 'Timestamp of the last message in this ticket';

