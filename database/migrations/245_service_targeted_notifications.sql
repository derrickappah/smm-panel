-- 245_service_targeted_notifications.sql
-- Forced Notification System for Targeted Services

-- 1. Create service_notifications table
CREATE TABLE IF NOT EXISTS public.service_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id UUID REFERENCES public.services(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create acknowledgments table
CREATE TABLE IF NOT EXISTS public.service_notification_acknowledgments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE, -- MUST BE TEXT because orders.id is TEXT
    notification_id UUID REFERENCES public.service_notifications(id) ON DELETE CASCADE,
    acknowledged_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, order_id, notification_id)
);

-- 3. Enable RLS
ALTER TABLE public.service_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_notification_acknowledgments ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- service_notifications: Public read for active ones, full access for service_role
CREATE POLICY "Allow public read for active notifications" 
ON public.service_notifications FOR SELECT 
USING (is_active = true);

CREATE POLICY "Allow service_role full access to notifications" 
ON public.service_notifications FOR ALL 
TO service_role 
USING (true);

-- acknowledgments: Users can read/insert their own, service_role full access
CREATE POLICY "Users can manage their own acknowledgments" 
ON public.service_notification_acknowledgments FOR ALL 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Allow service_role full access to acknowledgments" 
ON public.service_notification_acknowledgments FOR ALL 
TO service_role 
USING (true);

-- 5. RPC to get pending notifications for a user
-- This returns notifications for services the user has purchased but not acknowledged yet
CREATE OR REPLACE FUNCTION public.get_pending_service_notifications(p_user_id UUID)
RETURNS TABLE (
    notification_id UUID,
    order_id TEXT, -- MUST BE TEXT
    service_id UUID,
    message TEXT,
    image_url TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sn.id as notification_id,
        o.id as order_id,
        sn.service_id,
        sn.message,
        sn.image_url,
        sn.created_at
    FROM public.service_notifications sn
    JOIN public.orders o ON o.service_id = sn.service_id
    LEFT JOIN public.service_notification_acknowledgments sna 
        ON sna.notification_id = sn.id 
        AND sna.order_id = o.id 
        AND sna.user_id = p_user_id
    WHERE sn.is_active = true
      AND o.user_id = p_user_id
      AND sna.id IS NULL -- Only those NOT acknowledged
    ORDER BY sn.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_pending_service_notifications(UUID) TO authenticated, service_role;
