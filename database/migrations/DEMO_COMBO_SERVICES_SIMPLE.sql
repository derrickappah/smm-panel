-- Simple Demo: Create Instagram Views + Likes Combo Service
-- This is a ready-to-run example that creates a combo service
-- Prerequisites: 
--   1. Run ADD_COMBO_SERVICES.sql first
--   2. Have at least one Instagram Views and one Instagram Likes service in your database

-- Step 1: Check if you have the required services
-- Run this first to see available Instagram services:
SELECT id, name, platform, service_type, rate 
FROM services 
WHERE platform = 'instagram' 
  AND service_type IN ('views', 'likes')
ORDER BY service_type;

-- Step 2: Create the combo service
-- This will automatically find the first Instagram Views and Likes services
-- and create a combo service that combines them

DO $$
DECLARE
  views_service_id UUID;
  likes_service_id UUID;
  combo_exists BOOLEAN;
BEGIN
  -- Get the first Instagram Views service
  SELECT id INTO views_service_id
  FROM services
  WHERE platform = 'instagram' AND service_type = 'views'
  LIMIT 1;
  
  -- Get the first Instagram Likes service
  SELECT id INTO likes_service_id
  FROM services
  WHERE platform = 'instagram' AND service_type = 'likes'
  LIMIT 1;
  
  -- Check if combo already exists
  SELECT EXISTS(
    SELECT 1 FROM services 
    WHERE name = 'Instagram Views + Likes Combo'
  ) INTO combo_exists;
  
  -- Only create if services exist and combo doesn't exist
  IF views_service_id IS NOT NULL AND likes_service_id IS NOT NULL AND NOT combo_exists THEN
    INSERT INTO services (
      platform, 
      service_type, 
      name, 
      rate, 
      min_quantity, 
      max_quantity, 
      description, 
      is_combo, 
      combo_service_ids,
      combo_smmgen_service_ids
    ) VALUES (
      'instagram',
      'combo',
      'Instagram Views + Likes Combo',
      2.30, -- Combined rate (example: 0.50 + 1.80)
      1000, -- Min quantity (use max of component mins)
      50000, -- Max quantity (use min of component maxes)
      'Get both views and likes for your Instagram post in one convenient order',
      TRUE,
      jsonb_build_array(views_service_id, likes_service_id),
      jsonb_build_array('', '') -- Replace with actual SMMGen IDs if you have them
    );
    
    RAISE NOTICE 'Combo service created successfully!';
    RAISE NOTICE 'Views Service ID: %', views_service_id;
    RAISE NOTICE 'Likes Service ID: %', likes_service_id;
  ELSIF combo_exists THEN
    RAISE NOTICE 'Combo service already exists. Skipping creation.';
  ELSE
    RAISE NOTICE 'Error: Could not find Instagram Views and/or Likes services.';
    RAISE NOTICE 'Please create these services first using POPULATE_SERVICES.sql';
  END IF;
END $$;

-- Step 3: Verify the combo service was created
SELECT 
  id,
  name,
  platform,
  service_type,
  rate,
  is_combo,
  combo_service_ids,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'rate', s.rate,
      'platform', s.platform
    ))
    FROM services s
    WHERE s.id = ANY(
      SELECT jsonb_array_elements_text(combo_service_ids)::uuid
    )
  ) as component_services
FROM services
WHERE is_combo = TRUE
ORDER BY created_at DESC;

-- Step 4: View detailed combo information
SELECT 
  cs.id as combo_id,
  cs.name as combo_name,
  cs.rate as combo_rate,
  cs.description as combo_description,
  jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'platform', s.platform,
      'service_type', s.service_type,
      'rate', s.rate,
      'min_quantity', s.min_quantity,
      'max_quantity', s.max_quantity
    ) ORDER BY s.service_type
  ) as components
FROM services cs
CROSS JOIN LATERAL jsonb_array_elements_text(cs.combo_service_ids) AS service_id
JOIN services s ON s.id = service_id::uuid
WHERE cs.is_combo = TRUE
GROUP BY cs.id, cs.name, cs.rate, cs.description
ORDER BY cs.name;

-- Expected Result:
-- When a user orders "Instagram Views + Likes Combo":
-- - They enter one link and one quantity
-- - System creates 2 separate orders:
--   1. Instagram Video Views order (for the views component)
--   2. Instagram Likes order (for the likes component)
-- - Total cost = sum of both component rates
-- - If SMMGen IDs are configured, 2 separate SMMGen orders are placed

