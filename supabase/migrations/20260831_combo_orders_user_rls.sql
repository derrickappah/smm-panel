-- Migration: Enable authenticated users to view their own combo parent and child orders
-- This allows customers to view and monitor all sub-orders inside their combo purchases

ALTER TABLE IF EXISTS public.combo_parent_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.combo_child_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own combo parent orders" ON public.combo_parent_orders;
CREATE POLICY "Users can view own combo parent orders" ON public.combo_parent_orders
    FOR SELECT TO authenticated
    USING (
        auth.uid() = user_id 
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    );

DROP POLICY IF EXISTS "Users can view own combo child orders" ON public.combo_child_orders;
CREATE POLICY "Users can view own combo child orders" ON public.combo_child_orders
    FOR SELECT TO authenticated
    USING (
        parent_order_id IN (SELECT id FROM public.combo_parent_orders WHERE user_id = auth.uid())
        OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    );
