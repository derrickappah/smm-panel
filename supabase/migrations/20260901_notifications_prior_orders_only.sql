-- 20260901_notifications_prior_orders_only.sql
-- Ensure service notifications are only delivered to users who placed orders BEFORE the notification was created

-- 1. Update get_pending_service_notifications RPC
DROP FUNCTION IF EXISTS public.get_pending_service_notifications(uuid);

CREATE OR REPLACE FUNCTION public.get_pending_service_notifications(p_user_id uuid)
 RETURNS TABLE(
    notification_id uuid,
    order_id text,
    provider_order_id text,
    service_id uuid,
    promotion_package_id uuid,
    message text,
    title text,
    subtitle text,
    show_order_id boolean,
    instructions_title text,
    instructions_steps jsonb,
    show_instructions boolean,
    video_url text,
    show_video boolean,
    image_url text,
    created_at timestamp with time zone
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Verify caller owns the user_id or is an administrator
    IF auth.uid() IS NULL OR (auth.uid() != p_user_id AND NOT public.is_admin()) THEN
        RAISE EXCEPTION 'Unauthorized: Access to service notifications denied.';
    END IF;

    RETURN QUERY
    SELECT 
        sn.id as notification_id,
        latest_order.id as order_id,
        latest_order.provider_order_id,
        sn.service_id,
        sn.promotion_package_id,
        sn.message,
        sn.title,
        sn.subtitle,
        sn.show_order_id,
        sn.instructions_title,
        sn.instructions_steps,
        sn.show_instructions,
        sn.video_url,
        sn.show_video,
        sn.image_url,
        sn.created_at
    FROM public.service_notifications sn
    CROSS JOIN LATERAL (
        SELECT 
            o.id,
            COALESCE(
                NULLIF(o.g1618_order_id, 'order not placed at g1618'),
                NULLIF(o.worldofsmm_order_id, 'order not placed at worldofsmm'),
                NULLIF(o.smmcost_order_id, 'order not placed at smmcost'),
                NULLIF(o.jbsmmpanel_order_id::text, '0'),
                NULLIF(NULLIF(o.smmgen_order_id, 'order not placed at smm gen'), o.id),
                o.id
            ) as provider_order_id
        FROM public.orders o
        WHERE o.user_id = p_user_id
          AND o.created_at <= sn.created_at
          AND (
            (sn.service_id IS NOT NULL AND o.service_id = sn.service_id)
            OR
            (sn.promotion_package_id IS NOT NULL AND o.promotion_package_id = sn.promotion_package_id)
          )
        ORDER BY o.created_at DESC
        LIMIT 1
    ) latest_order
    WHERE sn.is_active = true
      AND NOT EXISTS (
        SELECT 1 
        FROM public.service_notification_acknowledgments sna 
        WHERE sna.notification_id = sn.id 
          AND sna.user_id = p_user_id
      )
    ORDER BY sn.created_at DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_pending_service_notifications(UUID) TO authenticated, service_role;
