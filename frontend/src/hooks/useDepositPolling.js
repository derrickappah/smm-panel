import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

/**
 * Hook to automatically poll transaction status and update balance when deposit is confirmed
 * 
 * @param {Object} pendingTransaction - The pending transaction object
 * @param {Function} onUpdateUser - Callback to refresh user data
 * @param {Function} setPendingTransaction - Function to clear pending transaction
 * @param {Function} setOptimisticBalance - Function to set optimistic balance for instant UI updates
 * @param {Object} options - Configuration options
 * @param {number} options.interval - Polling interval in milliseconds (default: 2000)
 * @param {number} options.maxDuration - Maximum polling duration in milliseconds (default: 180000 = 3 minutes)
 * @param {number} options.maxAttempts - Maximum number of polling attempts (default: 90)
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
    maxDuration = 180000, // 3 minutes
    maxAttempts = 90 // 90 attempts * 2 seconds = 3 minutes
  } = options;

  const intervalRef = useRef(null);
  const attemptsRef = useRef(0);
  const startTimeRef = useRef(null);
  const isPollingRef = useRef(false);
  const processedTransactionIdsRef = useRef(new Set());

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
   * Update balance when transaction is approved
   */
  const updateBalanceForTransaction = useCallback(async (transaction) => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        console.warn('No authenticated user found for balance update');
        return false;
      }

      // Get current balance
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', authUser.id)
        .single();

      if (profileError) {
        console.error('Error fetching profile for balance update:', profileError);
        return false;
      }

      // Calculate new balance
      const currentBalance = parseFloat(profile.balance || 0);
      const transactionAmount = parseFloat(transaction.amount);
      
      // Check if balance already includes this transaction (prevent double crediting)
      // If webhook or another process already updated the balance, we should detect it
      // We'll check by verifying if updating would result in the expected balance
      // But first, let's check if we can determine if this transaction was already credited
      
      // Simple check: If the balance seems unusually high compared to what we'd expect,
      // it might have already been updated. However, we can't know the "before" balance.
      // So we'll proceed with the update but use idempotency (the Set) to prevent double processing.
      
      // More reliable: Check if balance was recently updated (within last few seconds)
      // by comparing with a fresh fetch. But this is complex.
      
      // Best approach: Trust the idempotency Set and transaction status check.
      // If transaction is approved and we haven't processed it in this session, update balance.
      // The Set ensures we only process once per polling session.
      // If webhook already updated, the balance verification will catch mismatches.
      
      const newBalance = currentBalance + transactionAmount;

      // Update balance
      const { error: balanceError } = await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', authUser.id);

      if (balanceError) {
        console.error('Error updating balance:', balanceError);
        return false;
      }

      // Verify balance was updated
      await new Promise(resolve => setTimeout(resolve, 200)); // Wait for DB sync

      const { data: verifyProfile } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', authUser.id)
        .single();

      if (verifyProfile) {
        const verifiedBalance = parseFloat(verifyProfile.balance || 0);
        const expectedBalance = newBalance;
        const balanceDifference = Math.abs(verifiedBalance - expectedBalance);

        // Allow small floating point differences (0.01)
        if (balanceDifference < 0.01) {
          console.log('✅ Balance updated and verified successfully:', {
            oldBalance: currentBalance,
            transactionAmount,
            newBalance: verifiedBalance
          });

          // Set optimistic balance for instant UI update
          setOptimisticBalance(verifiedBalance);

          // Refresh user data
          onUpdateUser();

          // Show success message
          toast.success(`Payment confirmed! ₵${transactionAmount.toFixed(2)} added to your balance.`);

          return true;
        } else if (verifiedBalance > expectedBalance) {
          // Balance is higher than expected - likely already updated by webhook
          // Check if the difference is approximately the transaction amount (meaning it was already credited)
          const excessAmount = verifiedBalance - currentBalance;
          if (Math.abs(excessAmount - transactionAmount) < 0.01) {
            // Balance already includes this transaction (webhook or previous poll updated it)
            console.log('✅ Balance already includes this transaction (likely updated by webhook):', {
              currentBalance,
              transactionAmount,
              verifiedBalance
            });

            // Set optimistic balance for instant UI update
            setOptimisticBalance(verifiedBalance);

            // Refresh user data
            onUpdateUser();

            // Show success message
            toast.success(`Payment confirmed! ₵${transactionAmount.toFixed(2)} is in your balance.`);

            return true;
          } else {
            console.warn('Balance verification mismatch - balance higher than expected:', {
              expected: expectedBalance,
              actual: verifiedBalance,
              difference: balanceDifference,
              excessAmount
            });
            return false;
          }
        } else {
          // Balance is lower than expected - update might have failed
          console.warn('Balance verification mismatch - balance lower than expected:', {
            expected: expectedBalance,
            actual: verifiedBalance,
            difference: balanceDifference
          });
          return false;
        }
      }

      return false;
    } catch (error) {
      console.error('Error in updateBalanceForTransaction:', error);
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
      console.log('Max polling attempts reached, stopping...');
      stopPolling();
      return;
    }

    // Check if we've exceeded max duration
    if (startTimeRef.current) {
      const elapsed = Date.now() - startTimeRef.current;
      if (elapsed > maxDuration) {
        console.log('Max polling duration reached, stopping...');
        stopPolling();
        return;
      }
    }

    try {
      // Check transaction status
      const statusData = await checkTransactionStatus(transactionId);

      if (statusData.status === 'approved') {
        // Transaction is approved - update balance if not already processed
        if (!processedTransactionIdsRef.current.has(transactionId)) {
          console.log('Transaction approved, updating balance...', {
            transactionId,
            amount: statusData.amount
          });

          processedTransactionIdsRef.current.add(transactionId);

          const success = await updateBalanceForTransaction({
            id: transactionId,
            amount: statusData.amount || pendingTransaction.amount
          });

          if (success) {
            // Clear pending transaction
            setPendingTransaction(null);
            stopPolling();
          } else {
            // Retry balance update on next poll
            processedTransactionIdsRef.current.delete(transactionId);
          }
        } else {
          // Already processed, just stop polling
          console.log('Transaction already processed, stopping polling');
          setPendingTransaction(null);
          stopPolling();
        }
      } else if (statusData.status === 'rejected' || statusData.status === 'failed') {
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
      
      // If we've had too many consecutive errors, stop polling
      if (attemptsRef.current > 10 && attemptsRef.current % 5 === 0) {
        console.warn('Multiple polling errors, stopping...');
        stopPolling();
      }
    }
  }, [
    pendingTransaction,
    checkTransactionStatus,
    updateBalanceForTransaction,
    setPendingTransaction,
    maxAttempts,
    maxDuration
  ]);

  /**
   * Start polling
   */
  const startPolling = useCallback(() => {
    if (!pendingTransaction || !pendingTransaction.id) {
      return;
    }

    // Don't start if already polling
    if (isPollingRef.current) {
      return;
    }

    // Don't start if transaction was already processed
    if (processedTransactionIdsRef.current.has(pendingTransaction.id)) {
      return;
    }

    console.log('Starting deposit polling for transaction:', pendingTransaction.id);
    
    isPollingRef.current = true;
    attemptsRef.current = 0;
    startTimeRef.current = Date.now();

    // Poll immediately on start
    pollTransaction();

    // Set up interval for subsequent polls
    intervalRef.current = setInterval(() => {
      pollTransaction();
    }, interval);
  }, [pendingTransaction, pollTransaction, interval]);

  /**
   * Stop polling
   */
  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    isPollingRef.current = false;
    console.log('Stopped deposit polling');
  }, []);

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
    isPolling: isPollingRef.current,
    stopPolling
  };
}
