-- Fix the sync_smmgen_order_id trigger to not overwrite existing SMMGen IDs
-- Run this in Supabase SQL Editor

-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS sync_smmgen_order_id_trigger ON orders;
DROP FUNCTION IF EXISTS sync_smmgen_order_id();

-- Create a new function that only syncs if smmgen_order_id is NULL
CREATE OR REPLACE FUNCTION sync_smmgen_order_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set smmgen_order_id to id if it's NULL
  -- This allows SMMGen order IDs to be preserved
  IF NEW.smmgen_order_id IS NULL THEN
    NEW.smmgen_order_id = NEW.id::text;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER sync_smmgen_order_id_trigger
BEFORE INSERT OR UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION sync_smmgen_order_id();

-- Add comment
COMMENT ON FUNCTION sync_smmgen_order_id() IS 'Syncs smmgen_order_id with id only if smmgen_order_id is NULL, preserving SMMGen order IDs';

