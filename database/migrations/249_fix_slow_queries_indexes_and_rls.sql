-- Migration 249: Fix Slow Queries, Add Foreign Key Indexes, and Optimize RLS Policies
-- Applied to Supabase database project on 2026-07-24

-- 1. Optimize is_admin() function to be STABLE SQL so Postgres caches it per query context
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = (SELECT auth.uid()) 
      AND role IN ('admin'::user_role, 'super_admin'::user_role)
  );
$$;

-- 2. Add Missing Foreign Key Indexes (Eliminates full table scans during joins and cascades)
CREATE INDEX IF NOT EXISTS idx_orders_provider_id ON public.orders(provider_id);
CREATE INDEX IF NOT EXISTS idx_orders_service_id ON public.orders(service_id);
CREATE INDEX IF NOT EXISTS idx_tickets_order_id ON public.tickets(order_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_sender_id ON public.ticket_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_transactions_approved_by ON public.transactions(approved_by);
CREATE INDEX IF NOT EXISTS idx_referral_transactions_user_id ON public.referral_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_promotion_services_promotion_id ON public.promotion_services(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_services_service_id ON public.promotion_services(service_id);

-- Additional indexes for slow query filtering and sorting
CREATE INDEX IF NOT EXISTS idx_payment_methods_is_active_display ON public.payment_methods(is_active, display_name);
CREATE INDEX IF NOT EXISTS idx_transactions_type_created_desc ON public.transactions(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_user_created_desc ON public.tickets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_created ON public.ticket_messages(ticket_id, created_at ASC);

-- 3. Fix payment_methods RLS policies (Removes per-row profile subquery during public SELECTs)
DROP POLICY IF EXISTS "Admins can manage payment methods" ON public.payment_methods;
DROP POLICY IF EXISTS "Anyone can view active payment methods" ON public.payment_methods;

CREATE POLICY "Anyone can view active payment methods" 
ON public.payment_methods FOR SELECT 
TO public 
USING (is_active = true OR public.is_admin());

CREATE POLICY "Admins can insert payment methods" 
ON public.payment_methods FOR INSERT 
TO public 
WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update payment methods" 
ON public.payment_methods FOR UPDATE 
TO public 
USING (public.is_admin());

CREATE POLICY "Admins can delete payment methods" 
ON public.payment_methods FOR DELETE 
TO public 
USING (public.is_admin());

-- 4. Optimize RLS policies on bonuses, promotions, promotion_services, tutorials to use is_admin()
-- Bonuses
DROP POLICY IF EXISTS "Admins can manage bonuses" ON public.bonuses;
CREATE POLICY "Admins can insert bonuses" ON public.bonuses FOR INSERT TO public WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update bonuses" ON public.bonuses FOR UPDATE TO public USING (public.is_admin());
CREATE POLICY "Admins can delete bonuses" ON public.bonuses FOR DELETE TO public USING (public.is_admin());

-- Promotions
DROP POLICY IF EXISTS "Admins have full access to promotions" ON public.promotions;
CREATE POLICY "Admins can insert promotions" ON public.promotions FOR INSERT TO public WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update promotions" ON public.promotions FOR UPDATE TO public USING (public.is_admin());
CREATE POLICY "Admins can delete promotions" ON public.promotions FOR DELETE TO public USING (public.is_admin());

-- Promotion Services
DROP POLICY IF EXISTS "Admins have full access to promotion services" ON public.promotion_services;
CREATE POLICY "Admins can insert promotion services" ON public.promotion_services FOR INSERT TO public WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update promotion services" ON public.promotion_services FOR UPDATE TO public USING (public.is_admin());
CREATE POLICY "Admins can delete promotion services" ON public.promotion_services FOR DELETE TO public USING (public.is_admin());

-- Tutorials
DROP POLICY IF EXISTS "Admins have full access to tutorials" ON public.tutorials;
CREATE POLICY "Admins can insert tutorials" ON public.tutorials FOR INSERT TO public WITH CHECK (public.is_admin());
CREATE POLICY "Admins can update tutorials" ON public.tutorials FOR UPDATE TO public USING (public.is_admin());
CREATE POLICY "Admins can delete tutorials" ON public.tutorials FOR DELETE TO public USING (public.is_admin());

-- 5. Fix scalar subqueries in RLS policies for auth.uid()
-- Profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO public USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO public USING ((SELECT auth.uid()) = id);

-- Wallets
DROP POLICY IF EXISTS "Users can view own wallet" ON public.wallets;
CREATE POLICY "Users can view own wallet" ON public.wallets FOR SELECT TO public USING ((SELECT auth.uid()) = user_id);

-- Transactions
DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
CREATE POLICY "Users can view own transactions" ON public.transactions FOR SELECT TO public USING ((SELECT auth.uid()) = user_id);

-- Orders
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
CREATE POLICY "Users can view own orders" ON public.orders FOR SELECT TO public USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create own orders" ON public.orders;
CREATE POLICY "Users can create own orders" ON public.orders FOR INSERT TO public WITH CHECK ((SELECT auth.uid()) = user_id);

-- Referral Wallets & Transactions
DROP POLICY IF EXISTS "Users can view own referral wallet" ON public.referral_wallets;
CREATE POLICY "Users can view own referral wallet" ON public.referral_wallets FOR SELECT TO public USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own referral transactions" ON public.referral_transactions;
CREATE POLICY "Users can view own referral transactions" ON public.referral_transactions FOR SELECT TO public USING ((SELECT auth.uid()) = user_id);

-- Referrals
DROP POLICY IF EXISTS "Referrers can view their referrals" ON public.referrals;
CREATE POLICY "Referrers can view their referrals" ON public.referrals FOR SELECT TO public USING ((SELECT auth.uid()) = referrer_id);

-- bonus_claims
DROP POLICY IF EXISTS "Users can view own claims" ON public.bonus_claims;
CREATE POLICY "Users can view own claims" ON public.bonus_claims FOR SELECT TO public USING ((SELECT auth.uid()) = user_id);

-- order_status_logs
DROP POLICY IF EXISTS "Users can view own order logs" ON public.order_status_logs;
CREATE POLICY "Users can view own order logs" ON public.order_status_logs FOR SELECT TO public USING (
  EXISTS (
    SELECT 1 FROM public.orders 
    WHERE orders.id = order_status_logs.order_id 
      AND orders.user_id = (SELECT auth.uid())
  )
);

-- tickets
DROP POLICY IF EXISTS "Users can view own tickets" ON public.tickets;
CREATE POLICY "Users can view own tickets" ON public.tickets FOR SELECT TO public USING (
  (SELECT auth.uid()) = user_id OR public.is_admin()
);

DROP POLICY IF EXISTS "Users can create own tickets" ON public.tickets;
CREATE POLICY "Users can create own tickets" ON public.tickets FOR INSERT TO public WITH CHECK (
  (SELECT auth.uid()) = user_id
);

DROP POLICY IF EXISTS "Admins/Support can update tickets" ON public.tickets;
CREATE POLICY "Admins/Support can update tickets" ON public.tickets FOR UPDATE TO public USING (
  public.is_admin()
);

-- ticket_messages
DROP POLICY IF EXISTS "Users can view messages for own tickets" ON public.ticket_messages;
CREATE POLICY "Users can view messages for own tickets" ON public.ticket_messages FOR SELECT TO public USING (
  EXISTS (
    SELECT 1 FROM public.tickets 
    WHERE tickets.id = ticket_messages.ticket_id 
      AND (tickets.user_id = (SELECT auth.uid()) OR public.is_admin())
  )
);

DROP POLICY IF EXISTS "Users can insert messages into own tickets" ON public.ticket_messages;
CREATE POLICY "Users can insert messages into own tickets" ON public.ticket_messages FOR INSERT TO public WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tickets 
    WHERE tickets.id = ticket_messages.ticket_id 
      AND (tickets.user_id = (SELECT auth.uid()) OR public.is_admin())
  )
);
