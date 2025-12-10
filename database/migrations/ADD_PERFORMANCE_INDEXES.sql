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
-- COMMENTS
-- ============================================

COMMENT ON INDEX idx_transactions_user_created IS 'Optimizes user-specific transaction queries ordered by date';
COMMENT ON INDEX idx_transactions_type_status_created IS 'Optimizes admin filtered transaction queries';
COMMENT ON INDEX idx_orders_user_created IS 'Optimizes user-specific order queries ordered by date';
COMMENT ON INDEX idx_orders_status_created IS 'Optimizes status-filtered order queries';
COMMENT ON INDEX idx_profiles_role IS 'Optimizes role-based queries for admin checks';

