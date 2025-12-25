-- Simplify Support Tickets Table
-- Remove complex features: priority, assigned_to, SLA tracking, subject, tags
-- Keep: category, basic ticket fields

-- Drop triggers first
DROP TRIGGER IF EXISTS trigger_update_ticket_sla ON support_tickets;
DROP TRIGGER IF EXISTS trigger_auto_assign_ticket ON support_tickets;

-- Drop functions
DROP FUNCTION IF EXISTS calculate_sla_deadline(TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS auto_assign_ticket(UUID);
DROP FUNCTION IF EXISTS check_sla_breaches();
DROP FUNCTION IF EXISTS update_ticket_sla();
DROP FUNCTION IF EXISTS auto_assign_new_ticket();

-- Drop columns
ALTER TABLE support_tickets
DROP COLUMN IF EXISTS priority,
DROP COLUMN IF EXISTS assigned_to,
DROP COLUMN IF EXISTS sla_deadline,
DROP COLUMN IF EXISTS sla_breached,
DROP COLUMN IF EXISTS subject,
DROP COLUMN IF EXISTS tags;

-- Drop indexes related to removed columns
DROP INDEX IF EXISTS idx_support_tickets_priority;
DROP INDEX IF EXISTS idx_support_tickets_assigned_to;
DROP INDEX IF EXISTS idx_support_tickets_sla_deadline;
DROP INDEX IF EXISTS idx_support_tickets_sla_breached;

-- Keep category column and its index
-- Category index should already exist from ENHANCE_SUPPORT_TICKETS.sql

-- Add comment for documentation
COMMENT ON COLUMN support_tickets.category IS 'Ticket category: technical, billing, order, account, general';

