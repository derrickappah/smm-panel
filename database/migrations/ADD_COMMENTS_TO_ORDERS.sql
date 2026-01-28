-- Add comments column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS comments TEXT;
