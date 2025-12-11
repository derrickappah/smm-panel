-- Add Row Level Security (RLS) Policies for Promotion Packages
-- Run this in Supabase SQL Editor after CREATE_PROMOTION_PACKAGES.sql

-- Enable Row Level Security
ALTER TABLE promotion_packages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view enabled promotion packages" ON promotion_packages;
DROP POLICY IF EXISTS "Admins can view all promotion packages" ON promotion_packages;
DROP POLICY IF EXISTS "Admins can insert promotion packages" ON promotion_packages;
DROP POLICY IF EXISTS "Admins can update promotion packages" ON promotion_packages;
DROP POLICY IF EXISTS "Admins can delete promotion packages" ON promotion_packages;

-- Public read access for enabled packages
CREATE POLICY "Anyone can view enabled promotion packages"
    ON promotion_packages FOR SELECT
    USING (enabled = TRUE);

-- Admin read access for all packages (including disabled)
CREATE POLICY "Admins can view all promotion packages"
    ON promotion_packages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Admin write access (create)
CREATE POLICY "Admins can insert promotion packages"
    ON promotion_packages FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Admin write access (update)
CREATE POLICY "Admins can update promotion packages"
    ON promotion_packages FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Admin write access (delete)
CREATE POLICY "Admins can delete promotion packages"
    ON promotion_packages FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

