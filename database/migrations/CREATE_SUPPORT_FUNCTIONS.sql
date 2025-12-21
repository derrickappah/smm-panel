-- Create Support Functions for SLA, Auto-Assignment, and Tracking
-- Run this in your Supabase SQL Editor

-- Function to calculate SLA deadline based on priority
CREATE OR REPLACE FUNCTION calculate_sla_deadline(
    priority TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TIMESTAMPTZ AS $$
DECLARE
    deadline TIMESTAMPTZ;
BEGIN
    CASE priority
        WHEN 'urgent' THEN
            deadline := created_at + INTERVAL '2 hours';
        WHEN 'high' THEN
            deadline := created_at + INTERVAL '2 hours';
        WHEN 'normal' THEN
            deadline := created_at + INTERVAL '12 hours';
        WHEN 'low' THEN
            deadline := created_at + INTERVAL '12 hours';
        ELSE
            deadline := created_at + INTERVAL '12 hours';
    END CASE;
    
    RETURN deadline;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to auto-assign ticket using round-robin with workload consideration
CREATE OR REPLACE FUNCTION auto_assign_ticket(ticket_id UUID)
RETURNS UUID AS $$
DECLARE
    assigned_admin_id UUID;
    admin_count INTEGER;
    admin_workload RECORD;
    min_workload INTEGER;
BEGIN
    -- Get all admin users
    SELECT COUNT(*) INTO admin_count
    FROM profiles
    WHERE role = 'admin';
    
    IF admin_count = 0 THEN
        RETURN NULL;
    END IF;
    
    -- Find admin with minimum open tickets (workload balancing)
    SELECT 
        p.id,
        COUNT(st.id) as open_tickets_count
    INTO admin_workload
    FROM profiles p
    LEFT JOIN support_tickets st ON st.assigned_to = p.id 
        AND st.status IN ('open', 'in_progress')
    WHERE p.role = 'admin'
    GROUP BY p.id
    ORDER BY open_tickets_count ASC, p.created_at ASC
    LIMIT 1;
    
    assigned_admin_id := admin_workload.id;
    
    -- Update ticket with assignment
    UPDATE support_tickets
    SET assigned_to = assigned_admin_id
    WHERE id = ticket_id;
    
    RETURN assigned_admin_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check and update SLA breaches
CREATE OR REPLACE FUNCTION check_sla_breaches()
RETURNS INTEGER AS $$
DECLARE
    breached_count INTEGER;
BEGIN
    -- Update tickets that have passed their SLA deadline
    UPDATE support_tickets
    SET sla_breached = TRUE
    WHERE sla_deadline IS NOT NULL
    AND sla_deadline < NOW()
    AND status NOT IN ('resolved', 'closed')
    AND sla_breached = FALSE;
    
    GET DIAGNOSTICS breached_count = ROW_COUNT;
    
    RETURN breached_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update ticket SLA on creation/update
CREATE OR REPLACE FUNCTION update_ticket_sla()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate SLA deadline if priority is set and deadline is not already set
    IF NEW.priority IS NOT NULL AND (NEW.sla_deadline IS NULL OR OLD.priority IS DISTINCT FROM NEW.priority) THEN
        NEW.sla_deadline := calculate_sla_deadline(NEW.priority, COALESCE(NEW.created_at, NOW()));
    END IF;
    
    -- Check if SLA is breached
    IF NEW.sla_deadline IS NOT NULL AND NEW.sla_deadline < NOW() AND NEW.status NOT IN ('resolved', 'closed') THEN
        NEW.sla_breached := TRUE;
    ELSE
        NEW.sla_breached := FALSE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically calculate SLA on ticket creation/update
DROP TRIGGER IF EXISTS trigger_update_ticket_sla ON support_tickets;
CREATE TRIGGER trigger_update_ticket_sla
    BEFORE INSERT OR UPDATE OF priority, status, sla_deadline ON support_tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_ticket_sla();

-- Function to auto-assign ticket on creation if not manually assigned
CREATE OR REPLACE FUNCTION auto_assign_new_ticket()
RETURNS TRIGGER AS $$
BEGIN
    -- Only auto-assign if not already assigned
    IF NEW.assigned_to IS NULL THEN
        PERFORM auto_assign_ticket(NEW.id);
        -- Refresh the assigned_to value
        SELECT assigned_to INTO NEW.assigned_to
        FROM support_tickets
        WHERE id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-assign tickets on creation
DROP TRIGGER IF EXISTS trigger_auto_assign_ticket ON support_tickets;
CREATE TRIGGER trigger_auto_assign_ticket
    AFTER INSERT ON support_tickets
    FOR EACH ROW
    EXECUTE FUNCTION auto_assign_new_ticket();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_sla_deadline(TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_sla_deadline(TEXT, TIMESTAMPTZ) TO anon;
GRANT EXECUTE ON FUNCTION auto_assign_ticket(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION check_sla_breaches() TO authenticated;

-- Create a scheduled function to check SLA breaches periodically
-- Note: This requires pg_cron extension. If not available, you can call check_sla_breaches() manually or via a cron job
-- Example: SELECT cron.schedule('check-sla-breaches', '*/5 * * * *', 'SELECT check_sla_breaches();');



