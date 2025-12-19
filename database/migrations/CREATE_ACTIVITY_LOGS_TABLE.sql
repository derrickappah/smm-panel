-- Create Activity Logs Table
-- This table tracks all user and admin activities for comprehensive audit trail
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- Nullable for system events
    action_type TEXT NOT NULL, -- e.g., 'login', 'logout', 'order_placed', 'deposit_approved', 'user_updated', 'settings_changed'
    entity_type TEXT, -- e.g., 'user', 'order', 'transaction', 'settings', 'profile'
    entity_id UUID, -- ID of the affected entity
    description TEXT NOT NULL, -- Human-readable description
    metadata JSONB DEFAULT '{}', -- Additional context (IP address, user agent, old/new values, etc.)
    severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'security')),
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action_type ON activity_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_severity ON activity_logs(severity);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created ON activity_logs(user_id, created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE activity_logs IS 'Comprehensive audit trail of all user and admin activities';
COMMENT ON COLUMN activity_logs.user_id IS 'User who performed the action (nullable for system events)';
COMMENT ON COLUMN activity_logs.action_type IS 'Type of action performed (login, logout, order_placed, etc.)';
COMMENT ON COLUMN activity_logs.entity_type IS 'Type of entity affected (user, order, transaction, etc.)';
COMMENT ON COLUMN activity_logs.entity_id IS 'ID of the affected entity';
COMMENT ON COLUMN activity_logs.description IS 'Human-readable description of the action';
COMMENT ON COLUMN activity_logs.metadata IS 'Additional context stored as JSON (IP, user agent, old/new values, etc.)';
COMMENT ON COLUMN activity_logs.severity IS 'Severity level: info, warning, error, or security';
COMMENT ON COLUMN activity_logs.ip_address IS 'IP address of the user who performed the action';
COMMENT ON COLUMN activity_logs.user_agent IS 'User agent string of the browser/client';

-- Enable Row Level Security (RLS)
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Policy for users to view their own activity logs
CREATE POLICY "Users can view own activity logs"
    ON activity_logs FOR SELECT
    USING (auth.uid() = user_id);

-- Policy for admins to view all activity logs
CREATE POLICY "Admins can view all activity logs"
    ON activity_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Policy for authenticated users/system to insert activity logs
-- This allows triggers and functions to insert logs
CREATE POLICY "Authenticated users can insert activity logs"
    ON activity_logs FOR INSERT
    WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- No UPDATE or DELETE policies - audit trail is immutable
-- This ensures the integrity of the audit log
