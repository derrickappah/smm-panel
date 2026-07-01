-- ============================================================
-- ADD_URL_TYPE_AND_REFUND_IMPROVEMENTS.sql
-- Automatic Order Validation & Refund System — DB Changes
--
-- Run this once in Supabase SQL Editor (safe to re-run).
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Add url_type to services
--    Allowed values: 'post' | 'profile' | NULL (skip validation)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE services
    ADD COLUMN IF NOT EXISTS url_type TEXT
    CHECK (url_type IN ('post', 'profile'));

COMMENT ON COLUMN services.url_type IS
    'URL type required for this service: ''post'' = post/content URL, ''profile'' = profile/page URL, NULL = skip validation';

-- ─────────────────────────────────────────────────────────────
-- 2. Add url_type to promotion_packages (package orders also need validation)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE promotion_packages
    ADD COLUMN IF NOT EXISTS url_type TEXT
    CHECK (url_type IN ('post', 'profile'));

COMMENT ON COLUMN promotion_packages.url_type IS
    'URL type required for this package: ''post'' = post/content URL, ''profile'' = profile/page URL, NULL = skip validation';

-- ─────────────────────────────────────────────────────────────
-- 3. Ensure last_provider_error column exists on orders
-- ─────────────────────────────────────────────────────────────
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS last_provider_error TEXT;

COMMENT ON COLUMN orders.last_provider_error IS
    'Last error message returned by the provider API (e.g. Placement Failed, Insufficient balance)';

-- ─────────────────────────────────────────────────────────────
-- 4. Ensure provider_error_details JSONB column exists on orders
-- ─────────────────────────────────────────────────────────────
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS provider_error_details JSONB;

COMMENT ON COLUMN orders.provider_error_details IS
    'Full structured error response from the provider API for debugging';

-- ─────────────────────────────────────────────────────────────
-- 5. Ensure 'refunded' and 'submission_failed' are valid order statuses
--    (idempotent — drops and recreates the constraint)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders
    ADD CONSTRAINT orders_status_check
    CHECK (status IN (
        'pending',
        'in progress',
        'processing',
        'partial',
        'completed',
        'canceled',
        'cancelled',
        'refunds',
        'refunded',
        'submission_failed'
    ));

COMMENT ON COLUMN orders.status IS
    'Order status lifecycle: pending → processing/in progress → completed | refunded | canceled | submission_failed';

-- ─────────────────────────────────────────────────────────────
-- 6. Index: speed up duplicate active-order check
--    (user_id + service_id + link filtered by active statuses)
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_duplicate_check
    ON orders (user_id, service_id, link)
    WHERE status IN ('pending', 'processing', 'in progress');

-- ─────────────────────────────────────────────────────────────
-- 7. Improve process_automatic_refund to also save provider error
--    (full replacement — safe to run multiple times)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION process_automatic_refund(
    p_order_id        TEXT,
    p_refund_amount   DECIMAL,
    p_refund_type     TEXT,
    p_remains         INTEGER DEFAULT 0,
    p_provider_error  TEXT    DEFAULT NULL,
    p_error_details   JSONB   DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_order           RECORD;
    v_refund_id       UUID;
    v_current_balance DECIMAL;
BEGIN
    -- 1. Lock the order row to prevent concurrent status updates
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

    IF v_order IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- 2. Prevent double-refund
    IF EXISTS (SELECT 1 FROM order_refunds WHERE order_id = p_order_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order already refunded');
    END IF;

    -- 3. Validate refund amount
    IF p_refund_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid refund amount: must be greater than zero');
    END IF;

    -- 4. Insert refund record (UNIQUE constraint on order_id prevents duplicates)
    INSERT INTO order_refunds (order_id, user_id, amount, type, remains)
    VALUES (p_order_id, v_order.user_id, p_refund_amount, p_refund_type, p_remains)
    RETURNING id INTO v_refund_id;

    -- 5. Credit user balance
    UPDATE profiles
        SET balance = balance + p_refund_amount
        WHERE id = v_order.user_id;

    -- 6. Update order status, provider error, and refund tracking
    UPDATE orders
        SET
            status                = CASE WHEN p_refund_type = 'full' THEN 'refunded' ELSE 'partial' END,
            refund_status         = 'succeeded',
            refund_attempted_at   = NOW(),
            refund_error          = NULL,
            last_provider_error   = COALESCE(p_provider_error, last_provider_error),
            provider_error_details = COALESCE(p_error_details, provider_error_details)
        WHERE id = p_order_id;

    -- 7. Log a credit transaction for the refund
    INSERT INTO transactions (user_id, amount, type, status, order_id)
    VALUES (v_order.user_id, p_refund_amount, 'refund', 'approved', p_order_id)
    ON CONFLICT DO NOTHING;

    -- 8. Return new balance
    SELECT balance INTO v_current_balance FROM profiles WHERE id = v_order.user_id;

    RETURN jsonb_build_object(
        'success',         true,
        'refund_id',       v_refund_id,
        'amount_refunded', p_refund_amount,
        'new_balance',     v_current_balance,
        'type',            p_refund_type
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error',   SQLERRM,
        'detail',  SQLSTATE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION process_automatic_refund(TEXT, DECIMAL, TEXT, INTEGER, TEXT, JSONB)
    TO service_role;

COMMENT ON FUNCTION process_automatic_refund IS
    'Atomically refunds a customer: credits balance, marks order refunded, records provider error. UNIQUE constraint on order_refunds prevents double-refunds.';

-- ─────────────────────────────────────────────────────────────
-- Done
-- ─────────────────────────────────────────────────────────────
