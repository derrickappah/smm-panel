-- Create Promotion Packages Table
-- This table stores fixed-price promotion packages (e.g., "1M TikTok views for 200 GHS")
-- Run this in Supabase SQL Editor

-- Create the promotion_packages table
CREATE TABLE IF NOT EXISTS promotion_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    platform TEXT NOT NULL,
    service_type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    description TEXT,
    smmgen_service_id TEXT,
    enabled BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_promotion_packages_enabled ON promotion_packages(enabled) WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_promotion_packages_platform ON promotion_packages(platform);
CREATE INDEX IF NOT EXISTS idx_promotion_packages_display_order ON promotion_packages(display_order);

-- Add comments for documentation
COMMENT ON TABLE promotion_packages IS 'Stores fixed-price promotion packages for social media services';
COMMENT ON COLUMN promotion_packages.name IS 'Package name (e.g., "1M TikTok Views Package")';
COMMENT ON COLUMN promotion_packages.platform IS 'Social media platform (tiktok, instagram, youtube, etc.)';
COMMENT ON COLUMN promotion_packages.service_type IS 'Type of service (views, likes, followers, etc.)';
COMMENT ON COLUMN promotion_packages.quantity IS 'Fixed quantity for this package (e.g., 1000000 for 1M views)';
COMMENT ON COLUMN promotion_packages.price IS 'Fixed price in GHS (e.g., 200.00)';
COMMENT ON COLUMN promotion_packages.smmgen_service_id IS 'SMMGen API service ID for integration';
COMMENT ON COLUMN promotion_packages.enabled IS 'Whether this package is enabled and visible to users';
COMMENT ON COLUMN promotion_packages.display_order IS 'Order for displaying packages (lower numbers first)';

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_promotion_packages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_promotion_packages_updated_at
    BEFORE UPDATE ON promotion_packages
    FOR EACH ROW
    EXECUTE FUNCTION update_promotion_packages_updated_at();

