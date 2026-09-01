-- Migration: Fix combo parent order status calculation logic
-- Ensures parent orders with all canceled or failed child orders are marked 'canceled'/'failed' rather than 'partial'

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
    v_pending_children INTEGER;
    v_new_status TEXT;
BEGIN
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'completed'),
        COUNT(*) FILTER (WHERE status IN ('processing', 'in progress')),
        COUNT(*) FILTER (WHERE status = 'failed'),
        COUNT(*) FILTER (WHERE status IN ('canceled', 'cancelled', 'refunded')),
        COUNT(*) FILTER (WHERE status = 'pending')
    INTO 
        v_total_children,
        v_completed_children,
        v_processing_children,
        v_failed_children,
        v_canceled_children,
        v_pending_children
    FROM combo_child_orders
    WHERE parent_order_id = p_parent_order_id;

    IF v_total_children = 0 THEN
        v_new_status := 'pending';
    ELSIF v_completed_children = v_total_children THEN
        v_new_status := 'completed';
    ELSIF v_canceled_children = v_total_children THEN
        v_new_status := 'canceled';
    ELSIF (v_failed_children + v_canceled_children) = v_total_children THEN
        v_new_status := 'canceled';
    ELSIF v_pending_children = v_total_children THEN
        v_new_status := 'pending';
    ELSIF (v_completed_children > 0 AND (v_failed_children > 0 OR v_canceled_children > 0)) THEN
        -- Only 'partial' when at least one child is completed and at least one is canceled/failed
        v_new_status := 'partial';
    ELSIF (v_processing_children > 0 OR v_completed_children > 0) THEN
        v_new_status := 'processing';
    ELSIF (v_failed_children > 0 OR v_canceled_children > 0) THEN
        IF v_pending_children > 0 OR v_processing_children > 0 THEN
            v_new_status := 'processing';
        ELSE
            v_new_status := 'canceled';
        END IF;
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

-- Recalculate existing combo parent orders in case any are out of sync
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM combo_parent_orders LOOP
        PERFORM update_combo_parent_order_status(r.id);
    END LOOP;
END $$;
