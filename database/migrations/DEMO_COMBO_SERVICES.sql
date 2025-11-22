-- Demo: Creating Combo Services
-- This script demonstrates how to create combo services that combine multiple services
-- Run ADD_COMBO_SERVICES.sql first, then run this demo

-- Step 1: First, create or identify the individual services you want to combine
-- For this demo, we'll assume you have Instagram Views and Instagram Likes services
-- If you don't have these, create them first:

-- Example: Create individual services (if they don't exist)
-- INSERT INTO services (platform, service_type, name, rate, min_quantity, max_quantity, description, smmgen_service_id)
-- VALUES
-- ('instagram', 'views', 'Instagram Video Views', 0.50, 1000, 1000000, 'Fast Instagram video views', '12345'),
-- ('instagram', 'likes', 'Instagram Likes', 1.80, 50, 50000, 'Real Instagram likes', '67890')
-- ON CONFLICT DO NOTHING;

-- Step 2: Get the IDs of the services you want to combine
-- Run this query to see your available services:
-- SELECT id, name, platform, service_type, rate FROM services WHERE platform = 'instagram' AND service_type IN ('views', 'likes');

-- Step 3: Create a combo service
-- Replace the UUIDs below with actual service IDs from your database
-- Replace the SMMGen IDs with actual SMMGen service IDs

-- Example: Instagram Views + Likes Combo
-- This creates a combo service that combines views and likes
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
) 
SELECT 
  'instagram',
  'combo',
  'Instagram Views + Likes Combo',
  2.30, -- Combined rate (views: 0.50 + likes: 1.80 = 2.30)
  1000, -- Min quantity (use the maximum of component services' min_quantity)
  50000, -- Max quantity (use the minimum of component services' max_quantity)
  'Get both views and likes for your Instagram post in one order',
  TRUE,
  jsonb_build_array(
    (SELECT id FROM services WHERE platform = 'instagram' AND service_type = 'views' LIMIT 1),
    (SELECT id FROM services WHERE platform = 'instagram' AND service_type = 'likes' LIMIT 1)
  ),
  jsonb_build_array('12345', '67890') -- Replace with actual SMMGen service IDs
WHERE NOT EXISTS (
  SELECT 1 FROM services WHERE name = 'Instagram Views + Likes Combo'
);

-- Alternative: If you know the exact service IDs, use this format:
-- combo_service_ids: '["uuid-of-views-service", "uuid-of-likes-service"]'::jsonb
-- combo_smmgen_service_ids: '["smmgen-views-id", "smmgen-likes-id"]'::jsonb

-- Step 4: Verify the combo service was created
SELECT 
  id,
  name,
  platform,
  service_type,
  rate,
  is_combo,
  combo_service_ids,
  combo_smmgen_service_ids,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'rate', s.rate
    ))
    FROM services s
    WHERE s.id = ANY(
      SELECT jsonb_array_elements_text(combo_service_ids)::uuid
    )
  ) as component_services
FROM services
WHERE is_combo = TRUE;

-- Step 5: View all combo services with their component details
SELECT 
  cs.id as combo_id,
  cs.name as combo_name,
  cs.rate as combo_rate,
  cs.combo_service_ids,
  cs.combo_smmgen_service_ids,
  jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'platform', s.platform,
      'service_type', s.service_type,
      'rate', s.rate,
      'smmgen_id', s.smmgen_service_id
    )
  ) as components
FROM services cs
CROSS JOIN LATERAL jsonb_array_elements_text(cs.combo_service_ids) AS service_id
JOIN services s ON s.id = service_id::uuid
WHERE cs.is_combo = TRUE
GROUP BY cs.id, cs.name, cs.rate, cs.combo_service_ids, cs.combo_smmgen_service_ids;

-- Example Output:
-- When a user orders this combo service:
-- 1. User selects "Instagram Views + Likes Combo"
-- 2. Enters link: https://instagram.com/p/ABC123
-- 3. Enters quantity: 1000
-- 4. System creates 2 orders:
--    - Order 1: Instagram Video Views (1000 views, cost: ₵0.50)
--    - Order 2: Instagram Likes (1000 likes, cost: ₵1.80)
-- 5. Total cost: ₵2.30
-- 6. If SMMGen IDs are configured, 2 separate SMMGen orders are placed

-- Notes:
-- - The combo_service_ids array must contain valid UUIDs that exist in the services table
-- - The combo_smmgen_service_ids array should have the same number of elements as combo_service_ids
-- - The order of IDs in both arrays should match (first service ID = first SMMGen ID)
-- - The rate should be the sum of all component service rates
-- - Min/Max quantities should be set based on the component services' limits

