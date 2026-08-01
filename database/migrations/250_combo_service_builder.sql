-- Migration: 250_combo_service_builder.sql
-- Description: Combo Service Builder infrastructure with separate tables, foreign keys, logs, stored functions, and RLS policies

BEGIN;

-- 1. Combo Services Table
CREATE TABLE IF NOT EXISTS combo_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    selling_price NUMERIC(12, 2) NOT NULL CHECK (selling_price >= 0),
    category TEXT NOT NULL DEFAULT 'Combo',
    min_order INTEGER NOT NULL DEFAULT 1 CHECK (min_order > 0),
    max_order INTEGER NOT NULL DEFAULT 100000 CHECK (max_order >= min_order),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    total_provider_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    profit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    service_id UUID UNIQUE, -- Linked entry in public.services table for store availability
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Combo Service Items (Child Services) Table
CREATE TABLE IF NOT EXISTS combo_service_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    combo_service_id UUID NOT NULL REFERENCES combo_services(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- e.g., 'SM Engine', 'SMM Course', 'smmgen', etc.
    provider_service_id TEXT NOT NULL,
    service_type TEXT NOT NULL DEFAULT 'Likes', -- Likes, Views, Shares, Saves, Comments, Followers, etc.
    fixed_quantity INTEGER NOT NULL CHECK (fixed_quantity > 0),
    estimated_cost NUMERIC(12, 4) NOT NULL DEFAULT 0.0000 CHECK (estimated_cost >= 0),
    delay_seconds INTEGER NOT NULL DEFAULT 0 CHECK (delay_seconds >= 0),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Parent Orders Table
CREATE TABLE IF NOT EXISTS combo_parent_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number BIGINT GENERATED ALWAYS AS IDENTITY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    combo_service_id UUID REFERENCES combo_services(id) ON DELETE SET NULL,
    combo_service_name TEXT NOT NULL,
    link TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    selling_price NUMERIC(12, 2) NOT NULL CHECK (selling_price >= 0),
    total_provider_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    profit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'partial', 'canceled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Child Orders Table
CREATE TABLE IF NOT EXISTS combo_child_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_order_id UUID NOT NULL REFERENCES combo_parent_orders(id) ON DELETE CASCADE,
    combo_item_id UUID REFERENCES combo_service_items(id) ON DELETE SET NULL,
    provider TEXT NOT NULL,
    provider_service_id TEXT NOT NULL,
    provider_order_id TEXT, -- Order ID returned by provider API
    service_type TEXT NOT NULL,
    fixed_quantity INTEGER NOT NULL,
    cost NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
    delay_seconds INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'partial', 'canceled', 'failed')),
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    dispatched_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Combo Audit Logs Table
CREATE TABLE IF NOT EXISTS combo_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_order_id UUID REFERENCES combo_parent_orders(id) ON DELETE CASCADE,
    child_order_id UUID REFERENCES combo_child_orders(id) ON DELETE CASCADE,
    log_type TEXT NOT NULL CHECK (log_type IN ('parent_creation', 'child_creation', 'provider_request', 'provider_response', 'retry_attempt', 'failure', 'manual_retry')),
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_combo_service_items_combo_id ON combo_service_items(combo_service_id);
CREATE INDEX IF NOT EXISTS idx_combo_parent_orders_user_id ON combo_parent_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_combo_parent_orders_status ON combo_parent_orders(status);
CREATE INDEX IF NOT EXISTS idx_combo_child_orders_parent_id ON combo_child_orders(parent_order_id);
CREATE INDEX IF NOT EXISTS idx_combo_child_orders_status ON combo_child_orders(status);
CREATE INDEX IF NOT EXISTS idx_combo_logs_parent_id ON combo_logs(parent_order_id);
CREATE INDEX IF NOT EXISTS idx_combo_logs_child_id ON combo_logs(child_order_id);

