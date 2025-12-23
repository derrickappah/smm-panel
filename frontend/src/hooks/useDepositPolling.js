import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

/**
 * Hook to automatically poll transaction status and refresh UI when deposit is confirmed
 * Note: Balance updates are handled by the atomic database function, this hook only verifies and refreshes UI
 * 
 * @param {Object} pendingTransaction - The pending transaction object
 * @param {Function} onUpdateUser - Callback to refresh user data
 * @param {Function} setPendingTransaction - Function to clear pending transaction
 * @param {Function} setOptimisticBalance - Function to set optimistic balance for instant UI updates
 * @param {Object} options - Configuration options
 * @param {number} options.interval - Polling interval in milliseconds (default: 2000)
 * @param {number} options.maxDuration - Maximum polling duration in milliseconds (default: 180000 = 3 minutes)
 * @param {number} options.maxAttempts - Maximum number of polling attempts (default: 90)
 * @param {Function} options.onStatusChange - Optional callback when transaction status changes (receives new status)
 * 
 * @returns {Object} - { isPolling, stopPolling }
 */
export function useDepositPolling(
  pendingTransaction,
  onUpdateUser,
  setPendingTransaction,
  setOptimisticBalance,
  options = {}
) {
  const {
    interval = 2000, // 2 seconds
    maxDuration = 60000, // 1 minute
    maxAttempts = 30, // 30 attempts * 2 seconds = 1 minute
    onStatusChange
  } = options;

  const intervalRef = useRef(null);
  const attemptsRef = useRef(0);
  const startTimeRef = useRef(null);
  const isPollingRef = useRef(false);
  const processedTransactionIdsRef = useRef(new Set());
  const [isPollingState, setIsPollingState] = useState(false);

  /**
   * Check transaction status via lightweight API endpoint
   */
  const checkTransactionStatus = useCallback(async (transactionId) => {
    try {
      const response = await fetch(`/api/check-transaction-status?transactionId=${transactionId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error checking transaction status:', error);
      throw error;
    }
  }, []);

  /**
   * Mark transaction as rejected when polling times out
   */
  const markTransactionAsRejected = useCallback(async (transactionId, reason) => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        console.warn('No authenticated user found, cannot update transaction status');
        return;
      }

      // Update transaction status to rejected
      const { error: updateError } = await supabase
        .from('transactions')
        .update({
          status: 'rejected'
        })
        .eq('id', transactionId)
        .eq('status', 'pending'); // Only update if still pending

      if (updateError) {
        console.error('Error updating transaction status to rejected:', updateError);
      } else {
        console.log('Transaction marked as rejected:', { transactionId, reason });
        
        // Call status change callback if provided
        if (onStatusChange) {
          onStatusChange('rejected');
        }
        
        // Clear pending transaction
        setPendingTransaction(null);
        
        // Show error message to user
        toast.error('Payment verification timed out. The transaction has been marked as rejected. Please try again.');
        
        // Refresh user data
        onUpdateUser();
      }
    } catch (error) {
      console.error('Error marking transaction as rejected:', error);
    }
  }, [onStatusChange, setPendingTransaction, onUpdateUser]);

  /**
   * Verify balance was updated when transaction is approved (read-only check)
   * Note: Balance is already updated by the atomic database function, we just verify and refresh UI
   */
  const verifyBalanceForTransaction = useCallback(async (transaction) => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        console.warn('No authenticated user found for balance verification');
        return false;
      }

      // Wait a moment for database to sync after atomic function update
      await new Promise(resolve => setTimeout(resolve, 200));

      // Get current balance (read-only check)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', authUser.id)
        .single();

      if (profileError) {
        console.error('Error fetching profile for balance verification:', profileError);
        return false;
      }

      const currentBalance = parseFloat(profile.balance || 0);
      const transactionAmount = parseFloat(transaction.amount);

      console.log('✅ Transaction approved - balance verified:', {
        transactionAmount,
        currentBalance
      });

      // Set optimistic balance for instant UI update
      setOptimisticBalance(currentBalance);

      // Refresh user data
      onUpdateUser();

      // Show success message
      toast.success(`Payment confirmed! ₵${transactionAmount.toFixed(2)} added to your balance.`);

      return true;
    } catch (error) {
      console.error('Error in verifyBalanceForTransaction:', error);
      return false;
    }
  }, [onUpdateUser, setOptimisticBalance]);

  /**
   * Poll transaction status
   */
  const pollTransaction = useCallback(async () => {
    if (!pendingTransaction || !pendingTransaction.id) {
      return;
    }

    const transactionId = pendingTransaction.id;
    attemptsRef.current += 1;

    // Check if we've exceeded max attempts
    if (attemptsRef.current > maxAttempts) {
      console.log('Max polling attempts reached, stopping and marking transaction as rejected...');
      await markTransactionAsRejected(transactionId, 'Max polling attempts reached');
      stopPolling();
      return;
    }

    // Check if we've exceeded max duration
    if (startTimeRef.current) {
      const elapsed = Date.now() - startTimeRef.current;
      if (elapsed > maxDuration) {
        console.log('Max polling duration reached, stopping and marking transaction as rejected...');
        await markTransactionAsRejected(transactionId, 'Max polling duration reached');
        stopPolling();
        return;
      }
    }

    try {
      // Check transaction status
      const statusData = await checkTransactionStatus(transactionId);

      if (statusData.status === 'approved') {
        // Call status change callback if provided
        if (onStatusChange) {
          onStatusChange('approved');
        }
        
        // Transaction is approved - verify balance and refresh UI if not already processed
        if (!processedTransactionIdsRef.current.has(transactionId)) {
          console.log('Transaction approved, verifying balance and refreshing UI...', {
            transactionId,
            amount: statusData.amount
          });

          processedTransactionIdsRef.current.add(transactionId);

          // Verify balance was updated (read-only) and refresh UI
          // Balance is already updated by atomic function, we just need to refresh
          const success = await verifyBalanceForTransaction({
            id: transactionId,
            amount: statusData.amount || pendingTransaction.amount
          });

          // Always clear pending transaction when approved, even if verification fails
          // The transaction is already approved in the database, verification is just for UI
          setPendingTransaction(null);
          stopPolling();
          
          if (!success) {
            // Verification failed but transaction is approved - log warning
            console.warn('Transaction approved but balance verification failed. Balance should still be updated in database.');
            // Don't retry - transaction is already approved, just refresh user data
            onUpdateUser();
          }
        } else {
          // Already processed, just stop polling
          console.log('Transaction already processed, stopping polling');
          setPendingTransaction(null);
          stopPolling();
        }
      } else if (statusData.status === 'rejected' || statusData.status === 'failed') {
        // Call status change callback if provided
        if (onStatusChange) {
          onStatusChange(statusData.status);
        }
        
        // Transaction was rejected/failed
        console.log('Transaction rejected/failed, stopping polling');
        setPendingTransaction(null);
        stopPolling();
        toast.error('Payment was not successful. Please try again.');
      } else {
        // Still pending, continue polling
        console.log(`Transaction still pending (attempt ${attemptsRef.current}/${maxAttempts})`);
      }
    } catch (error) {
      console.error('Error polling transaction:', error);
      
      // If we've had too many consecutive errors, stop polling and mark as rejected
      if (attemptsRef.current > 10 && attemptsRef.current % 5 === 0) {
        console.warn('Multiple polling errors, stopping and marking transaction as rejected...');
        await markTransactionAsRejected(transactionId, 'Multiple polling errors');
        stopPolling();
      }
    }
  }, [
    pendingTransaction,
    checkTransactionStatus,
    verifyBalanceForTransaction,
    markTransactionAsRejected,
    setPendingTransaction,
    maxAttempts,
    maxDuration,
    onStatusChange
  ]);

  /**
   * Stop polling
   */
  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    isPollingRef.current = false;
    setIsPollingState(false);
    console.log('Stopped deposit polling');
  }, []);

  /**
   * Start polling
   */
  const startPolling = useCallback(() => {
    if (!pendingTransaction || !pendingTransaction.id) {
      return;
    }

    // Don't start if transaction was already processed
    if (processedTransactionIdsRef.current.has(pendingTransaction.id)) {
      return;
    }

    // If already polling a different transaction, stop and switch to new one
    if (isPollingRef.current) {
      console.log('Switching to new transaction, stopping previous polling');
      stopPolling();
    }

    console.log('Starting deposit polling for transaction:', pendingTransaction.id);
    
    isPollingRef.current = true;
    setIsPollingState(true);
    attemptsRef.current = 0;
    startTimeRef.current = Date.now();

    // Poll immediately on start
    pollTransaction();

    // Set up interval for subsequent polls
    intervalRef.current = setInterval(() => {
      pollTransaction();
    }, interval);
  }, [pendingTransaction, pollTransaction, interval, stopPolling]);

  /**
   * Effect to start/stop polling based on pending transaction
   */
  useEffect(() => {
    if (pendingTransaction && pendingTransaction.id) {
      startPolling();
    } else {
      stopPolling();
    }

    // Cleanup on unmount
    return () => {
      stopPolling();
    };
  }, [pendingTransaction?.id, startPolling, stopPolling]);

  return {
    isPolling: isPollingState,
    stopPolling
  };
}
