-- Create Canned Responses Table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS canned_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    tags TEXT[],
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_canned_responses_category ON canned_responses(category);
CREATE INDEX IF NOT EXISTS idx_canned_responses_created_at ON canned_responses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_canned_responses_usage_count ON canned_responses(usage_count DESC);

-- Enable Row Level Security
ALTER TABLE canned_responses ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can view all canned responses
CREATE POLICY "Admins can view canned responses"
    ON canned_responses FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Policy: Admins can insert canned responses
CREATE POLICY "Admins can create canned responses"
    ON canned_responses FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Policy: Admins can update canned responses
CREATE POLICY "Admins can update canned responses"
    ON canned_responses FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Policy: Admins can delete canned responses
CREATE POLICY "Admins can delete canned responses"
    ON canned_responses FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_canned_responses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_canned_responses_timestamp
    BEFORE UPDATE ON canned_responses
    FOR EACH ROW
    EXECUTE FUNCTION update_canned_responses_updated_at();

-- Function to increment usage count
CREATE OR REPLACE FUNCTION increment_canned_response_usage(response_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE canned_responses
    SET usage_count = usage_count + 1
    WHERE id = response_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION increment_canned_response_usage(UUID) TO authenticated;






