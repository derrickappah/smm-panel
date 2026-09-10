-- Create Announcements Table for Top Status/Announcement Bar
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message TEXT NOT NULL DEFAULT '⚡ ORDERS PROCESSING SPEED: FAST & ACTIVE !! 🚀 24/7 AUTOMATED DELIVERY ACROSS ALL SERVICES',
    enabled BOOLEAN DEFAULT TRUE,
    speed TEXT DEFAULT 'normal' CHECK (speed IN ('slow', 'normal', 'fast')),
    theme TEXT DEFAULT 'navy' CHECK (theme IN ('navy', 'emerald', 'amber', 'crimson')),
    display_scope TEXT DEFAULT 'all' CHECK (display_scope IN ('all', 'dashboard')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Public can view announcements" ON announcements;
DROP POLICY IF EXISTS "Admins full access announcements" ON announcements;

-- Policy: Everyone (anon and authenticated) can view announcements
CREATE POLICY "Public can view announcements"
    ON announcements FOR SELECT
    TO anon, authenticated
    USING (true);

-- Policy: Admins have full access
CREATE POLICY "Admins full access announcements"
    ON announcements FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Insert default announcement row if table is empty
INSERT INTO announcements (message, enabled, speed, theme, display_scope)
SELECT 
    '⚡ ORDERS PROCESSING SPEED: FAST & ACTIVE !! 🚀 24/7 AUTOMATED DELIVERY ACROSS ALL SERVICES',
    TRUE,
    'normal',
    'navy',
    'all'
WHERE NOT EXISTS (SELECT 1 FROM announcements);

-- Enable Realtime publication
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'announcements'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
    END IF;
  END IF;
END $$;
