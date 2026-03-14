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
    initialInterval = 5000,   // Start with 5 seconds
    baseInterval = 15000,    // Move to 15 seconds after initial phase
    longInterval = 30000,    // Move to 30 seconds for long-running checks
    maxDuration = 180000,    // 3 minutes
    maxAttempts = 30,
    onStatusChange
  } = options;

  const intervalRef = useRef(null);
  const currentIntervalRef = useRef(initialInterval);
  const attemptsRef = useRef(0);
  const startTimeRef = useRef(null);
  const isPollingRef = useRef(false);
  const isTabVisibleRef = useRef(true);
  const processedTransactionIdsRef = useRef(new Set());
  const [isPollingState, setIsPollingState] = useState(false);

  /**
   * Check transaction status via lightweight API endpoint
   */
  const checkTransactionStatus = useCallback(async (transactionId) => {
    try {
      // Get the current session for authentication
      const { data: { session } } = await supabase.auth.getSession();

      const headers = {
        'Content-Type': 'application/json'
      };

      // Add authorization header if session exists
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(`/api/check-transaction-status?transactionId=${transactionId}`, {
        method: 'GET',
        headers
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
        // ... (rest of approved logic remains same)
        if (onStatusChange) {
          onStatusChange('approved');
        }
        
        if (!processedTransactionIdsRef.current.has(transactionId)) {
          processedTransactionIdsRef.current.add(transactionId);
          const success = await verifyBalanceForTransaction({
            id: transactionId,
            amount: statusData.amount || pendingTransaction.amount
          });
          setPendingTransaction(null);
          stopPolling();
          if (!success) {
            onUpdateUser();
          }
        } else {
          setPendingTransaction(null);
          stopPolling();
        }
      } else if (statusData.status === 'rejected' || statusData.status === 'failed') {
        if (onStatusChange) {
          onStatusChange(statusData.status);
        }
        setPendingTransaction(null);
        stopPolling();
        toast.error('Payment was not successful. Please try again.');
      } else {
        // Still pending - adjust interval based on time elapsed
        const elapsed = Date.now() - startTimeRef.current;
        let nextInterval = initialInterval;
        
        if (elapsed > 120000) { // > 2 minutes
          nextInterval = longInterval;
        } else if (elapsed > 30000) { // > 30 seconds
          nextInterval = baseInterval;
        }

        if (nextInterval !== currentIntervalRef.current) {
          console.log(`Adjusting polling interval to ${nextInterval}ms`);
          currentIntervalRef.current = nextInterval;
          resetInterval(nextInterval);
        }
        
        console.log(`Transaction still pending (attempt ${attemptsRef.current}/${maxAttempts})`);
      }
    } catch (error) {
      console.error('Error polling transaction:', error);
      if (attemptsRef.current > 10 && attemptsRef.current % 5 === 0) {
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

  const resetInterval = useCallback((newInterval) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (isPollingRef.current && isTabVisibleRef.current) {
      intervalRef.current = setInterval(() => {
        pollTransaction();
      }, newInterval);
    }
  }, [pollTransaction]);

  /**
   * Start polling
   */
  const startPolling = useCallback(() => {
    if (!pendingTransaction || !pendingTransaction.id) {
      return;
    }

    if (processedTransactionIdsRef.current.has(pendingTransaction.id)) {
      return;
    }

    if (isPollingRef.current) {
      stopPolling();
    }

    console.log('Starting deposit polling for transaction:', pendingTransaction.id);
    
    isPollingRef.current = true;
    setIsPollingState(true);
    attemptsRef.current = 0;
    startTimeRef.current = Date.now();
    currentIntervalRef.current = initialInterval;

    pollTransaction();

    if (isTabVisibleRef.current) {
      intervalRef.current = setInterval(() => {
        pollTransaction();
      }, initialInterval);
    }
  }, [pendingTransaction, pollTransaction, initialInterval, stopPolling]);

  /**
   * Effect to start/stop polling based on pending transaction
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === 'visible';
      isTabVisibleRef.current = isVisible;
      
      if (isVisible && isPollingRef.current && !intervalRef.current) {
        console.log('Tab visible, resuming polling');
        pollTransaction();
        intervalRef.current = setInterval(() => {
          pollTransaction();
        }, currentIntervalRef.current);
      } else if (!isVisible && intervalRef.current) {
        console.log('Tab hidden, pausing polling');
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (pendingTransaction && pendingTransaction.id) {
      startPolling();
    } else {
      stopPolling();
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopPolling();
    };
  }, [pendingTransaction?.id, startPolling, stopPolling, pollTransaction]);

  return {
    isPolling: isPollingState,
    stopPolling
  };
}
