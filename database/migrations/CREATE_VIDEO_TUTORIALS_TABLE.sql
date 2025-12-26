-- Create Video Tutorials Table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS video_tutorials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    video_url TEXT NOT NULL,
    thumbnail_url TEXT,
    category TEXT,
    duration INTEGER, -- Duration in seconds
    "order" INTEGER DEFAULT 0,
    published BOOLEAN DEFAULT TRUE,
    views INTEGER DEFAULT 0,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_video_tutorials_published ON video_tutorials(published) WHERE published = TRUE;
CREATE INDEX IF NOT EXISTS idx_video_tutorials_order ON video_tutorials("order" ASC);
CREATE INDEX IF NOT EXISTS idx_video_tutorials_created_at ON video_tutorials(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_tutorials_category ON video_tutorials(category);
CREATE INDEX IF NOT EXISTS idx_video_tutorials_views ON video_tutorials(views DESC);

-- Enable Row Level Security
ALTER TABLE video_tutorials ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view published video tutorials (including anonymous users)
CREATE POLICY "Anyone can view published video tutorials"
    ON video_tutorials FOR SELECT
    TO authenticated, anon
    USING (published = TRUE);

-- Policy: Admins can view all video tutorials
CREATE POLICY "Admins can view all video tutorials"
    ON video_tutorials FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- Policy: Admins can insert video tutorials
CREATE POLICY "Admins can create video tutorials"
    ON video_tutorials FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

-- Policy: Admins can update video tutorials
CREATE POLICY "Admins can update video tutorials"
    ON video_tutorials FOR UPDATE
    TO authenticated
    USING (public.is_admin());

-- Policy: Admins can delete video tutorials
CREATE POLICY "Admins can delete video tutorials"
    ON video_tutorials FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_video_tutorials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_video_tutorials_timestamp
    BEFORE UPDATE ON video_tutorials
    FOR EACH ROW
    EXECUTE FUNCTION update_video_tutorials_updated_at();

-- Add comment
COMMENT ON TABLE video_tutorials IS 'Video tutorials that can be displayed to users for learning and guidance';

