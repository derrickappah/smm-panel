-- Create Knowledge Base Articles Table
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS knowledge_base_articles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    tags TEXT[],
    views INTEGER DEFAULT 0,
    helpful_count INTEGER DEFAULT 0,
    not_helpful_count INTEGER DEFAULT 0,
    published BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_kb_articles_category ON knowledge_base_articles(category);
CREATE INDEX IF NOT EXISTS idx_kb_articles_published ON knowledge_base_articles(published) WHERE published = TRUE;
CREATE INDEX IF NOT EXISTS idx_kb_articles_created_at ON knowledge_base_articles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kb_articles_views ON knowledge_base_articles(views DESC);

-- Enable Row Level Security
ALTER TABLE knowledge_base_articles ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view published articles
CREATE POLICY "Anyone can view published knowledge base articles"
    ON knowledge_base_articles FOR SELECT
    TO authenticated
    USING (published = TRUE);

-- Policy: Admins can view all articles
CREATE POLICY "Admins can view all knowledge base articles"
    ON knowledge_base_articles FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Policy: Admins can insert articles
CREATE POLICY "Admins can create knowledge base articles"
    ON knowledge_base_articles FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Policy: Admins can update articles
CREATE POLICY "Admins can update knowledge base articles"
    ON knowledge_base_articles FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Policy: Admins can delete articles
CREATE POLICY "Admins can delete knowledge base articles"
    ON knowledge_base_articles FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_kb_articles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_kb_articles_timestamp
    BEFORE UPDATE ON knowledge_base_articles
    FOR EACH ROW
    EXECUTE FUNCTION update_kb_articles_updated_at();

-- Function to increment views
CREATE OR REPLACE FUNCTION increment_kb_article_views(article_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE knowledge_base_articles
    SET views = views + 1
    WHERE id = article_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION increment_kb_article_views(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_kb_article_views(UUID) TO anon;



