-- Create Support Admin Notes Table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS admin_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
    admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_admin_notes_conversation_id ON admin_notes(conversation_id);
CREATE INDEX IF NOT EXISTS idx_admin_notes_admin_id ON admin_notes(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_notes_created_at ON admin_notes(created_at DESC);

-- Enable Row Level Security
ALTER TABLE admin_notes ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can SELECT notes
CREATE POLICY "Admins can view admin notes"
    ON admin_notes FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- Policy: Only admins can INSERT notes
CREATE POLICY "Admins can create admin notes"
    ON admin_notes FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_admin()
        AND admin_id = auth.uid()
    );

-- Policy: Only admins can UPDATE notes (only their own)
CREATE POLICY "Admins can update their own notes"
    ON admin_notes FOR UPDATE
    TO authenticated
    USING (
        public.is_admin()
        AND admin_id = auth.uid()
    )
    WITH CHECK (
        public.is_admin()
        AND admin_id = auth.uid()
    );

-- Policy: Only admins can DELETE notes (only their own)
CREATE POLICY "Admins can delete their own notes"
    ON admin_notes FOR DELETE
    TO authenticated
    USING (
        public.is_admin()
        AND admin_id = auth.uid()
    );

-- Function to update admin note timestamp
CREATE OR REPLACE FUNCTION update_admin_note_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_admin_note_timestamp_trigger
    BEFORE UPDATE ON admin_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_admin_note_timestamp();

-- Add comments for documentation
COMMENT ON TABLE admin_notes IS 'Internal admin notes for support conversations (not visible to users)';
COMMENT ON COLUMN admin_notes.note IS 'Internal note text visible only to admins';

