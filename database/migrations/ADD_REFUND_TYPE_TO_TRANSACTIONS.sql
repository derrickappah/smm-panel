-- Add 'refund' as a valid transaction type
-- Run this in Supabase SQL Editor

-- Drop the existing check constraint
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;

-- Add the new check constraint with 'refund' included
ALTER TABLE transactions 
ADD CONSTRAINT transactions_type_check 
CHECK (type IN ('deposit', 'order', 'refund'));

-- Add comment for documentation
COMMENT ON COLUMN transactions.type IS 'Transaction type: deposit (money added), order (money spent), refund (money returned)';

