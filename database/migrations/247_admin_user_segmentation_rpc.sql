-- Database Migration: Admin User Segmentation RPCs
-- This script creates the RPC functions for retrieving user segmentation stats and paginated lists.

-- 1. Function to retrieve summary counts and 14-day signup trend for the user segments
CREATE OR REPLACE FUNCTION public.get_admin_user_segmentation_stats()
RETURNS JSON
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
  v_segments JSON;
  v_trend JSON;
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required.';
  END IF;

  -- 1. Aggregate segment counts
  WITH user_metrics AS (
    SELECT 
      p.id,
      COALESCE(d.approved_deposits_count, 0) as approved_deposits_count,
      COALESCE(o.total_orders_count, 0) as total_orders_count,
      (
        SELECT al.created_at 
        FROM public.activity_logs al 
        WHERE al.user_id = p.id
        ORDER BY al.created_at DESC
        LIMIT 1
      ) as last_active
    FROM public.profiles p
    LEFT JOIN (
      SELECT 
        user_id, 
        COUNT(id) as approved_deposits_count
      FROM public.transactions 
      WHERE type = 'deposit' AND status = 'approved'
      GROUP BY user_id
    ) d ON d.user_id = p.id
    LEFT JOIN (
      SELECT 
        user_id, 
        COUNT(id) as total_orders_count
      FROM public.orders
      GROUP BY user_id
    ) o ON o.user_id = p.id
  )
  SELECT json_build_object(
    'total_users', COUNT(*),
    'deposited_and_used', COUNT(*) FILTER (WHERE approved_deposits_count > 0 AND total_orders_count > 0),
    'deposited_unused', COUNT(*) FILTER (WHERE approved_deposits_count > 0 AND total_orders_count = 0),
    'never_deposited_or_ordered', COUNT(*) FILTER (WHERE approved_deposits_count = 0 AND total_orders_count = 0),
    'browsers', COUNT(*) FILTER (WHERE approved_deposits_count = 0 AND last_active >= NOW() - INTERVAL '30 days'),
    'frequent_buyers', COUNT(*) FILTER (WHERE total_orders_count >= 10)
  ) INTO v_segments
  FROM user_metrics;

  -- 2. Aggregate 14-day signup trend
  SELECT json_agg(t) INTO v_trend FROM (
    SELECT 
      to_char(d.day, 'Mon DD') as date,
      COUNT(p.id) as count
    FROM (
      SELECT generate_series(
        current_date - interval '13 days', 
        current_date, 
        '1 day'::interval
      )::date as day
    ) d
    LEFT JOIN public.profiles p ON p.created_at::date = d.day
    GROUP BY d.day
    ORDER BY d.day
  ) t;

  -- 3. Combine into a single result
  v_result := json_build_object(
    'counts', v_segments,
    'trend', v_trend
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 2. Function to retrieve paginated, sorted, and filtered users for a specific segment
CREATE OR REPLACE FUNCTION public.get_users_by_segment(
  p_segment TEXT,
  p_search TEXT DEFAULT '',
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0,
  p_sort_field TEXT DEFAULT 'created_at',
  p_sort_order TEXT DEFAULT 'desc'
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT,
  phone_number TEXT,
  role TEXT,
  balance NUMERIC,
  created_at TIMESTAMPTZ,
  approved_deposits_count BIGINT,
  total_orders_count BIGINT,
  total_spend NUMERIC,
  last_active TIMESTAMPTZ,
  total_count BIGINT
) 
SECURITY DEFINER
AS $$
BEGIN
  -- Verify caller is admin (use table alias p to avoid variable name collision with returns table)
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required.';
  END IF;

  RETURN QUERY
  WITH user_metrics AS (
    SELECT 
      prof.id as u_id,
      prof.name as u_name,
      prof.email as u_email,
      prof.phone_number as u_phone,
      prof.role as u_role,
      prof.balance::NUMERIC as u_balance,
      prof.created_at as u_created_at,
      COALESCE(d.approved_deposits_count, 0) as u_approved_deposits_count,
      COALESCE(o.total_orders_count, 0) as u_total_orders_count,
      COALESCE(o.total_spend, 0)::NUMERIC as u_total_spend,
      (
        SELECT al.created_at 
        FROM public.activity_logs al 
        WHERE al.user_id = prof.id
        ORDER BY al.created_at DESC
        LIMIT 1
      ) as u_last_active
    FROM public.profiles prof
    LEFT JOIN (
      SELECT 
        tx.user_id, 
        COUNT(*) as approved_deposits_count
      FROM public.transactions tx
      WHERE tx.type = 'deposit' AND tx.status = 'approved'
      GROUP BY tx.user_id
    ) d ON d.user_id = prof.id
    LEFT JOIN (
      SELECT 
        ord.user_id, 
        COUNT(*) as total_orders_count,
        SUM(ord.total_cost) as total_spend
      FROM public.orders ord
      GROUP BY ord.user_id
    ) o ON o.user_id = prof.id
  ),
  filtered_metrics AS (
    SELECT * FROM user_metrics
    WHERE 
      -- Apply search
      (
        p_search = '' 
        OR u_name ILIKE '%' || p_search || '%' 
        OR u_email ILIKE '%' || p_search || '%' 
        OR u_phone ILIKE '%' || p_search || '%'
      )
      -- Apply segment filtering
      AND (
        (p_segment = 'deposited_and_used' AND u_approved_deposits_count > 0 AND u_total_orders_count > 0)
        OR (p_segment = 'deposited_unused' AND u_approved_deposits_count > 0 AND u_total_orders_count = 0)
        OR (p_segment = 'never_deposited_or_ordered' AND u_approved_deposits_count = 0 AND u_total_orders_count = 0)
        OR (p_segment = 'browsers' AND u_approved_deposits_count = 0 AND u_last_active >= NOW() - INTERVAL '30 days')
        OR (p_segment = 'frequent_buyers' AND u_total_orders_count >= 10)
        OR (p_segment = 'all')
      )
  ),
  total_count_cte AS (
    SELECT COUNT(*) as t_count FROM filtered_metrics
  )
  SELECT 
    fm.u_id as id,
    fm.u_name as name,
    fm.u_email as email,
    fm.u_phone as phone_number,
    fm.u_role as role,
    fm.u_balance as balance,
    fm.u_created_at as created_at,
    fm.u_approved_deposits_count as approved_deposits_count,
    fm.u_total_orders_count as total_orders_count,
    fm.u_total_spend as total_spend,
    fm.u_last_active as last_active,
    tc.t_count as total_count
  FROM filtered_metrics fm
  CROSS JOIN total_count_cte tc
  ORDER BY 
    CASE WHEN p_sort_field = 'name' AND p_sort_order = 'asc' THEN fm.u_name END ASC,
    CASE WHEN p_sort_field = 'name' AND p_sort_order = 'desc' THEN fm.u_name END DESC,
    CASE WHEN p_sort_field = 'email' AND p_sort_order = 'asc' THEN fm.u_email END ASC,
    CASE WHEN p_sort_field = 'email' AND p_sort_order = 'desc' THEN fm.u_email END DESC,
    CASE WHEN p_sort_field = 'balance' AND p_sort_order = 'asc' THEN fm.u_balance END ASC,
    CASE WHEN p_sort_field = 'balance' AND p_sort_order = 'desc' THEN fm.u_balance END DESC,
    CASE WHEN p_sort_field = 'total_spend' AND p_sort_order = 'asc' THEN fm.u_total_spend END ASC,
    CASE WHEN p_sort_field = 'total_spend' AND p_sort_order = 'desc' THEN fm.u_total_spend END DESC,
    CASE WHEN p_sort_field = 'last_active' AND p_sort_order = 'asc' THEN fm.u_last_active END ASC NULLS FIRST,
    CASE WHEN p_sort_field = 'last_active' AND p_sort_order = 'desc' THEN fm.u_last_active END DESC NULLS LAST,
    CASE WHEN p_sort_field = 'created_at' AND p_sort_order = 'asc' THEN fm.u_created_at END ASC,
    CASE WHEN p_sort_field = 'created_at' AND p_sort_order = 'desc' THEN fm.u_created_at END DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;
