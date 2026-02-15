-- Migration: Add provider service ID columns to promotion_packages
-- This ensures promotion_packages has the same provider linking capabilities as the services table.

-- 1. Add columns if they don't exist
ALTER TABLE promotion_packages ADD COLUMN IF NOT EXISTS smmcost_service_id TEXT;
ALTER TABLE promotion_packages ADD COLUMN IF NOT EXISTS jbsmmpanel_service_id INTEGER;
ALTER TABLE promotion_packages ADD COLUMN IF NOT EXISTS worldofsmm_service_id TEXT;
ALTER TABLE promotion_packages ADD COLUMN IF NOT EXISTS g1618_service_id TEXT;

-- 2. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_promotion_packages_smmcost_id ON promotion_packages(smmcost_service_id);
CREATE INDEX IF NOT EXISTS idx_promotion_packages_jbsmmpanel_id ON promotion_packages(jbsmmpanel_service_id);
CREATE INDEX IF NOT EXISTS idx_promotion_packages_worldofsmm_id ON promotion_packages(worldofsmm_service_id);
CREATE INDEX IF NOT EXISTS idx_promotion_packages_g1618_id ON promotion_packages(g1618_service_id);

-- 3. Add comments
COMMENT ON COLUMN promotion_packages.smmcost_service_id IS 'Service ID from SMMCost API.';
COMMENT ON COLUMN promotion_packages.jbsmmpanel_service_id IS 'Service ID from JB SMM Panel API.';
COMMENT ON COLUMN promotion_packages.worldofsmm_service_id IS 'Service ID from World of SMM API.';
COMMENT ON COLUMN promotion_packages.g1618_service_id IS 'Service ID from G1618 API.';
