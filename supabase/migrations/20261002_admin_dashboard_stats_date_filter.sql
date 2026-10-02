-- Migration: 20261002_admin_dashboard_stats_date_filter.sql
-- Description: Enhances get_admin_dashboard_stats to respect date range for day-level metrics,
-- provides lifetime all_time_* totals, and filters recent orders/deposits to the selected day.

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
  v_target_start timestamptz;
  v_target_end timestamptz;
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

  v_target_start := COALESCE(p_date_range_start, v_today_start);
  v_target_end := COALESCE(p_date_range_end, v_today_end);

  SELECT json_build_object(
    -- Filtered counts for selected date/period
    'total_users', (SELECT COUNT(*) FROM profiles WHERE (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)),
    'users_today', (SELECT COUNT(*) FROM profiles WHERE created_at >= v_target_start AND created_at <= v_target_end),
    'total_orders', COALESCE((SELECT COUNT(*) FROM orders WHERE (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'orders_today', COALESCE((SELECT COUNT(*) FROM orders WHERE created_at >= v_target_start AND created_at <= v_target_end), 0),
    'completed_orders', COALESCE((SELECT COUNT(*) FROM orders WHERE status = 'completed' AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'processing_orders', COALESCE((SELECT COUNT(*) FROM orders WHERE status IN ('processing', 'in progress') AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'cancelled_orders', COALESCE((SELECT COUNT(*) FROM orders WHERE status IN ('canceled', 'cancelled') AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'refunded_orders', COALESCE((SELECT COUNT(*) FROM orders WHERE refund_status = 'succeeded' AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'failed_refunds', COALESCE((SELECT COUNT(*) FROM orders WHERE refund_status = 'failed' AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'total_revenue', COALESCE((SELECT SUM(total_cost) FROM orders WHERE status = 'completed' AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'revenue_today', COALESCE((SELECT SUM(total_cost) FROM orders WHERE status = 'completed' AND created_at >= v_target_start AND created_at <= v_target_end), 0),
    'pending_deposits', COALESCE((SELECT COUNT(*) FROM transactions WHERE type = 'deposit' AND status = 'pending' AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'confirmed_deposits', COALESCE((SELECT COUNT(*) FROM transactions WHERE type = 'deposit' AND status = 'approved' AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'rejected_deposits', COALESCE((SELECT COUNT(*) FROM transactions WHERE type = 'deposit' AND status = 'rejected' AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'total_deposits', COALESCE((SELECT SUM(amount) FROM transactions WHERE type = 'deposit' AND status = 'approved' AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'total_deposits_amount', COALESCE((SELECT SUM(amount) FROM transactions WHERE type = 'deposit' AND status = 'approved' AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'deposits_today', COALESCE((SELECT COUNT(*) FROM transactions WHERE type = 'deposit' AND created_at >= v_target_start AND created_at <= v_target_end), 0),
    'deposits_amount_today', COALESCE((SELECT SUM(amount) FROM transactions WHERE type = 'deposit' AND status = 'approved' AND created_at >= v_target_start AND created_at <= v_target_end), 0),
    'total_transactions', COALESCE((SELECT COUNT(*) FROM transactions WHERE type = 'deposit' AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'open_tickets', COALESCE((SELECT COUNT(*) FROM tickets WHERE status = 'Pending' AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'in_progress_tickets', 0,
    'resolved_tickets', 0,
    'total_services', COALESCE((SELECT COUNT(*) FROM services), 0),
    'average_order_value', COALESCE((SELECT AVG(total_cost) FROM orders WHERE status = 'completed' AND (p_date_range_start IS NULL OR created_at >= p_date_range_start) AND (p_date_range_end IS NULL OR created_at <= p_date_range_end)), 0),
    'failed_orders', 0,

    -- All-time global totals (for persistent context badges/sublabels)
    'all_time_users', (SELECT COUNT(*) FROM profiles),
    'all_time_orders', COALESCE((SELECT COUNT(*) FROM orders), 0),
    'all_time_revenue', COALESCE((SELECT SUM(total_cost) FROM orders WHERE status = 'completed'), 0),
    'all_time_deposits_amount', COALESCE((SELECT SUM(amount) FROM transactions WHERE type = 'deposit' AND status = 'approved'), 0),
    'all_time_confirmed_deposits', COALESCE((SELECT COUNT(*) FROM transactions WHERE type = 'deposit' AND status = 'approved'), 0),

    -- Recent orders within period (or latest 5 overall)
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
        WHERE (p_date_range_start IS NULL OR o.created_at >= p_date_range_start)
          AND (p_date_range_end IS NULL OR o.created_at <= p_date_range_end)
        ORDER BY o.created_at DESC LIMIT 5
      ) ro
    ), '[]'::json),

    -- Recent deposits within period (or latest 5 overall)
    'recent_deposits', COALESCE((
      SELECT json_agg(row_to_json(rd))
      FROM (
        SELECT t.id, t.amount, t.status, t.created_at, t.deposit_method,
               json_build_object('name', p.name, 'email', p.email) as profiles
        FROM transactions t
        LEFT JOIN profiles p ON t.user_id = p.id
        WHERE t.type = 'deposit'
          AND (p_date_range_start IS NULL OR t.created_at >= p_date_range_start)
          AND (p_date_range_end IS NULL OR t.created_at <= p_date_range_end)
        ORDER BY t.created_at DESC LIMIT 5
      ) rd
    ), '[]'::json),

    -- Top customers (or top customers in period if range passed)
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
          AND (p_date_range_start IS NULL OR t.created_at >= p_date_range_start)
          AND (p_date_range_end IS NULL OR t.created_at <= p_date_range_end)
        GROUP BY t.user_id, p.name, p.email
        ORDER BY "totalDeposits" DESC LIMIT 10
      ) tc
    ), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$$;

-- Grant execution to authenticated users (admin verification is enforced inside function)
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats(timestamp with time zone, timestamp with time zone) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_stats(timestamp with time zone, timestamp with time zone) FROM anon;
