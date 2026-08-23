-- Migration: 20260817_security_hardening.sql
-- Description: Financial integrity CHECK constraints, RLS policy hardening, and storage bucket security

-- 1. Database Financial Integrity Constraints
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_balance_non_negative') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT chk_balance_non_negative CHECK (balance >= 0);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_cost_non_negative') THEN
    ALTER TABLE public.orders ADD CONSTRAINT chk_order_cost_non_negative CHECK (total_cost >= 0);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_quantity_positive') THEN
    ALTER TABLE public.orders ADD CONSTRAINT chk_order_quantity_positive CHECK (quantity > 0);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_deposit_amount_non_negative') THEN
    ALTER TABLE public.transactions ADD CONSTRAINT chk_deposit_amount_non_negative CHECK (type != 'deposit' OR amount >= 0);
  END IF;
END $$;

-- 2. Services RLS Lockdown (Remove permissive public write policies)
DROP POLICY IF EXISTS "Allow combo service mirror insert" ON public.services;
DROP POLICY IF EXISTS "Allow combo service mirror update" ON public.services;

-- 3. Combo Tables RLS Lockdown
DROP POLICY IF EXISTS "Admins manage combo_services" ON public.combo_services;
CREATE POLICY "rls_combo_services_admin" ON public.combo_services 
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins manage combo_service_items" ON public.combo_service_items;
CREATE POLICY "rls_combo_service_items_admin" ON public.combo_service_items 
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Manage combo parent orders" ON public.combo_parent_orders;
CREATE POLICY "rls_combo_parent_orders_admin" ON public.combo_parent_orders 
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Manage combo child orders" ON public.combo_child_orders;
CREATE POLICY "rls_combo_child_orders_admin" ON public.combo_child_orders 
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Manage combo logs" ON public.combo_logs;
CREATE POLICY "rls_combo_logs_admin" ON public.combo_logs 
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- 4. Supabase Storage Hardening
UPDATE storage.buckets 
SET file_size_limit = 5242880, 
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'] 
WHERE id = 'support-attachments';

UPDATE storage.buckets 
SET file_size_limit = 10485760, 
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'video/mp4', 'video/webm'] 
WHERE id = 'storage';

DROP POLICY IF EXISTS "Authenticated users can upload support files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update support files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete support files" ON storage.objects;

-- 5. Profile Name Sanitization and 25-Character Limit Trigger
CREATE OR REPLACE FUNCTION public.sanitize_and_limit_profile_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.name IS NOT NULL THEN
    -- Strip any HTML tags
    NEW.name := regexp_replace(NEW.name, '<[^>]+>', '', 'g');
    -- Trim whitespace
    NEW.name := trim(NEW.name);
    -- Enforce max 25 characters
    IF char_length(NEW.name) > 25 THEN
      NEW.name := substring(NEW.name FROM 1 FOR 25);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitize_and_limit_profile_name ON public.profiles;
CREATE TRIGGER trg_sanitize_and_limit_profile_name
BEFORE INSERT OR UPDATE OF name ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sanitize_and_limit_profile_name();

