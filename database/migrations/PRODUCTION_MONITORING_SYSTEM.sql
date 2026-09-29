-- Migration: Comprehensive Production Monitoring, Health Checks & Incident Management System
-- BoostUp GH Production Reliability & Incident Response Architecture

-- 1. Table: production_incidents
-- Deduplicated incident model for production failures, performance degradation, and business anomalies.
CREATE TABLE IF NOT EXISTS production_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_code TEXT NOT NULL UNIQUE,
    severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
    type TEXT NOT NULL, -- e.g. 'PAYMENT_CREDIT_FAILURE', 'DATABASE_DEGRADED', 'STUCK_ORDERS_SPIKE', 'PROVIDER_OUTAGE', 'CRON_STALLED'
    component TEXT NOT NULL CHECK (component IN ('Application', 'Database', 'Authentication', 'Payments', 'Orders', 'External APIs', 'Cron Jobs', 'Frontend')),
    first_detected TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_detected TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    last_error TEXT,
    metadata JSONB DEFAULT '{}',
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_status_comp ON production_incidents(status, component, last_detected DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_type_open ON production_incidents(type, component) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON production_incidents(severity, last_detected DESC);

COMMENT ON TABLE production_incidents IS 'Deduplicated production incidents and anomalous operational states.';

-- 2. Table: production_metrics
-- Lean performance telemetry: latency, status codes, request identifiers for P50/P95/P99 analysis.
CREATE TABLE IF NOT EXISTS production_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    request_id TEXT,
    component TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_created_comp ON production_metrics(created_at DESC, component);
CREATE INDEX IF NOT EXISTS idx_metrics_endpoint ON production_metrics(endpoint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_status ON production_metrics(status_code, created_at DESC);

COMMENT ON TABLE production_metrics IS 'Lean operational telemetry for request latencies and error rate baselines.';

-- 3. Table: cron_job_runs
-- Scheduled task audit and watchdog telemetry.
CREATE TABLE IF NOT EXISTS cron_job_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    status TEXT NOT NULL CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED')),
    details JSONB DEFAULT '{}',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_name_time ON cron_job_runs(job_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_runs_status ON cron_job_runs(status, started_at DESC);

COMMENT ON TABLE cron_job_runs IS 'Execution audit logs for background workers and scheduled cron tasks.';

-- 4. Enable Row Level Security
ALTER TABLE production_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_job_runs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Admins can view incidents" ON production_incidents;
DROP POLICY IF EXISTS "Admins can update incidents" ON production_incidents;
DROP POLICY IF EXISTS "Admins can view metrics" ON production_metrics;
DROP POLICY IF EXISTS "Admins can view cron runs" ON cron_job_runs;

-- Admin RLS Policies
CREATE POLICY "Admins can view incidents"
    ON production_incidents FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can update incidents"
    ON production_incidents FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can view metrics"
    ON production_metrics FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can view cron runs"
    ON cron_job_runs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- 5. RPC Function: record_or_update_incident
-- Automatically deduplicates open incidents: increments occurrence count if open, or creates a new one.
CREATE OR REPLACE FUNCTION record_or_update_incident(
    p_severity TEXT,
    p_type TEXT,
    p_component TEXT,
    p_last_error TEXT,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS JSONB AS $$
DECLARE
    v_existing_id UUID;
    v_incident_code TEXT;
    v_count INTEGER;
    v_result JSONB;
BEGIN
    -- Check for an existing OPEN or ACKNOWLEDGED incident of the same type and component
    SELECT id, incident_code, occurrence_count INTO v_existing_id, v_incident_code, v_count
    FROM production_incidents
    WHERE type = p_type
      AND component = p_component
      AND status IN ('OPEN', 'ACKNOWLEDGED')
    ORDER BY last_detected DESC
    LIMIT 1
    FOR UPDATE;

    IF v_existing_id IS NOT NULL THEN
        -- Deduplicate: update existing incident
        UPDATE production_incidents
        SET occurrence_count = occurrence_count + 1,
            last_detected = NOW(),
            last_error = COALESCE(p_last_error, last_error),
            metadata = metadata || p_metadata,
            severity = CASE 
                WHEN p_severity = 'CRITICAL' THEN 'CRITICAL'
                WHEN severity = 'CRITICAL' THEN 'CRITICAL'
                WHEN p_severity = 'ERROR' THEN 'ERROR'
                ELSE severity
            END
        WHERE id = v_existing_id
        RETURNING json_build_object(
            'id', id,
            'incident_code', incident_code,
            'action', 'UPDATED',
            'occurrence_count', occurrence_count,
            'status', status
        )::JSONB INTO v_result;

        RETURN v_result;
    ELSE
        -- Generate readable incident code: INC-YYYYMMDD-XXXX
        v_incident_code := 'INC-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');

        INSERT INTO production_incidents (
            incident_code, severity, type, component, 
            first_detected, last_detected, status, 
            occurrence_count, last_error, metadata
        ) VALUES (
            v_incident_code, p_severity, p_type, p_component,
            NOW(), NOW(), 'OPEN',
            1, p_last_error, p_metadata
        )
        RETURNING json_build_object(
            'id', id,
            'incident_code', incident_code,
            'action', 'CREATED',
            'occurrence_count', 1,
            'status', status
        )::JSONB INTO v_result;

        RETURN v_result;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC Function: resolve_production_incident
CREATE OR REPLACE FUNCTION resolve_production_incident(
    p_incident_id UUID,
    p_resolution_notes TEXT DEFAULT NULL,
    p_resolved_by UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
BEGIN
    UPDATE production_incidents
    SET status = 'RESOLVED',
        resolved_at = NOW(),
        resolution_notes = p_resolution_notes,
        resolved_by = COALESCE(p_resolved_by, auth.uid())
    WHERE id = p_incident_id
    RETURNING json_build_object(
        'id', id,
        'incident_code', incident_code,
        'status', status,
        'resolved_at', resolved_at
    )::JSONB INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RPC Function: record_cron_job_run
CREATE OR REPLACE FUNCTION record_cron_job_run(
    p_job_name TEXT,
    p_status TEXT,
    p_duration_ms INTEGER,
    p_details JSONB DEFAULT '{}',
    p_error_message TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO cron_job_runs (
        job_name, started_at, completed_at, 
        duration_ms, status, details, error_message
    ) VALUES (
        p_job_name, NOW() - (p_duration_ms || ' milliseconds')::INTERVAL, NOW(),
        p_duration_ms, p_status, p_details, p_error_message
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. RPC Function: clean_old_monitoring_data
-- Safely purges telemetry logs older than retention period (default 14 days)
-- Preserves unresolved incidents and business records indefinitely.
CREATE OR REPLACE FUNCTION clean_old_monitoring_data(
    p_retention_days INTEGER DEFAULT 14
)
RETURNS JSONB AS $$
DECLARE
    v_metrics_deleted INTEGER;
    v_runs_deleted INTEGER;
    v_resolved_deleted INTEGER;
    v_cutoff TIMESTAMPTZ;
BEGIN
    v_cutoff := NOW() - (p_retention_days || ' days')::INTERVAL;

    -- Delete old telemetry metrics
    DELETE FROM production_metrics
    WHERE created_at < v_cutoff;
    GET DIAGNOSTICS v_metrics_deleted = ROW_COUNT;

    -- Delete old successful cron run logs
    DELETE FROM cron_job_runs
    WHERE created_at < v_cutoff;
    GET DIAGNOSTICS v_runs_deleted = ROW_COUNT;

    -- Delete RESOLVED incidents older than retention window (open incidents are never deleted)
    DELETE FROM production_incidents
    WHERE status = 'RESOLVED' AND resolved_at < v_cutoff;
    GET DIAGNOSTICS v_resolved_deleted = ROW_COUNT;

    RETURN json_build_object(
        'metrics_deleted', v_metrics_deleted,
        'cron_runs_deleted', v_runs_deleted,
        'resolved_incidents_deleted', v_resolved_deleted,
        'retention_cutoff', v_cutoff
    )::JSONB;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. RPC Function: get_production_health_overview
-- Fast consolidated operational health overview query
CREATE OR REPLACE FUNCTION get_production_health_overview()
RETURNS JSONB AS $$
DECLARE
    v_last_cron RECORD;
    v_open_incidents RECORD;
    v_errors_5m INTEGER;
    v_errors_1h INTEGER;
    v_errors_24h INTEGER;
    v_requests_1h INTEGER;
    v_p50_1h NUMERIC;
    v_p95_1h NUMERIC;
    v_p99_1h NUMERIC;
    v_orders_stats RECORD;
    v_payments_stats RECORD;
    v_status_db TEXT := 'healthy';
    v_status_cron TEXT := 'healthy';
    v_status_payments TEXT := 'healthy';
    v_status_orders TEXT := 'healthy';
    v_status_app TEXT := 'healthy';
BEGIN
    -- 1. Error counts from metrics in 5m, 1h, 24h
    SELECT 
        COUNT(*) FILTER (WHERE status_code >= 500 AND created_at >= NOW() - INTERVAL '5 minutes') as err_5m,
        COUNT(*) FILTER (WHERE status_code >= 500 AND created_at >= NOW() - INTERVAL '1 hour') as err_1h,
        COUNT(*) FILTER (WHERE status_code >= 500 AND created_at >= NOW() - INTERVAL '24 hours') as err_24h,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour') as req_1h
    INTO v_errors_5m, v_errors_1h, v_errors_24h, v_requests_1h
    FROM production_metrics
    WHERE created_at >= NOW() - INTERVAL '24 hours';

    -- 2. Latency percentiles (last 1h)
    SELECT 
        COALESCE(percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms), 0) as p50,
        COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0) as p95,
        COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms), 0) as p99
    INTO v_p50_1h, v_p95_1h, v_p99_1h
    FROM production_metrics
    WHERE created_at >= NOW() - INTERVAL '1 hour';

    -- 3. Last sync-orders Cron Job Run
    SELECT 
        job_name, status, completed_at, duration_ms, error_message,
        EXTRACT(EPOCH FROM (NOW() - completed_at)) as seconds_since_last_run
    INTO v_last_cron
    FROM cron_job_runs
    WHERE job_name = 'sync-orders'
    ORDER BY started_at DESC
    LIMIT 1;

    -- Check if cron is stalled (> 15 minutes = 900 seconds)
    IF v_last_cron.seconds_since_last_run IS NOT NULL AND v_last_cron.seconds_since_last_run > 900 THEN
        v_status_cron := 'critical';
    ELSIF v_last_cron.status = 'FAILED' THEN
        v_status_cron := 'degraded';
    ELSIF v_last_cron.seconds_since_last_run IS NULL THEN
        v_status_cron := 'healthy'; -- no runs recorded yet
    END IF;

    -- 4. Open Incidents Summary
    SELECT 
        COUNT(*) as total_open,
        COUNT(*) FILTER (WHERE severity = 'CRITICAL') as critical_count,
        COUNT(*) FILTER (WHERE severity = 'ERROR') as error_count,
        COUNT(*) FILTER (WHERE severity = 'WARNING') as warning_count
    INTO v_open_incidents
    FROM production_incidents
    WHERE status IN ('OPEN', 'ACKNOWLEDGED');

    IF v_open_incidents.critical_count > 0 THEN
        v_status_app := 'critical';
    ELSIF v_open_incidents.error_count > 0 THEN
        v_status_app := 'degraded';
    END IF;

    -- 5. Business Orders (last 24h)
    SELECT
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status IN ('processing', 'in progress')) as processing,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status IN ('cancelled', 'canceled', 'failed')) as failed,
        COUNT(*) FILTER (WHERE status = 'pending' AND created_at < NOW() - INTERVAL '15 minutes') as stuck_pending
    INTO v_orders_stats
    FROM orders
    WHERE created_at >= NOW() - INTERVAL '24 hours';

    IF v_orders_stats.stuck_pending > 5 THEN
        v_status_orders := 'degraded';
    END IF;

    -- 6. Business Payments (last 24h)
    SELECT
        COUNT(*) FILTER (WHERE status IN ('approved', 'Paid')) as successful,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'rejected') as failed
    INTO v_payments_stats
    FROM transactions
    WHERE type = 'deposit' AND created_at >= NOW() - INTERVAL '24 hours';

    RETURN json_build_object(
        'timestamp', NOW(),
        'system_status', json_build_object(
            'application', v_status_app,
            'database', v_status_db,
            'authentication', 'healthy',
            'payments', v_status_payments,
            'orders', v_status_orders,
            'external_apis', 'healthy',
            'cron_jobs', v_status_cron
        ),
        'errors', json_build_object(
            'last_5m', COALESCE(v_errors_5m, 0),
            'last_1h', COALESCE(v_errors_1h, 0),
            'last_24h', COALESCE(v_errors_24h, 0)
        ),
        'performance', json_build_object(
            'requests_1h', COALESCE(v_requests_1h, 0),
            'error_rate_pct', CASE WHEN COALESCE(v_requests_1h, 0) > 0 THEN ROUND((COALESCE(v_errors_1h, 0)::NUMERIC / v_requests_1h::NUMERIC) * 100, 2) ELSE 0 END,
            'avg_latency_ms', ROUND(COALESCE(v_p50_1h, 0), 1),
            'p50_ms', ROUND(COALESCE(v_p50_1h, 0), 1),
            'p95_ms', ROUND(COALESCE(v_p95_1h, 0), 1),
            'p99_ms', ROUND(COALESCE(v_p99_1h, 0), 1)
        ),
        'business', json_build_object(
            'orders_24h', json_build_object(
                'completed', COALESCE(v_orders_stats.completed, 0),
                'processing', COALESCE(v_orders_stats.processing, 0),
                'pending', COALESCE(v_orders_stats.pending, 0),
                'failed', COALESCE(v_orders_stats.failed, 0),
                'stuck_pending', COALESCE(v_orders_stats.stuck_pending, 0)
            ),
            'payments_24h', json_build_object(
                'successful', COALESCE(v_payments_stats.successful, 0),
                'pending', COALESCE(v_payments_stats.pending, 0),
                'failed', COALESCE(v_payments_stats.failed, 0)
            )
        ),
        'background_jobs', json_build_object(
            'last_run', v_last_cron.completed_at,
            'status', COALESCE(v_last_cron.status, 'UNKNOWN'),
            'duration_ms', COALESCE(v_last_cron.duration_ms, 0),
            'seconds_since_last_run', v_last_cron.seconds_since_last_run,
            'error', v_last_cron.error_message
        ),
        'incidents_summary', json_build_object(
            'total_open', COALESCE(v_open_incidents.total_open, 0),
            'critical', COALESCE(v_open_incidents.critical_count, 0),
            'error', COALESCE(v_open_incidents.error_count, 0),
            'warning', COALESCE(v_open_incidents.warning_count, 0)
        )
    )::JSONB;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
