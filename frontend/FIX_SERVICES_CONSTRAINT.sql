-- Fix Services Table Constraint
-- Run this to remove the restrictive service_type constraint

-- Drop the existing constraint if it exists
ALTER TABLE services DROP CONSTRAINT IF EXISTS services_service_type_check;

-- Verify constraint was removed
SELECT 
    constraint_name,
    constraint_type
FROM information_schema.table_constraints 
WHERE table_name = 'services' 
AND constraint_type = 'CHECK'
AND constraint_name LIKE '%service_type%';

-- If the above query returns no rows, the constraint has been removed successfully

