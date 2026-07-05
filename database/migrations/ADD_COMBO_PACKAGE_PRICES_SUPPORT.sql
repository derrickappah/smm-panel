-- Migration: Add support for custom pricing within combo package IDs
-- Updates existing simple string arrays to JSONB objects: [{"id": "uuid", "combo_price": null}]

UPDATE promotion_packages
SET combo_package_ids = (
  SELECT jsonb_agg(
    CASE 
      WHEN jsonb_typeof(elem) = 'string' THEN jsonb_build_object('id', (elem#>>'{}'), 'combo_price', null)
      ELSE elem
    END
  )
  FROM jsonb_array_elements(combo_package_ids) AS elem
)
WHERE is_combo = TRUE 
  AND combo_package_ids IS NOT NULL 
  AND jsonb_typeof(combo_package_ids) = 'array'
  AND EXISTS (
    SELECT 1 
    FROM jsonb_array_elements(combo_package_ids) AS elem 
    WHERE jsonb_typeof(elem) = 'string'
  );

COMMENT ON COLUMN promotion_packages.combo_package_ids IS 'Array of promotion package details in the combo. Format: [{"id": "uuid1", "combo_price": 20.00}, {"id": "uuid2", "combo_price": null}]';