-- Add column is_combo to services table if not present
ALTER TABLE services ADD COLUMN IF NOT EXISTS is_combo BOOLEAN DEFAULT FALSE;
ALTER TABLE services ADD COLUMN IF NOT EXISTS combo_service_id UUID REFERENCES combo_services(id) ON DELETE SET NULL;

-- 6. Row Level Security (RLS) Policies
ALTER TABLE combo_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE combo_service_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE combo_parent_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE combo_child_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE combo_logs ENABLE ROW LEVEL SECURITY;

-- Drop old policies if existing
DROP POLICY IF EXISTS "Public read combo_services" ON combo_services;
DROP POLICY IF EXISTS "Public read combo_service_items" ON combo_service_items;
DROP POLICY IF EXISTS "Admins manage combo_services" ON combo_services;
DROP POLICY IF EXISTS "Admins manage combo_service_items" ON combo_service_items;
DROP POLICY IF EXISTS "Users view own combo parent orders" ON combo_parent_orders;
DROP POLICY IF EXISTS "Manage combo parent orders" ON combo_parent_orders;
DROP POLICY IF EXISTS "Manage combo child orders" ON combo_child_orders;
DROP POLICY IF EXISTS "Manage combo logs" ON combo_logs;

-- Create permissive RLS policies for combo builder tables
CREATE POLICY "Public read combo_services" ON combo_services FOR SELECT USING (true);
CREATE POLICY "Public read combo_service_items" ON combo_service_items FOR SELECT USING (true);

CREATE POLICY "Admins manage combo_services" ON combo_services FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Admins manage combo_service_items" ON combo_service_items FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Manage combo parent orders" ON combo_parent_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Manage combo child orders" ON combo_child_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Manage combo logs" ON combo_logs FOR ALL USING (true) WITH CHECK (true);

-- Allow insert and update on public.services for combo service synchronization
DROP POLICY IF EXISTS "Allow combo service mirror insert" ON public.services;
CREATE POLICY "Allow combo service mirror insert" ON public.services FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Allow combo service mirror update" ON public.services;
CREATE POLICY "Allow combo service mirror update" ON public.services FOR UPDATE TO public USING (true);

-- 7. Stored Function: Atomically recalculate Parent Order status
CREATE OR REPLACE FUNCTION update_combo_parent_order_status(p_parent_order_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_children INTEGER;
    v_completed_children INTEGER;
    v_processing_children INTEGER;
    v_failed_children INTEGER;
    v_canceled_children INTEGER;
    v_new_status TEXT;
BEGIN
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'completed'),
        COUNT(*) FILTER (WHERE status = 'processing'),
        COUNT(*) FILTER (WHERE status = 'failed'),
        COUNT(*) FILTER (WHERE status = 'canceled')
    INTO 
        v_total_children,
        v_completed_children,
        v_processing_children,
        v_failed_children,
        v_canceled_children
    FROM combo_child_orders
    WHERE parent_order_id = p_parent_order_id;

    IF v_total_children = 0 THEN
        v_new_status := 'pending';
    ELSIF v_completed_children = v_total_children THEN
        v_new_status := 'completed';
    ELSIF v_failed_children > 0 OR v_canceled_children > 0 THEN
        v_new_status := 'partial';
    ELSIF v_processing_children > 0 OR v_completed_children > 0 THEN
        v_new_status := 'processing';
    ELSE
        v_new_status := 'pending';
    END IF;

    UPDATE combo_parent_orders
    SET status = v_new_status,
        updated_at = NOW()
    WHERE id = p_parent_order_id;

    RETURN v_new_status;
END;
$$;

