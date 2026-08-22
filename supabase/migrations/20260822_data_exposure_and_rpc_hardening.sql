-- Migration: 20260822_data_exposure_and_rpc_hardening.sql
-- Description: Fixes PII data exposure in get_admin_dashboard_stats, secures get_user_activity_summary, restricts automatic refunds, validates callers on order functions, and secures support-attachments bucket.

-- 1. Secure get_admin_dashboard_stats with strict admin check
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats(
    p_date_range_start timestamp with time zone DEFAULT NULL::timestamp with time zone, 
    p_date_range_end timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result json;
  v_today_start timestamptz;
  v_today_end timestamptz;
BEGIN
  -- Strict Admin Authorization Check
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required.';
  END IF;

  v_today_start := date_trunc('day', now());
  v_today_end := v_today_start + interval '1 day' - interval '1 millisecond';

  SELECT json_build_object(
    'total_users', (SELECT COUNT(*) FROM profiles WHERE (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)),
    'users_today', (SELECT COUNT(*) FROM profiles WHERE created_at >= v_today_start AND created_at <= v_today_end),
    'total_orders', COALESCE((SELECT COUNT(*) FROM orders WHERE (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'orders_today', COALESCE((SELECT COUNT(*) FROM orders WHERE created_at >= v_today_start AND created_at <= v_today_end), 0),
    'completed_orders', COALESCE((SELECT COUNT(*) FROM orders WHERE status = 'completed' AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'processing_orders', COALESCE((SELECT COUNT(*) FROM orders WHERE status IN ('processing', 'in progress') AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'cancelled_orders', COALESCE((SELECT COUNT(*) FROM orders WHERE status IN ('canceled', 'cancelled') AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'refunded_orders', COALESCE((SELECT COUNT(*) FROM orders WHERE refund_status = 'succeeded' AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'failed_refunds', COALESCE((SELECT COUNT(*) FROM orders WHERE refund_status = 'failed' AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'total_revenue', COALESCE((SELECT SUM(total_cost) FROM orders WHERE status = 'completed' AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'revenue_today', COALESCE((SELECT SUM(total_cost) FROM orders WHERE status = 'completed' AND created_at >= v_today_start AND created_at <= v_today_end), 0),
    'pending_deposits', COALESCE((SELECT COUNT(*) FROM transactions WHERE type = 'deposit' AND status = 'pending' AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'confirmed_deposits', COALESCE((SELECT COUNT(*) FROM transactions WHERE type = 'deposit' AND status = 'approved' AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'rejected_deposits', COALESCE((SELECT COUNT(*) FROM transactions WHERE type = 'deposit' AND status = 'rejected' AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'total_deposits', COALESCE((SELECT SUM(amount) FROM transactions WHERE type = 'deposit' AND status = 'approved' AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'total_deposits_amount', COALESCE((SELECT SUM(amount) FROM transactions WHERE type = 'deposit' AND status = 'approved' AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'deposits_today', COALESCE((SELECT COUNT(*) FROM transactions WHERE type = 'deposit' AND created_at >= v_today_start AND created_at <= v_today_end), 0),
    'deposits_amount_today', COALESCE((SELECT SUM(amount) FROM transactions WHERE type = 'deposit' AND status = 'approved' AND created_at >= v_today_start AND created_at <= v_today_end), 0),
    'total_transactions', COALESCE((SELECT COUNT(*) FROM transactions WHERE type = 'deposit' AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'open_tickets', COALESCE((SELECT COUNT(*) FROM tickets WHERE status = 'Pending' AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'in_progress_tickets', 0,
    'resolved_tickets', 0,
    'total_services', COALESCE((SELECT COUNT(*) FROM services), 0),
    'average_order_value', COALESCE((SELECT AVG(total_cost) FROM orders WHERE status = 'completed' AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'failed_orders', 0,
    'recent_orders', COALESCE((
      SELECT json_agg(row_to_json(ro))
      FROM (
        SELECT o.id, o.status, o.total_cost, o.quantity, o.created_at, o.promotion_package_id,
               json_build_object('name', s.name, 'service_type', s.service_type) as services,
               json_build_object('name', pp.name, 'service_type', pp.service_type) as promotion_packages,
               json_build_object('name', p.name, 'email', p.email) as profiles
        FROM orders o
        LEFT JOIN services s ON o.service_id = s.id
        LEFT JOIN promotion_packages pp ON o.promotion_package_id = pp.id
        LEFT JOIN profiles p ON o.user_id = p.id
        ORDER BY o.created_at DESC LIMIT 5
      ) ro
    ), '[]'::json),
    'recent_deposits', COALESCE((
      SELECT json_agg(row_to_json(rd))
      FROM (
        SELECT t.id, t.amount, t.status, t.created_at, t.deposit_method,
               json_build_object('name', p.name, 'email', p.email) as profiles
        FROM transactions t
        LEFT JOIN profiles p ON t.user_id = p.id
        WHERE t.type = 'deposit'
        ORDER BY t.created_at DESC LIMIT 5
      ) rd
    ), '[]'::json),
    'top_customers', COALESCE((
      SELECT json_agg(row_to_json(tc))
      FROM (
        SELECT t.user_id, SUM(t.amount) as "totalDeposits", COUNT(*) as "depositCount",
               COALESCE(p.name, p.email, 'Unknown User') as name,
               COALESCE(p.email, '') as email,
               ROW_NUMBER() OVER (ORDER BY SUM(t.amount) DESC) as rank
        FROM transactions t
        LEFT JOIN profiles p ON t.user_id = p.id
        WHERE t.type = 'deposit' AND t.status = 'approved'
        GROUP BY t.user_id, p.name, p.email
        ORDER BY "totalDeposits" DESC LIMIT 100
      ) tc
    ), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$$;

-- 2. Secure get_user_activity_summary
CREATE OR REPLACE FUNCTION public.get_user_activity_summary(p_user_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE(action_type text, count bigint, last_occurrence timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF auth.uid() IS NULL OR (auth.uid() != p_user_id AND NOT is_admin()) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    RETURN QUERY
    SELECT 
        al.action_type,
        COUNT(*)::BIGINT as count,
        MAX(al.created_at) as last_occurrence
    FROM activity_logs al
    WHERE al.user_id = p_user_id
      AND al.created_at >= NOW() - (p_days || ' days')::INTERVAL
    GROUP BY al.action_type
    ORDER BY count DESC;
END;
$$;

-- 3. Secure create_secure_order caller verification
CREATE OR REPLACE FUNCTION public.create_secure_order(p_user_id uuid, p_service_id uuid, p_package_id uuid, p_link text, p_quantity integer, p_total_cost numeric, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_balance NUMERIC;
    v_order_id UUID;
BEGIN
    IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id AND NOT is_admin() THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized caller');
    END IF;

    IF p_total_cost <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid order cost. Must be greater than zero.');
    END IF;

    SELECT balance INTO v_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
    
    IF v_balance IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'User not found');
    END IF;

    IF v_balance < p_total_cost THEN
        RETURN jsonb_build_object('success', false, 'message', 'Insufficient balance');
    END IF;

    INSERT INTO orders (
        user_id,
        service_id,
        promotion_package_id,
        link,
        quantity,
        total_cost,
        status,
        idempotency_key
    ) VALUES (
        p_user_id,
        p_service_id,
        p_package_id,
        p_link,
        p_quantity,
        p_total_cost,
        'pending',
        p_idempotency_key
    ) RETURNING id INTO v_order_id;

    UPDATE profiles SET balance = v_balance - p_total_cost WHERE id = p_user_id;

    RETURN jsonb_build_object(
        'success', true, 
        'order_id', v_order_id, 
        'new_balance', v_balance - p_total_cost
    );
END;
$$;

-- 4. Secure place_combo_order_atomic caller verification
CREATE OR REPLACE FUNCTION public.place_combo_order_atomic(p_user_id uuid, p_combo_service_id uuid, p_link text, p_quantity integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id AND NOT is_admin() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized caller');
    END IF;

    SELECT * INTO v_combo FROM combo_services WHERE id = p_combo_service_id AND status = 'active';
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Combo service not found or inactive');
    END IF;

    IF p_quantity < v_combo.min_order OR p_quantity > v_combo.max_order THEN
        RETURN jsonb_build_object('success', false, 'error', 'Quantity out of bounds for combo service');
    END IF;

    v_selling_price := v_combo.selling_price;

    SELECT balance INTO v_user_balance FROM profiles WHERE id = p_user_id FOR UPDATE;
    IF v_user_balance IS NULL OR v_user_balance < v_selling_price THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient user balance');
    END IF;

    UPDATE profiles 
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
        'approved',
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

-- 5. Secure place_order_with_balance_deduction
CREATE OR REPLACE FUNCTION public.place_order_with_balance_deduction(
    p_user_id uuid, 
    p_link text, 
    p_quantity integer, 
    p_total_cost numeric, 
    p_service_id uuid DEFAULT NULL::uuid, 
    p_package_id uuid DEFAULT NULL::uuid, 
    p_smmgen_order_id text DEFAULT NULL::text, 
    p_smmcost_order_id text DEFAULT NULL::text, 
    p_jbsmmpanel_order_id integer DEFAULT NULL::integer, 
    p_worldofsmm_order_id text DEFAULT NULL::text, 
    p_g1618_order_id text DEFAULT NULL::text, 
    p_oldsmm_order_id text DEFAULT NULL::text, 
    p_comments text DEFAULT NULL::text, 
    p_idempotency_key text DEFAULT NULL::text
)
RETURNS TABLE(success boolean, message text, order_id uuid, old_balance numeric, new_balance numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_balance NUMERIC;
    v_new_balance NUMERIC;
    v_order_id UUID;
    v_idempotency_check UUID;
    v_transaction_id UUID;
    v_audit_log_id UUID;
    v_duplicate_transaction_id UUID;
BEGIN
    IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id AND NOT is_admin() THEN
        RETURN QUERY SELECT FALSE, 'Unauthorized caller', NULL::UUID, 0::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;

    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_idempotency_check 
        FROM orders 
        WHERE idempotency_key = p_idempotency_key 
        LIMIT 1;
        
        IF v_idempotency_check IS NOT NULL THEN
            RETURN QUERY SELECT FALSE, 'Duplicate order (idempotency key)', v_idempotency_check, 0::NUMERIC, 0::NUMERIC;
            RETURN;
        END IF;
    END IF;

    SELECT balance INTO v_user_balance
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF v_user_balance IS NULL THEN
        RETURN QUERY SELECT FALSE, 'User profile not found', NULL::UUID, NULL::NUMERIC, NULL::NUMERIC;
        RETURN;
    END IF;

    IF v_user_balance < p_total_cost THEN
        RETURN QUERY SELECT FALSE, 'Insufficient balance', NULL::UUID, v_user_balance, v_user_balance;
        RETURN;
    END IF;

    v_new_balance := v_user_balance - p_total_cost;

    UPDATE profiles
    SET balance = v_new_balance
    WHERE id = p_user_id;

    INSERT INTO orders (
        user_id,
        service_id,
        promotion_package_id,
        link,
        quantity,
        total_cost,
        status,
        smmgen_order_id,
        smmcost_order_id,
        jbsmmpanel_order_id,
        worldofsmm_order_id,
        g1618_order_id,
        oldsmm_order_id,
        comments,
        idempotency_key,
        created_at,
        updated_at
    ) VALUES (
        p_user_id,
        p_service_id,
        p_package_id,
        p_link,
        p_quantity,
        p_total_cost,
        'pending',
        p_smmgen_order_id,
        p_smmcost_order_id,
        p_jbsmmpanel_order_id,
        p_worldofsmm_order_id,
        p_g1618_order_id,
        p_oldsmm_order_id,
        p_comments,
        p_idempotency_key,
        NOW(),
        NOW()
    )
    RETURNING id INTO v_order_id;

    INSERT INTO transactions (
        user_id,
        type,
        amount,
        status,
        description,
        order_id,
        created_at,
        updated_at
    ) VALUES (
        p_user_id,
        'order',
        -p_total_cost,
        'approved',
        CASE 
            WHEN p_service_id IS NOT NULL THEN 'Order for service ' || p_service_id
            ELSE 'Order for package ' || p_package_id
        END,
        v_order_id,
        NOW(),
        NOW()
    ) RETURNING id INTO v_transaction_id;

    SELECT id INTO v_audit_log_id
    FROM balance_audit_log
    WHERE user_id = p_user_id
      AND change_amount = -p_total_cost
      AND transaction_id IS NULL
      AND created_at BETWEEN NOW() - INTERVAL '5 seconds' AND NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_audit_log_id IS NOT NULL THEN
        UPDATE balance_audit_log
        SET transaction_id = v_transaction_id
        WHERE id = v_audit_log_id;
    END IF;

    SELECT id INTO v_duplicate_transaction_id
    FROM transactions
    WHERE user_id = p_user_id
      AND type = 'manual_adjustment'
      AND status = 'approved'
      AND ABS(amount - p_total_cost) < 0.01
      AND created_at BETWEEN NOW() - INTERVAL '10 seconds' AND NOW()
      AND id != v_transaction_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_duplicate_transaction_id IS NOT NULL THEN
        UPDATE balance_audit_log
        SET transaction_id = v_transaction_id
        WHERE transaction_id = v_duplicate_transaction_id;

        DELETE FROM transactions
        WHERE id = v_duplicate_transaction_id;
    END IF;

    RETURN QUERY SELECT TRUE, 'Order placed successfully', v_order_id, v_user_balance, v_new_balance;

EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT FALSE, 'Database error: ' || SQLERRM, NULL::UUID, v_user_balance, v_user_balance;
END;
$$;

-- 6. Revoke dangerous unauthenticated privileges
REVOKE EXECUTE ON FUNCTION public.process_automatic_refund FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.sync_smmgen_service FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_stats FROM anon;
REVOKE EXECUTE ON FUNCTION public.place_combo_order_atomic FROM anon;

-- 7. Set support-attachments bucket to private
UPDATE storage.buckets SET public = false WHERE id = 'support-attachments';
