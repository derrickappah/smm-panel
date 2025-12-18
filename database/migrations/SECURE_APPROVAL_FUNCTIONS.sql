-- Secure Approval Functions
-- This migration revokes EXECUTE permissions from authenticated users
-- to prevent client-side balance manipulation.

-- Revoke from authenticated role
REVOKE EXECUTE ON FUNCTION approve_deposit_transaction(UUID, TEXT, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION approve_deposit_transaction_universal(UUID, TEXT, TEXT, TEXT) FROM authenticated;

-- Ensure service_role still has access
GRANT EXECUTE ON FUNCTION approve_deposit_transaction(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION approve_deposit_transaction_universal(UUID, TEXT, TEXT, TEXT) TO service_role;

-- Revoke from public as a safety measure
REVOKE EXECUTE ON FUNCTION approve_deposit_transaction(UUID, TEXT, TEXT) FROM public;
REVOKE EXECUTE ON FUNCTION approve_deposit_transaction_universal(UUID, TEXT, TEXT, TEXT) FROM public;

COMMENT ON FUNCTION approve_deposit_transaction IS 'Atomically approves a deposit transaction and updates user balance. Restricted to service_role for security.';
COMMENT ON FUNCTION approve_deposit_transaction_universal IS 'Atomically approves a deposit transaction and updates user balance for any payment method. Restricted to service_role for security.';
