-- Create Updates/Announcements Table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'announcement' CHECK (type IN ('announcement', 'update', 'news')),
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    published BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_updates_published ON updates(published) WHERE published = TRUE;
CREATE INDEX IF NOT EXISTS idx_updates_created_at ON updates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_updates_type ON updates(type);
CREATE INDEX IF NOT EXISTS idx_updates_priority ON updates(priority);

-- Enable Row Level Security
ALTER TABLE updates ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view published updates (including anonymous users)
CREATE POLICY "Anyone can view published updates"
    ON updates FOR SELECT
    TO authenticated, anon
    USING (published = TRUE);

-- Policy: Admins can view all updates
CREATE POLICY "Admins can view all updates"
    ON updates FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- Policy: Admins can insert updates
CREATE POLICY "Admins can create updates"
    ON updates FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

-- Policy: Admins can update updates
CREATE POLICY "Admins can update updates"
    ON updates FOR UPDATE
    TO authenticated
    USING (public.is_admin());

-- Policy: Admins can delete updates
CREATE POLICY "Admins can delete updates"
    ON updates FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_updates_timestamp
    BEFORE UPDATE ON updates
    FOR EACH ROW
    EXECUTE FUNCTION update_updates_updated_at();

-- Add comment
COMMENT ON TABLE updates IS 'Platform updates and announcements that can be displayed to users';

