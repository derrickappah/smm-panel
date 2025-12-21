-- Create FAQs Table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS faqs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    "order" INTEGER DEFAULT 0,
    published BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_faqs_published ON faqs(published) WHERE published = TRUE;
CREATE INDEX IF NOT EXISTS idx_faqs_order ON faqs("order" ASC);
CREATE INDEX IF NOT EXISTS idx_faqs_created_at ON faqs(created_at DESC);

-- Enable Row Level Security
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view published FAQs (including anonymous users)
CREATE POLICY "Anyone can view published FAQs"
    ON faqs FOR SELECT
    TO authenticated, anon
    USING (published = TRUE);

-- Policy: Admins can view all FAQs
CREATE POLICY "Admins can view all FAQs"
    ON faqs FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- Policy: Admins can insert FAQs
CREATE POLICY "Admins can create FAQs"
    ON faqs FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

-- Policy: Admins can update FAQs
CREATE POLICY "Admins can update FAQs"
    ON faqs FOR UPDATE
    TO authenticated
    USING (public.is_admin());

-- Policy: Admins can delete FAQs
CREATE POLICY "Admins can delete FAQs"
    ON faqs FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_faqs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_faqs_timestamp
    BEFORE UPDATE ON faqs
    FOR EACH ROW
    EXECUTE FUNCTION update_faqs_updated_at();

