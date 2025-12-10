-- Add Performance Indexes for Database Query Optimization
-- This migration adds composite indexes to improve query performance
-- Run this in your Supabase SQL Editor

-- ============================================
-- TRANSACTIONS TABLE INDEXES
-- ============================================

-- Index for user-specific transaction queries (most common pattern)
-- Used when fetching transactions for a specific user ordered by date
CREATE INDEX IF NOT EXISTS idx_transactions_user_created 
ON transactions(user_id, created_at DESC);

-- Index for admin filtered queries (type, status, date)
-- Used when filtering transactions by type and status
CREATE INDEX IF NOT EXISTS idx_transactions_type_status_created 
ON transactions(type, status, created_at DESC);

-- Index for status-filtered queries
-- Used when filtering by status only
CREATE INDEX IF NOT EXISTS idx_transactions_status_created 
ON transactions(status, created_at DESC);

-- Index for type-filtered queries
-- Used when filtering by type only
CREATE INDEX IF NOT EXISTS idx_transactions_type_created 
ON transactions(type, created_at DESC);

-- ============================================
-- ORDERS TABLE INDEXES
-- ============================================

-- Index for user-specific order queries
-- Used when fetching orders for a specific user ordered by date
CREATE INDEX IF NOT EXISTS idx_orders_user_created 
ON orders(user_id, created_at DESC);

-- Index for status-filtered order queries
-- Used when filtering orders by status
CREATE INDEX IF NOT EXISTS idx_orders_status_created 
ON orders(status, created_at DESC);

-- Index for user and status combined (common admin pattern)
-- Used when filtering orders by user and status
CREATE INDEX IF NOT EXISTS idx_orders_user_status_created 
ON orders(user_id, status, created_at DESC);

-- ============================================
-- PROFILES TABLE INDEXES
-- ============================================

-- Index for role-based queries (admin checks)
-- Used when checking if user is admin
CREATE INDEX IF NOT EXISTS idx_profiles_role 
ON profiles(role) WHERE role IS NOT NULL;

-- Index for user lookup by email (if not already exists)
CREATE INDEX IF NOT EXISTS idx_profiles_email 
ON profiles(email) WHERE email IS NOT NULL;

-- ============================================
-- VERIFIED TRANSACTIONS TABLE INDEXES
-- ============================================

-- Composite index for verified transactions lookups
-- Used when checking transaction verification status
CREATE INDEX IF NOT EXISTS idx_verified_transactions_transaction_status 
ON verified_transactions(transaction_id, verified_status);

-- ============================================
-- SUPPORT TICKETS TABLE INDEXES
-- ============================================

-- Composite index for status-filtered ticket queries (admin pattern)
-- Used when filtering tickets by status ordered by date
CREATE INDEX IF NOT EXISTS idx_support_tickets_status_created 
ON support_tickets(status, created_at DESC);

-- Composite index for user and status combined queries
-- Used when filtering tickets by user and status
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_status_created 
ON support_tickets(user_id, status, created_at DESC);

-- ============================================
-- REFERRALS TABLE INDEXES
-- ============================================

-- Index for ordering referrals by creation date (admin queries)
CREATE INDEX IF NOT EXISTS idx_referrals_created 
ON referrals(created_at DESC);

-- Composite index for referrer and bonus status queries
-- Used when filtering referrals by referrer and bonus status
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_bonus_created 
ON referrals(referrer_id, bonus_awarded, created_at DESC);

-- ============================================
-- ORDERS TABLE ADDITIONAL INDEXES
-- ============================================

-- Composite index for service-based order queries
-- Used when filtering orders by service ordered by date
CREATE INDEX IF NOT EXISTS idx_orders_service_created 
ON orders(service_id, created_at DESC);

-- Composite index for SMMGen order ID lookups (for status checks)
CREATE INDEX IF NOT EXISTS idx_orders_smmgen_status_created 
ON orders(smmgen_order_id, status, created_at DESC) 
WHERE smmgen_order_id IS NOT NULL;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON INDEX idx_transactions_user_created IS 'Optimizes user-specific transaction queries ordered by date';
COMMENT ON INDEX idx_transactions_type_status_created IS 'Optimizes admin filtered transaction queries';
COMMENT ON INDEX idx_orders_user_created IS 'Optimizes user-specific order queries ordered by date';
COMMENT ON INDEX idx_orders_status_created IS 'Optimizes status-filtered order queries';
COMMENT ON INDEX idx_profiles_role IS 'Optimizes role-based queries for admin checks';
COMMENT ON INDEX idx_support_tickets_status_created IS 'Optimizes status-filtered ticket queries ordered by date';
COMMENT ON INDEX idx_referrals_created IS 'Optimizes referral queries ordered by creation date';
COMMENT ON INDEX idx_orders_service_created IS 'Optimizes service-based order queries ordered by date';

