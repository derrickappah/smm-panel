-- Fix log_activity_from_trigger function signature
-- This ensures PostgreSQL can properly match the function when called from triggers
-- Run this in Supabase SQL Editor

-- Drop and recreate the function with explicit type casting
DROP FUNCTION IF EXISTS log_activity_from_trigger(UUID, TEXT, TEXT, UUID, TEXT, JSONB, TEXT);
DROP FUNCTION IF EXISTS log_activity_from_trigger(UUID, TEXT, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS log_activity_from_trigger(UUID, TEXT, TEXT, UUID, TEXT, JSONB);

-- Recreate with explicit parameter types
CREATE OR REPLACE FUNCTION log_activity_from_trigger(
    p_user_id UUID,
    p_action_type TEXT,
    p_entity_type TEXT,
    p_entity_id UUID,
    p_description TEXT,
    p_metadata JSONB DEFAULT '{}'::JSONB,
    p_severity TEXT DEFAULT 'info'
)
RETURNS void AS $$
BEGIN
    INSERT INTO activity_logs (
        user_id,
        action_type,
        entity_type,
        entity_id,
        description,
        metadata,
        severity,
        created_at
    )
    VALUES (
        p_user_id,
        p_action_type,
        p_entity_type,
        p_entity_id,
        p_description,
        p_metadata,
        p_severity,
        NOW()
    );
EXCEPTION WHEN OTHERS THEN
    -- Silently fail - logging should not break main functionality
    RAISE WARNING 'Failed to log activity: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION log_activity_from_trigger(UUID, TEXT, TEXT, UUID, TEXT, JSONB, TEXT) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION log_activity_from_trigger(UUID, TEXT, TEXT, UUID, TEXT, JSONB) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION log_activity_from_trigger(UUID, TEXT, TEXT, UUID, TEXT) TO service_role, authenticated;

-- Add comment
COMMENT ON FUNCTION log_activity_from_trigger IS 'Helper function to insert activity logs from triggers. Supports optional metadata and severity parameters.';

-- Verify the function was created correctly
SELECT 
    p.proname AS function_name,
    pg_get_function_arguments(p.oid) AS arguments,
    pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'log_activity_from_trigger'
ORDER BY p.oid;
