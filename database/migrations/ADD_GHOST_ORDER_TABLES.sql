-- Migration: Add Ghost Order & Suspicious Activity Detection Tables
-- Use this to store audit results from the automated reconciliation system.

-- 1. Table: Ghost Orders (Provider orders missing from Local DB)
CREATE TABLE IF NOT EXISTS security_ghost_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_order_id TEXT NOT NULL,
    provider_name TEXT NOT NULL, -- 'smmgen', 'jbsmmpanel', etc.
    service_id TEXT,
    link TEXT,
    quantity INTEGER,
    charge NUMERIC,
    status TEXT,
    provider_created_at TIMESTAMPTZ, -- When it was created at the provider
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    is_resolved BOOLEAN DEFAULT FALSE,
    resolution_note TEXT
);

-- Indexes for fast matching/deduplication
CREATE INDEX IF NOT EXISTS idx_ghost_provider_id ON security_ghost_orders(provider_order_id);
CREATE INDEX IF NOT EXISTS idx_ghost_detected ON security_ghost_orders(detected_at DESC);

COMMENT ON TABLE security_ghost_orders IS 'Stores orders found at the provider that have no matching record in the local database.';

-- 2. Table: Suspicious Activity (Spam, Duplicates, Volume Spikes)
CREATE TABLE IF NOT EXISTS security_suspicious_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_type TEXT NOT NULL, -- 'duplicate_spam', 'volume_spike', 'abnormal_velocity'
    user_id UUID REFERENCES profiles(id),
    ip_address TEXT,
    link TEXT,
    service_id TEXT,
    event_count INTEGER, -- How many times it happened
    details JSONB, -- Full context
    severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    is_resolved BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_suspicious_user ON security_suspicious_activity(user_id);
CREATE INDEX IF NOT EXISTS idx_suspicious_type ON security_suspicious_activity(activity_type);

COMMENT ON TABLE security_suspicious_activity IS 'Stores detected patterns of abuse such as duplicate spam or volume spikes.';
