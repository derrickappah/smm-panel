-- Sync Services from SMMGen API to Database
-- This is a helper script - actual syncing should be done via the application
-- Run this to prepare the services table for SMMGen integration

-- Add smmgen_service_id column if it doesn't exist (for tracking SMMGen service IDs)
ALTER TABLE services 
ADD COLUMN IF NOT EXISTS smmgen_service_id TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_services_smmgen_id ON services(smmgen_service_id);
CREATE INDEX IF NOT EXISTS idx_services_platform ON services(platform);

-- Function to sync a service from SMMGen (example - adjust based on SMMGen API response format)
-- This is a template - actual implementation should be done in the application
CREATE OR REPLACE FUNCTION sync_smmgen_service(
    p_smmgen_id TEXT,
    p_platform TEXT,
    p_service_type TEXT,
    p_name TEXT,
    p_rate DECIMAL,
    p_min_quantity INTEGER,
    p_max_quantity INTEGER,
    p_description TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_service_id UUID;
BEGIN
    -- Check if service already exists
    SELECT id INTO v_service_id
    FROM services
    WHERE smmgen_service_id = p_smmgen_id;
    
    IF v_service_id IS NOT NULL THEN
        -- Update existing service
        UPDATE services
        SET 
            platform = p_platform,
            service_type = p_service_type,
            name = p_name,
            rate = p_rate,
            min_quantity = p_min_quantity,
            max_quantity = p_max_quantity,
            description = COALESCE(p_description, description)
        WHERE id = v_service_id;
        
        RETURN v_service_id;
    ELSE
        -- Insert new service
        INSERT INTO services (
            smmgen_service_id,
            platform,
            service_type,
            name,
            rate,
            min_quantity,
            max_quantity,
            description
        ) VALUES (
            p_smmgen_id,
            p_platform,
            p_service_type,
            p_name,
            p_rate,
            p_min_quantity,
            p_max_quantity,
            p_description
        ) RETURNING id INTO v_service_id;
        
        RETURN v_service_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Example usage (commented out - uncomment and adjust values):
-- SELECT sync_smmgen_service(
--     '12345',  -- SMMGen service ID
--     'instagram',  -- platform
--     'followers',  -- service type
--     'Instagram Followers',  -- name
--     2.50,  -- rate per 1000
--     100,  -- min quantity
--     100000,  -- max quantity
--     'High quality Instagram followers'  -- description
-- );

-- View services with SMMGen IDs
SELECT 
    id,
    smmgen_service_id,
    platform,
    name,
    rate,
    min_quantity,
    max_quantity,
    CASE 
        WHEN smmgen_service_id IS NOT NULL THEN '✅ Synced with SMMGen'
        ELSE '⚠️ Local only'
    END as sync_status
FROM services
ORDER BY platform, name;

