-- Add Search Indexes for Orders Admin Page
-- This migration adds indexes to support efficient text search on orders and profiles
-- Run this in your Supabase SQL Editor

-- ============================================
-- PROFILES TABLE SEARCH INDEXES
-- ============================================

-- Index for name search (case-insensitive)
-- Used when searching orders by user name
CREATE INDEX IF NOT EXISTS idx_profiles_name_search 
ON profiles(LOWER(name)) 
WHERE name IS NOT NULL;

-- Index for email search (case-insensitive)
-- Used when searching orders by user email
CREATE INDEX IF NOT EXISTS idx_profiles_email_search 
ON profiles(LOWER(email)) 
WHERE email IS NOT NULL;

-- Index for phone number search
-- Used when searching orders by user phone number
CREATE INDEX IF NOT EXISTS idx_profiles_phone_search 
ON profiles(phone_number) 
WHERE phone_number IS NOT NULL;

-- ============================================
-- ORDERS TABLE SEARCH INDEXES
-- ============================================

-- Index for link search (case-insensitive)
-- Used when searching orders by link/URL
CREATE INDEX IF NOT EXISTS idx_orders_link_search 
ON orders(LOWER(link)) 
WHERE link IS NOT NULL;

-- Index for order ID search (for UUID and text searches)
-- Used when searching by order ID
CREATE INDEX IF NOT EXISTS idx_orders_id_search 
ON orders(id);

-- Index for SMMGen order ID search
-- Used when searching by SMMGen order ID
CREATE INDEX IF NOT EXISTS idx_orders_smmgen_id_search 
ON orders(smmgen_order_id) 
WHERE smmgen_order_id IS NOT NULL;

-- Index for SMMCost order ID search
-- Used when searching by SMMCost order ID
CREATE INDEX IF NOT EXISTS idx_orders_smmcost_id_search 
ON orders(smmcost_order_id) 
WHERE smmcost_order_id IS NOT NULL;

-- Composite index for date filtering with status
-- Used when filtering by date and status together
CREATE INDEX IF NOT EXISTS idx_orders_date_status 
ON orders(created_at DESC, status);

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON INDEX idx_profiles_name_search IS 'Optimizes case-insensitive name search for order queries';
COMMENT ON INDEX idx_profiles_email_search IS 'Optimizes case-insensitive email search for order queries';
COMMENT ON INDEX idx_profiles_phone_search IS 'Optimizes phone number search for order queries';
COMMENT ON INDEX idx_orders_link_search IS 'Optimizes case-insensitive link/URL search for orders';
COMMENT ON INDEX idx_orders_id_search IS 'Optimizes order ID search';
COMMENT ON INDEX idx_orders_smmgen_id_search IS 'Optimizes SMMGen order ID search';
COMMENT ON INDEX idx_orders_smmcost_id_search IS 'Optimizes SMMCost order ID search';
COMMENT ON INDEX idx_orders_date_status IS 'Optimizes date and status filtering together';
