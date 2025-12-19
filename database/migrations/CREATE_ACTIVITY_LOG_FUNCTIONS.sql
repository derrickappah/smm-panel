-- Create Activity Log Helper Functions
-- This migration creates PostgreSQL functions for querying and exporting activity logs
-- Run this in Supabase SQL Editor

-- Function to get user activity summary
CREATE OR REPLACE FUNCTION get_user_activity_summary(
    p_user_id UUID,
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    action_type TEXT,
    count BIGINT,
    last_occurrence TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        al.action_type,
        COUNT(*)::BIGINT as count,
        MAX(al.created_at) as last_occurrence
    FROM activity_logs al
    WHERE al.user_id = p_user_id
      AND al.created_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY al.action_type
    ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get security events
CREATE OR REPLACE FUNCTION get_security_events(
    p_days INTEGER DEFAULT 7
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    action_type TEXT,
    description TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        al.id,
        al.user_id,
        al.action_type,
        al.description,
        al.ip_address,
        al.created_at,
        al.metadata
    FROM activity_logs al
    WHERE al.severity = 'security'
      AND al.created_at >= NOW() - (p_days || ' days')::INTERVAL
    ORDER BY al.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to export activity logs with filters
CREATE OR REPLACE FUNCTION export_activity_logs(
    p_user_id UUID DEFAULT NULL,
    p_action_type TEXT DEFAULT NULL,
    p_entity_type TEXT DEFAULT NULL,
    p_severity TEXT DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL,
    p_limit INTEGER DEFAULT 10000
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    user_email TEXT,
    user_name TEXT,
    action_type TEXT,
    entity_type TEXT,
    entity_id UUID,
    description TEXT,
    metadata JSONB,
    severity TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        al.id,
        al.user_id,
        p.email as user_email,
        p.name as user_name,
        al.action_type,
        al.entity_type,
        al.entity_id,
        al.description,
        al.metadata,
        al.severity,
        al.ip_address,
        al.user_agent,
        al.created_at
    FROM activity_logs al
    LEFT JOIN profiles p ON al.user_id = p.id
    WHERE 
        (p_user_id IS NULL OR al.user_id = p_user_id)
        AND (p_action_type IS NULL OR al.action_type = p_action_type)
        AND (p_entity_type IS NULL OR al.entity_type = p_entity_type)
        AND (p_severity IS NULL OR al.severity = p_severity)
        AND (p_start_date IS NULL OR al.created_at >= p_start_date)
        AND (p_end_date IS NULL OR al.created_at <= p_end_date)
    ORDER BY al.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get activity statistics
CREATE OR REPLACE FUNCTION get_activity_statistics(
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    total_activities BIGINT,
    activities_by_type JSONB,
    activities_by_severity JSONB,
    security_events_count BIGINT,
    most_active_users JSONB,
    recent_activities JSONB
) AS $$
DECLARE
    v_start_date TIMESTAMPTZ;
BEGIN
    v_start_date := NOW() - (p_days || ' days')::INTERVAL;
    
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*)::BIGINT FROM activity_logs WHERE created_at >= v_start_date) as total_activities,
        (SELECT jsonb_object_agg(action_type, count) 
         FROM (
             SELECT action_type, COUNT(*)::BIGINT as count
             FROM activity_logs
             WHERE created_at >= v_start_date
             GROUP BY action_type
         ) sub) as activities_by_type,
        (SELECT jsonb_object_agg(severity, count)
         FROM (
             SELECT severity, COUNT(*)::BIGINT as count
             FROM activity_logs
             WHERE created_at >= v_start_date
             GROUP BY severity
         ) sub) as activities_by_severity,
        (SELECT COUNT(*)::BIGINT 
         FROM activity_logs 
         WHERE severity = 'security' AND created_at >= v_start_date) as security_events_count,
        (SELECT jsonb_agg(jsonb_build_object(
            'user_id', user_id,
            'user_email', user_email,
            'user_name', user_name,
            'activity_count', activity_count
         ))
         FROM (
             SELECT 
                 al.user_id,
                 p.email as user_email,
                 p.name as user_name,
                 COUNT(*)::BIGINT as activity_count
             FROM activity_logs al
             LEFT JOIN profiles p ON al.user_id = p.id
             WHERE al.created_at >= v_start_date
             GROUP BY al.user_id, p.email, p.name
             ORDER BY activity_count DESC
             LIMIT 10
         ) sub) as most_active_users,
        (SELECT jsonb_agg(jsonb_build_object(
            'id', id,
            'action_type', action_type,
            'description', description,
            'created_at', created_at
         ))
         FROM (
             SELECT id, action_type, description, created_at
             FROM activity_logs
             WHERE created_at >= v_start_date
             ORDER BY created_at DESC
             LIMIT 20
         ) sub) as recent_activities;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optional: Function to cleanup old activity logs (for maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_activity_logs(
    p_days_to_keep INTEGER DEFAULT 365
)
RETURNS TABLE (
    deleted_count BIGINT
) AS $$
DECLARE
    v_cutoff_date TIMESTAMPTZ;
    v_deleted_count BIGINT;
BEGIN
    v_cutoff_date := NOW() - (p_days_to_keep || ' days')::INTERVAL;
    
    -- Only delete non-security logs older than cutoff
    -- Security logs should be kept longer
    DELETE FROM activity_logs
    WHERE created_at < v_cutoff_date
      AND severity != 'security';
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    RETURN QUERY SELECT v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON FUNCTION get_user_activity_summary IS 'Get activity summary for a specific user over a number of days';
COMMENT ON FUNCTION get_security_events IS 'Get all security-related events within a number of days';
COMMENT ON FUNCTION export_activity_logs IS 'Export activity logs with various filters for CSV/JSON export';
COMMENT ON FUNCTION get_activity_statistics IS 'Get comprehensive activity statistics including counts, top users, and recent activities';
COMMENT ON FUNCTION cleanup_old_activity_logs IS 'Optional cleanup function to remove old non-security activity logs (use with caution)';

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_user_activity_summary(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_security_events(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION export_activity_logs(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_activity_statistics(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_activity_logs(INTEGER) TO authenticated;
