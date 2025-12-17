-- Balance Audit Logging Trigger
-- This migration creates a table and trigger to log all balance changes for auditing and debugging
-- Helps track duplicate balance credits and other balance-related issues

-- Create balance_audit_log table
CREATE TABLE IF NOT EXISTS balance_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  old_balance NUMERIC NOT NULL,
  new_balance NUMERIC NOT NULL,
  change_amount NUMERIC NOT NULL,
  change_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_balance_audit_user_id ON balance_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_balance_audit_transaction_id ON balance_audit_log(transaction_id);
CREATE INDEX IF NOT EXISTS idx_balance_audit_created_at ON balance_audit_log(created_at);

-- Create function to log balance changes
CREATE OR REPLACE FUNCTION log_balance_change() 
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if balance actually changed
  IF OLD.balance IS DISTINCT FROM NEW.balance THEN
    INSERT INTO balance_audit_log (
      user_id,
      old_balance,
      new_balance,
      change_amount,
      change_reason,
      created_at
    )
    VALUES (
      NEW.id,
      COALESCE(OLD.balance, 0),
      COALESCE(NEW.balance, 0),
      COALESCE(NEW.balance, 0) - COALESCE(OLD.balance, 0),
      'Balance update via ' || current_setting('application_name', true) || ' trigger',
      NOW()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to log balance changes
DROP TRIGGER IF EXISTS balance_change_trigger ON profiles;
CREATE TRIGGER balance_change_trigger
  AFTER UPDATE OF balance ON profiles
  FOR EACH ROW
  WHEN (OLD.balance IS DISTINCT FROM NEW.balance)
  EXECUTE FUNCTION log_balance_change();

-- Add comments for documentation
COMMENT ON TABLE balance_audit_log IS 'Audit log of all balance changes for debugging and tracking duplicate credits';
COMMENT ON COLUMN balance_audit_log.user_id IS 'User whose balance was changed';
COMMENT ON COLUMN balance_audit_log.transaction_id IS 'Transaction that triggered the balance change (if applicable)';
COMMENT ON COLUMN balance_audit_log.old_balance IS 'Balance before the change';
COMMENT ON COLUMN balance_audit_log.new_balance IS 'Balance after the change';
COMMENT ON COLUMN balance_audit_log.change_amount IS 'Amount of change (new_balance - old_balance)';
COMMENT ON COLUMN balance_audit_log.change_reason IS 'Reason for the balance change';
COMMENT ON FUNCTION log_balance_change IS 'Trigger function that logs all balance changes to balance_audit_log table';

-- Optional: Create a view to easily query duplicate balance credits
CREATE OR REPLACE VIEW duplicate_balance_changes AS
SELECT 
  user_id,
  transaction_id,
  COUNT(*) as change_count,
  SUM(change_amount) as total_change,
  MIN(created_at) as first_change,
  MAX(created_at) as last_change,
  array_agg(id ORDER BY created_at) as audit_log_ids
FROM balance_audit_log
WHERE transaction_id IS NOT NULL
GROUP BY user_id, transaction_id
HAVING COUNT(*) > 1
ORDER BY last_change DESC;

COMMENT ON VIEW duplicate_balance_changes IS 'View showing transactions that had multiple balance changes (potential duplicates)';

