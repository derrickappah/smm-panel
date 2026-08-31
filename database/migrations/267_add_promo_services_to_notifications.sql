-- 267_add_promo_services_to_notifications.sql
-- Allow service notifications to target promotion packages (promo services) in addition to regular services

-- 1. Add promotion_package_id column to service_notifications
ALTER TABLE public.service_notifications
ADD COLUMN IF NOT EXISTS promotion_package_id UUID REFERENCES public.promotion_packages(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_service_notifications_promotion_package_id 
ON public.service_notifications(promotion_package_id);

-- 2. Drop existing get_pending_service_notifications function to update return table signature
DROP FUNCTION IF EXISTS public.get_pending_service_notifications(uuid);

-- 3. Recreate get_pending_service_notifications to support promo services
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
        o.id as order_id,
        -- Priority matching OrderHistory.jsx: G1618 > World of SMM > SMMCost > JB SMM Panel > SMMGen
        COALESCE(
            NULLIF(o.g1618_order_id, 'order not placed at g1618'),
            NULLIF(o.worldofsmm_order_id, 'order not placed at worldofsmm'),
            NULLIF(o.smmcost_order_id, 'order not placed at smmcost'),
            NULLIF(o.jbsmmpanel_order_id::text, '0'),
            NULLIF(NULLIF(o.smmgen_order_id, 'order not placed at smm gen'), o.id),
            o.id
        ) as provider_order_id,
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
    JOIN public.orders o ON (
        (sn.service_id IS NOT NULL AND o.service_id = sn.service_id)
        OR
        (sn.promotion_package_id IS NOT NULL AND o.promotion_package_id = sn.promotion_package_id)
    )
    LEFT JOIN public.service_notification_acknowledgments sna 
        ON sna.notification_id = sn.id 
        AND sna.order_id = o.id 
        AND sna.user_id = p_user_id
    WHERE sn.is_active = true
      AND o.user_id = p_user_id
      AND sna.id IS NULL
    ORDER BY sn.created_at DESC, o.created_at DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_pending_service_notifications(UUID) TO authenticated, service_role;