-- 8. Stored Function: Atomic Place Combo Order with wallet balance validation
CREATE OR REPLACE FUNCTION place_combo_order_atomic(
    p_user_id UUID,
    p_combo_service_id UUID,
    p_link TEXT,
    p_quantity INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_balance NUMERIC(12, 2);
    v_combo combo_services%ROWTYPE;
    v_selling_price NUMERIC(12, 2);
    v_parent_order_id UUID;
    v_item RECORD;
    v_child_order_id UUID;
    v_scheduled_at TIMESTAMPTZ;
    v_created_children JSONB := '[]'::jsonb;
BEGIN
    SELECT * INTO v_combo FROM combo_services WHERE id = p_combo_service_id AND status = 'active';
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Combo service not found or inactive');
    END IF;

    IF p_quantity < v_combo.min_order OR p_quantity > v_combo.max_order THEN
        RETURN jsonb_build_object('success', false, 'error', 'Quantity out of bounds for combo service');
    END IF;

    v_selling_price := v_combo.selling_price;

    SELECT balance INTO v_user_balance FROM users WHERE id = p_user_id FOR UPDATE;
    IF v_user_balance IS NULL OR v_user_balance < v_selling_price THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient user balance');
    END IF;

    UPDATE users 
    SET balance = balance - v_selling_price,
        updated_at = NOW()
    WHERE id = p_user_id;

    INSERT INTO combo_parent_orders (
        user_id,
        combo_service_id,
        combo_service_name,
        link,
        quantity,
        selling_price,
        total_provider_cost,
        profit,
        status
    ) VALUES (
        p_user_id,
        v_combo.id,
        v_combo.name,
        p_link,
        p_quantity,
        v_selling_price,
        v_combo.total_provider_cost,
        v_combo.profit,
        'pending'
    ) RETURNING id INTO v_parent_order_id;

    INSERT INTO transactions (
        user_id,
        amount,
        type,
        status,
        description
    ) VALUES (
        p_user_id,
        v_selling_price,
        'order',
        'completed',
        'Combo Order #' || v_parent_order_id || ' (' || v_combo.name || ')'
    );

    INSERT INTO combo_logs (parent_order_id, log_type, message, details)
    VALUES (
        v_parent_order_id,
        'parent_creation',
        'Parent order created successfully',
        jsonb_build_object('user_id', p_user_id, 'combo_service_id', v_combo.id, 'price', v_selling_price)
    );

    FOR v_item IN 
        SELECT * FROM combo_service_items 
        WHERE combo_service_id = v_combo.id AND enabled = TRUE 
        ORDER BY display_order ASC 
    LOOP
        v_scheduled_at := NOW() + (v_item.delay_seconds || ' seconds')::INTERVAL;

        INSERT INTO combo_child_orders (
            parent_order_id,
            combo_item_id,
            provider,
            provider_service_id,
            service_type,
            fixed_quantity,
            cost,
            delay_seconds,
            status,
            scheduled_at
        ) VALUES (
            v_parent_order_id,
            v_item.id,
            v_item.provider,
            v_item.provider_service_id,
            v_item.service_type,
            v_item.fixed_quantity,
            v_item.estimated_cost,
            v_item.delay_seconds,
            'pending',
            v_scheduled_at
        ) RETURNING id INTO v_child_order_id;

        INSERT INTO combo_logs (parent_order_id, child_order_id, log_type, message, details)
        VALUES (
            v_parent_order_id,
            v_child_order_id,
            'child_creation',
            'Child order generated for provider ' || v_item.provider,
            jsonb_build_object('provider', v_item.provider, 'service_id', v_item.provider_service_id, 'delay', v_item.delay_seconds)
        );

        v_created_children := v_created_children || jsonb_build_object(
            'id', v_child_order_id,
            'provider', v_item.provider,
            'provider_service_id', v_item.provider_service_id,
            'service_type', v_item.service_type,
            'fixed_quantity', v_item.fixed_quantity,
            'delay_seconds', v_item.delay_seconds,
            'scheduled_at', v_scheduled_at
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'parent_order_id', v_parent_order_id,
        'combo_name', v_combo.name,
        'selling_price', v_selling_price,
        'child_orders', v_created_children
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMIT;
