-- Enhance Support Tickets Table with Categories, Priorities, SLA, and Assignment
-- Run this in your Supabase SQL Editor

-- Add new columns to support_tickets table
ALTER TABLE support_tickets
ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('technical', 'billing', 'order', 'account', 'general')),
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS sla_deadline TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sla_breached BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS subject TEXT,
ADD COLUMN IF NOT EXISTS tags TEXT[];

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_support_tickets_category ON support_tickets(category);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to ON support_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_support_tickets_sla_deadline ON support_tickets(sla_deadline);
CREATE INDEX IF NOT EXISTS idx_support_tickets_sla_breached ON support_tickets(sla_breached) WHERE sla_breached = TRUE;

-- Update existing tickets with default values
UPDATE support_tickets
SET 
  category = 'general',
  priority = 'normal',
  subject = COALESCE(subject, LEFT(message, 100))
WHERE category IS NULL OR priority IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN support_tickets.category IS 'Ticket category: technical, billing, order, account, general';
COMMENT ON COLUMN support_tickets.priority IS 'Ticket priority: low, normal, high, urgent';
COMMENT ON COLUMN support_tickets.assigned_to IS 'Admin user assigned to handle this ticket';
COMMENT ON COLUMN support_tickets.sla_deadline IS 'SLA deadline calculated based on priority (2h for high/urgent, 12h for normal/low)';
COMMENT ON COLUMN support_tickets.sla_breached IS 'Whether the SLA deadline has been breached';
COMMENT ON COLUMN support_tickets.subject IS 'Brief subject line for the ticket';
COMMENT ON COLUMN support_tickets.tags IS 'Array of tags for flexible categorization';






