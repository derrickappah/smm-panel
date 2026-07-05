-- Migration: Add support for custom rates within combo service IDs
-- Updates existing simple string arrays in services table to JSONB objects: [{"id": "uuid", "combo_rate": null}]

UPDATE services
SET combo_service_ids = (
  SELECT jsonb_agg(
    CASE 
      WHEN jsonb_typeof(elem) = 'string' THEN jsonb_build_object('id', (elem#>>'{}'), 'combo_rate', null)
      ELSE elem
    END
  )
  FROM jsonb_array_elements(combo_service_ids) AS elem
)
WHERE is_combo = TRUE 
  AND combo_service_ids IS NOT NULL 
  AND jsonb_typeof(combo_service_ids) = 'array'
  AND EXISTS (
    SELECT 1 
    FROM jsonb_array_elements(combo_service_ids) AS elem 
    WHERE jsonb_typeof(elem) = 'string'
  );

COMMENT ON COLUMN services.combo_service_ids IS 'Array of promotion service details in the combo. Format: [{"id": "uuid1", "combo_rate": 1.50}, {"id": "uuid2", "combo_rate": null}]';
