import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { placeSMMGenOrder } from '@/lib/smmgen';
import { saveOrderStatusHistory } from '@/lib/orderStatusHistory';
import { normalizePhoneNumber } from '@/utils/phoneUtils';
import Navbar from '@/components/Navbar';
import SEO from '@/components/SEO';
import ReferralSection from '@/components/ReferralSection';
import DashboardStats from '@/components/dashboard/DashboardStats';
import DashboardDeposit from '@/components/dashboard/DashboardDeposit';
import DashboardOrderForm from '@/components/dashboard/DashboardOrderForm';
import DashboardOrders from '@/components/dashboard/DashboardOrders';
import DashboardPromotionPackages from '@/components/dashboard/DashboardPromotionPackages';
import { useDashboardData } from '@/hooks/useDashboardData';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { usePromotionPackages } from '@/hooks/useAdminPromotionPackages';
import { useDepositPolling } from '@/hooks/useDepositPolling';
// Paystack will be loaded via react-paystack package

const Dashboard = ({ user, onLogout, onUpdateUser }) => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Use custom hooks
  const { services, recentOrders, fetchServices, fetchRecentOrders } = useDashboardData();
  const { data: promotionPackages = [] } = usePromotionPackages();
  const { 
    depositMethod, 
    setDepositMethod, 
    paymentMethodSettings, 
    minDepositSettings,
    manualDepositDetails
  } = usePaymentMethods();
  const [depositAmount, setDepositAmount] = useState('');
  const [moolrePhoneNumber, setMoolrePhoneNumber] = useState('');
  const [moolreChannel, setMoolreChannel] = useState('13'); // Default to MTN (13)
  const [moolreOtpCode, setMoolreOtpCode] = useState('');
  const [moolreRequiresOtp, setMoolreRequiresOtp] = useState(false);
  const [moolreOtpTransaction, setMoolreOtpTransaction] = useState(null);
  const [moolreOtpVerifying, setMoolreOtpVerifying] = useState(false);
  const [moolreOtpVerified, setMoolreOtpVerified] = useState(false);
  const [moolreOtpError, setMoolreOtpError] = useState(null);
  const [moolrePaymentStatus, setMoolrePaymentStatus] = useState(null); // 'waiting' | 'success' | 'failed' | null
  const [loading, setLoading] = useState(false);
  const [pendingTransaction, setPendingTransaction] = useState(null);
  const [orderForm, setOrderForm] = useState({
    service_id: '',
    package_id: '',
    link: '',
    quantity: ''
  });
  // Manual deposit states
  const [manualDepositForm, setManualDepositForm] = useState({
    amount: '',
    momo_number: '',
    payment_proof_file: null
  });
  const [uploadingProof, setUploadingProof] = useState(false);
  
  // Optimistic balance state for instant UI updates
  const [optimisticBalance, setOptimisticBalance] = useState(null);

  // Create merged user object that uses optimistic balance when available
  const displayUser = optimisticBalance !== null 
    ? { ...user, balance: optimisticBalance }
    : user;

  // Clear optimistic balance when user prop changes (after real data syncs)
  useEffect(() => {
    if (user && optimisticBalance !== null) {
      // Clear optimistic balance when real user data updates
      // This ensures we use real data once it's synced
      setOptimisticBalance(null);
    }
  }, [user?.balance, optimisticBalance]);

  // Automatic deposit polling - polls transaction status and updates balance automatically
  const [isPollingDeposit, setIsPollingDeposit] = useState(false);
  
  // Callback to update Moolre payment status based on polling results
  const handleMoolrePaymentStatusChange = useCallback((status) => {
    if (pendingTransaction?.deposit_method === 'moolre') {
      if (status === 'approved') {
        setMoolrePaymentStatus('success');
        // Auto-reset after 5 seconds
        setTimeout(() => {
          setMoolrePaymentStatus(null);
        }, 5000);
      } else if (status === 'rejected' || status === 'failed') {
        setMoolrePaymentStatus('failed');
      }
    }
  }, [pendingTransaction?.deposit_method]);
  
  const { isPolling, stopPolling } = useDepositPolling(
    pendingTransaction,
    onUpdateUser,
    setPendingTransaction,
    setOptimisticBalance,
    {
      interval: 2000, // Poll every 2 seconds
      maxDuration: 180000, // Max 3 minutes
      maxAttempts: 90, // 90 attempts
      onStatusChange: handleMoolrePaymentStatusChange
    }
  );

  // Update polling state for UI
  useEffect(() => {
    setIsPollingDeposit(isPolling);
  }, [isPolling]);

  // Paystack public key - should be in environment variable
  const paystackPublicKey = process.env.REACT_APP_PAYSTACK_PUBLIC_KEY || 'pk_test_xxxxxxxxxxxxx';
  
  // Korapay public key - should be in environment variable
  const korapayPublicKey = process.env.REACT_APP_KORAPAY_PUBLIC_KEY || '';

  // Verify pending payments that might have succeeded (complex version with balance updates)
  const verifyPendingPayments = useCallback(async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      // Find recent pending deposit transactions (within last 48 hours to catch old ones too)
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      
      const { data: pendingTransactions, error } = await supabase
        .from('transactions')
        .select('id, user_id, type, amount, status, deposit_method, paystack_reference, korapay_reference, created_at')
        .eq('user_id', authUser.id)
        .eq('type', 'deposit')
        .eq('status', 'pending')
        .gte('created_at', fortyEightHoursAgo)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error fetching pending transactions for verification:', error);
        return;
      }

      if (!pendingTransactions || pendingTransactions.length === 0) {
        return;
      }

      // Verify each pending transaction with Paystack or Korapay
      for (const transaction of pendingTransactions) {
        const transactionAge = Date.now() - new Date(transaction.created_at).getTime();
        const thirtyMinutes = 30 * 60 * 1000;
        const oneHour = 60 * 60 * 1000;
        
        // Verify Paystack transactions
        if (transaction.paystack_reference && transaction.deposit_method === 'paystack') {
          try {
            const verifyResponse = await fetch('/api/verify-paystack-payment', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                reference: transaction.paystack_reference
              })
            });

            if (verifyResponse.ok) {
              const verifyData = await verifyResponse.json();
              
              if (verifyData.success && verifyData.status === 'success') {
                // Payment was successful, update transaction
                console.log('Found successful payment for pending transaction:', transaction.id);
                
                // Update transaction status and store Paystack status and reference
                // Payment was confirmed, so status must be approved
                const { error: updateError } = await supabase
                  .from('transactions')
                  .update({ 
                    status: 'approved',
                    paystack_status: verifyData.status, // Store Paystack status
                    paystack_reference: verifyData.reference || transaction.paystack_reference // Always store reference from verification
                  })
                  .eq('id', transaction.id);

                // If update failed, try again without status check
                if (updateError) {
                  console.warn('First update attempt failed, retrying without status condition:', updateError);
                  await supabase
                    .from('transactions')
                    .update({ 
                      status: 'approved',
                      paystack_status: verifyData.status,
                      paystack_reference: verifyData.reference || transaction.paystack_reference
                    })
                    .eq('id', transaction.id);
                }

                // Verify status was updated
                const { data: statusCheck } = await supabase
                  .from('transactions')
                  .select('status, paystack_status, paystack_reference')
                  .eq('id', transaction.id)
                  .maybeSingle();

                if (statusCheck?.status !== 'approved') {
                  // Force update one more time
                  console.log('Status not approved yet, forcing update...');
                  await supabase
                    .from('transactions')
                    .update({ 
                      status: 'approved',
                      paystack_status: verifyData.status,
                      paystack_reference: verifyData.reference || transaction.paystack_reference
                    })
                    .eq('id', transaction.id);
                }

                // Update balance
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('balance')
                  .eq('id', authUser.id)
                  .single();

                if (profile) {
                  const newBalance = (profile.balance || 0) + transaction.amount;
                  await supabase
                    .from('profiles')
                    .update({ balance: newBalance })
                    .eq('id', authUser.id);
                  
                  // Refresh user data
                  await onUpdateUser();
                  toast.success(`Payment verified! ₵${transaction.amount.toFixed(2)} added to your balance.`);
                }
              } else if (verifyData.status === 'failed' || verifyData.status === 'abandoned') {
                // Payment failed or was abandoned, mark as rejected and store Paystack status
                console.log('Payment failed or abandoned, marking transaction as rejected:', {
                  transactionId: transaction.id,
                  status: verifyData.status
                });
                
                // Force update to rejected and store Paystack status and reference
                const { error: updateError } = await supabase
                  .from('transactions')
                  .update({ 
                    status: 'rejected',
                    paystack_status: verifyData.status, // Store actual Paystack status
                    paystack_reference: verifyData.reference || transaction.paystack_reference // Store reference if available
                  })
                  .eq('id', transaction.id);
                
                if (updateError) {
                  console.error('Error updating abandoned transaction:', updateError);
                  // Try again without status condition
                  await supabase
                    .from('transactions')
                    .update({ 
                      status: 'rejected',
                      paystack_status: verifyData.status,
                      paystack_reference: verifyData.reference || transaction.paystack_reference // Store reference if available
                    })
                    .eq('id', transaction.id);
                } else {
                  console.log('Transaction marked as rejected (abandoned/failed):', transaction.id);
                }
              } else {
                // Store Paystack status and reference even if it's not success/failed/abandoned (e.g., pending)
                await supabase
                  .from('transactions')
                  .update({ 
                    paystack_status: verifyData.status,
                    paystack_reference: verifyData.reference || transaction.paystack_reference // Store reference if available
                  })
                  .eq('id', transaction.id);
              }
              
              // Check if transaction is too old and still pending
              if (transactionAge > oneHour && verifyData.status !== 'success') {
                // Transaction is older than 1 hour and payment is still not successful
                // Mark as rejected to prevent indefinite pending status
                console.log('Old pending transaction (over 1 hour) with reference but payment not successful, marking as rejected:', transaction.id);
                await supabase
                  .from('transactions')
                  .update({ 
                    status: 'rejected',
                    paystack_status: 'timeout' // Mark as timeout for old pending transactions
                  })
                  .eq('id', transaction.id)
                  .eq('status', 'pending');
              }
            } else {
              // If verification request fails and transaction is old, mark as rejected
              if (transactionAge > oneHour) {
                console.log('Old pending transaction, verification request failed, marking as rejected:', transaction.id);
                await supabase
                  .from('transactions')
                  .update({ 
                    status: 'rejected',
                    paystack_status: 'verification_failed'
                  })
                  .eq('id', transaction.id)
                  .eq('status', 'pending');
              }
            }
          } catch (verifyError) {
            console.error('Error verifying payment:', verifyError);
            // If verification throws error and transaction is old, mark as rejected
            if (transactionAge > oneHour) {
              console.log('Old pending transaction, verification error, marking as rejected:', transaction.id);
              await supabase
                .from('transactions')
                .update({ 
                  status: 'rejected',
                  paystack_status: 'verification_error'
                })
                .eq('id', transaction.id)
                .eq('status', 'pending');
            }
            // Continue with other transactions
          }
        } else {
          // No reference stored - this means callback never fired
          // We can't verify without reference, but we can check if it's been more than 30 minutes
          // If so, it's likely the payment was never completed
          if (transactionAge > thirtyMinutes) {
            // Transaction is old and has no reference - likely never completed
            // Mark as rejected after 30 minutes (increased from 10 to account for slower payment processing)
            console.log('Old pending transaction without reference, marking as rejected:', transaction.id);
            await supabase
              .from('transactions')
              .update({ 
                status: 'rejected',
                paystack_status: 'no_reference' // No reference means payment was never initiated
              })
              .eq('id', transaction.id)
              .eq('status', 'pending');
          }
        }
      }
    } catch (error) {
      console.error('Error in verifyPendingPayments:', error);
    }
  }, [onUpdateUser]);

  useEffect(() => {
    // Fetch initial data
    fetchServices().catch((error) => {
      console.error('Error fetching services:', error);
    });
    fetchRecentOrders().catch((error) => {
      console.error('Error fetching recent orders:', error);
    });
    verifyPendingPayments().catch((error) => {
      console.error('Error verifying pending payments:', error);
    });
  }, [fetchServices, fetchRecentOrders, verifyPendingPayments]);

  // Global error handler for unhandled promise rejections
  useEffect(() => {
    const handleUnhandledRejection = (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      // Prevent the default browser error handling
      event.preventDefault();
      // Log the error for debugging
      if (event.reason) {
        console.error('Rejection reason:', event.reason);
        if (event.reason.message) {
          console.error('Error message:', event.reason.message);
        }
        if (event.reason.stack) {
          console.error('Error stack:', event.reason.stack);
        }
      }
      // Don't show toast for CORS errors - they're expected and already handled
      if (event.reason && typeof event.reason === 'object') {
        const errorMsg = event.reason.message || event.reason.toString() || '';
        if (!errorMsg.includes('CORS') && !errorMsg.includes('Failed to fetch') && !errorMsg.includes('timed out')) {
          // Only show toast for unexpected errors
          toast.error('An unexpected error occurred. Please try again.');
        }
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Periodic status checking for orders and pending payments
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      // Only check if user is authenticated
      if (user) {
        console.log('Periodic status check...');
        // fetchRecentOrders now uses optimized batch checking internally
        fetchRecentOrders().catch((error) => {
          console.error('Error in periodic order status check:', error);
        });
        verifyPendingPayments().catch((error) => {
          console.error('Error in periodic payment verification:', error);
        });
      }
    }, 300000); // Check every 5 minutes (increased from 3 minutes, optimized with last_status_check)

    return () => clearInterval(interval);
  }, [user, fetchRecentOrders, verifyPendingPayments]);

  // Pre-select service if navigated from Services page
  useEffect(() => {
    const selectedServiceId = location.state?.selectedServiceId;
    if (selectedServiceId && services.length > 0) {
      // Verify the service exists in the services array
      const serviceExists = services.find(s => s.id === selectedServiceId);
      if (serviceExists) {
        setOrderForm(prev => {
          // Only update if not already set to avoid unnecessary re-renders
          if (prev.service_id !== selectedServiceId) {
            return {
              ...prev,
              service_id: selectedServiceId
            };
          }
          return prev;
        });
        // Scroll to the order form section after a short delay
        setTimeout(() => {
          const orderSection = document.getElementById('order-form-section');
          if (orderSection) {
            orderSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 300);
        // Clear the state to avoid re-selecting on re-render
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state?.selectedServiceId, services]);

  // Pre-select promotion package if navigated from Services page
  useEffect(() => {
    const selectedPackageId = location.state?.selectedPackageId;
    if (selectedPackageId && promotionPackages.length > 0) {
      // Verify the package exists in the promotionPackages array
      const packageExists = promotionPackages.find(p => p.id === selectedPackageId);
      if (packageExists) {
        setOrderForm(prev => {
          // Only update if not already set to avoid unnecessary re-renders
          if (prev.package_id !== selectedPackageId) {
            return {
              ...prev,
              package_id: selectedPackageId,
              service_id: '', // Clear service_id when package is selected
              quantity: packageExists.quantity.toString() // Set quantity from package
            };
          }
          return prev;
        });
        // Scroll to the order form section after a short delay
        setTimeout(() => {
          const orderSection = document.getElementById('order-form-section');
          if (orderSection) {
            orderSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 300);
        // Clear the state to avoid re-selecting on re-render
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state?.selectedPackageId, promotionPackages]);


  const handlePaymentSuccess = async (reference) => {
    console.log('Payment success callback received:', { reference, pendingTransactionId: pendingTransaction?.id });

    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        throw new Error('Not authenticated');
      }

      // Find the transaction by reference first, then by pending transaction ID
      let transactionToUpdate = null;
      
      // First, try to find by Paystack reference (most reliable)
      if (reference) {
        const { data: foundByReference, error: findRefError } = await supabase
          .from('transactions')
          .select('id, user_id, type, amount, status, deposit_method, paystack_reference, korapay_reference, created_at')
          .eq('paystack_reference', reference)
          .maybeSingle();
        
        if (!findRefError && foundByReference) {
          transactionToUpdate = foundByReference;
          console.log('Found transaction by Paystack reference:', transactionToUpdate.id);
        }
      }
      
      // If not found by reference, try by pending transaction ID
      if (!transactionToUpdate && pendingTransaction) {
        const { data: foundById, error: findByIdError } = await supabase
          .from('transactions')
          .select('id, user_id, type, amount, status, deposit_method, paystack_reference, korapay_reference, created_at')
          .eq('id', pendingTransaction.id)
          .maybeSingle();
        
        if (!findByIdError && foundById) {
          transactionToUpdate = foundById;
          // Update the transaction with the reference for future verification
          // But first check if another transaction already has this reference
          if (reference && !foundById.paystack_reference) {
            const { data: existingWithRef } = await supabase
              .from('transactions')
              .select('id, user_id, amount, status')
              .eq('paystack_reference', reference)
              .neq('id', foundById.id)
              .maybeSingle();
            
            if (existingWithRef) {
              // Another transaction already has this reference
              console.warn('Reference collision detected (by ID):', {
                currentTransactionId: foundById.id,
                existingTransactionId: existingWithRef.id,
                reference
              });
              // Use the existing transaction instead
              transactionToUpdate = existingWithRef;
            } else {
              // Safe to update
              await supabase
                .from('transactions')
                .update({ paystack_reference: reference })
                .eq('id', foundById.id);
            }
          }
        }
      }
      
      // If still not found, search for most recent pending transaction
      if (!transactionToUpdate) {
        const { data: pendingTransactions, error: findPendingError } = await supabase
          .from('transactions')
          .select('id, user_id, type, amount, status, deposit_method, paystack_reference, korapay_reference, created_at')
          .eq('user_id', authUser.id)
          .eq('status', 'pending')
          .eq('type', 'deposit')
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (!findPendingError && pendingTransactions && pendingTransactions.length > 0) {
          transactionToUpdate = pendingTransactions[0];
          // Update with reference, but first check if another transaction already has it
          if (reference && !transactionToUpdate.paystack_reference) {
            const { data: existingWithRef } = await supabase
              .from('transactions')
              .select('id, user_id, amount, status')
              .eq('paystack_reference', reference)
              .neq('id', transactionToUpdate.id)
              .maybeSingle();
            
            if (existingWithRef) {
              // Another transaction already has this reference
              console.warn('Reference collision detected (by search):', {
                currentTransactionId: transactionToUpdate.id,
                existingTransactionId: existingWithRef.id,
                reference
              });
              // Use the existing transaction instead
              transactionToUpdate = existingWithRef;
            } else {
              // Safe to update
              await supabase
                .from('transactions')
                .update({ paystack_reference: reference })
                .eq('id', transactionToUpdate.id);
            }
          }
          console.log('Found pending transaction by search:', transactionToUpdate.id);
        }
      }

      // If still not found, check for approved transactions (webhook might have processed it)
      if (!transactionToUpdate && reference) {
        const { data: approvedTransactions, error: findApprovedError } = await supabase
          .from('transactions')
          .select('id, user_id, type, amount, status, deposit_method, paystack_reference, korapay_reference, created_at')
          .eq('user_id', authUser.id)
          .eq('type', 'deposit')
          .in('status', ['approved', 'pending'])
          .order('created_at', { ascending: false })
          .limit(5);
        
        if (!findApprovedError && approvedTransactions && approvedTransactions.length > 0) {
          // Try to find by reference first
          const foundByRef = approvedTransactions.find(tx => tx.paystack_reference === reference);
          if (foundByRef) {
            transactionToUpdate = foundByRef;
            console.log('Found transaction by reference in recent transactions:', transactionToUpdate.id);
          } else {
            // If reference doesn't match, use most recent one (might be the payment)
            transactionToUpdate = approvedTransactions[0];
            // Update with reference if it's missing, but first check for duplicates
            if (reference && !transactionToUpdate.paystack_reference) {
              const { data: existingWithRef } = await supabase
                .from('transactions')
                .select('id, user_id, amount, status')
                .eq('paystack_reference', reference)
                .neq('id', transactionToUpdate.id)
                .maybeSingle();
              
              if (existingWithRef) {
                // Another transaction already has this reference
                console.warn('Reference collision detected (recent transactions):', {
                  currentTransactionId: transactionToUpdate.id,
                  existingTransactionId: existingWithRef.id,
                  reference
                });
                // Use the existing transaction instead
                transactionToUpdate = existingWithRef;
              } else {
                // Safe to update
                await supabase
                  .from('transactions')
                  .update({ paystack_reference: reference })
                  .eq('id', transactionToUpdate.id);
              }
            }
            console.log('Found recent transaction (may have been processed by webhook):', transactionToUpdate.id);
          }
        }
      }

      // Final fallback: search for ANY transaction with this reference (regardless of status)
      if (!transactionToUpdate && reference) {
        const { data: anyTransaction, error: findAnyError } = await supabase
          .from('transactions')
          .select('id, user_id, type, amount, status, deposit_method, paystack_reference, korapay_reference, created_at')
          .eq('paystack_reference', reference)
          .eq('user_id', authUser.id)
          .maybeSingle();
        
        if (!findAnyError && anyTransaction) {
          transactionToUpdate = anyTransaction;
          console.log('Found transaction by reference (any status):', transactionToUpdate.id, 'Status:', transactionToUpdate.status);
        }
      }

      if (!transactionToUpdate) {
        // Log detailed debugging information
        console.error('Transaction not found for payment success callback:', {
          reference,
          pendingTransactionId: pendingTransaction?.id,
          userId: authUser.id,
          timestamp: new Date().toISOString()
        });
        
        // Try to get recent transactions for debugging
        const { data: recentTxs } = await supabase
          .from('transactions')
          .select('id, status, paystack_reference, amount, created_at')
          .eq('user_id', authUser.id)
          .eq('type', 'deposit')
          .order('created_at', { ascending: false })
          .limit(10);
        
        console.error('Recent deposit transactions:', recentTxs);
        
        // FALLBACK: Verify payment with Paystack and create transaction if payment is successful
        console.log('Attempting fallback: Verifying payment with Paystack API and creating transaction if needed...');
        try {
          const verifyResponse = await fetch('/api/verify-paystack-payment', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reference })
          });

          if (!verifyResponse.ok) {
            const errorData = await verifyResponse.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(`Payment verification failed: ${errorData.error || 'Unknown error'}. Reference: ${reference || 'N/A'}. Please contact support with this reference.`);
          }

          const verifyData = await verifyResponse.json();
          
          // Only create transaction if payment was actually successful
          if (!verifyData.success || verifyData.status !== 'success') {
            throw new Error(`Payment was not successful. Status: ${verifyData.status || 'unknown'}. Reference: ${reference || 'N/A'}. Please contact support.`);
          }

          // Extract amount and metadata from Paystack response
          const amount = verifyData.amount;
          const metadata = verifyData.metadata || {};
          const transactionIdFromMetadata = metadata.transaction_id;

          if (!amount || amount <= 0) {
            throw new Error(`Invalid payment amount: ${amount}. Reference: ${reference || 'N/A'}. Please contact support.`);
          }

          console.log('Payment verified successfully, checking for existing transaction before creating:', {
            amount,
            reference,
            transactionIdFromMetadata
          });

          // CRITICAL: Check if transaction with this reference already exists (globally)
          // This prevents duplicates when webhook processes payment before frontend callback
          if (reference) {
            const { data: existingByRef, error: checkRefError } = await supabase
              .from('transactions')
              .select('id, user_id, type, amount, status, paystack_reference, created_at')
              .eq('paystack_reference', reference)
              .maybeSingle();

            if (!checkRefError && existingByRef) {
              console.warn('Transaction with this reference already exists, using existing transaction:', {
                existingId: existingByRef.id,
                status: existingByRef.status,
                userId: existingByRef.user_id,
                currentUserId: authUser.id,
                reference
              });
              
              // Use existing transaction instead of creating duplicate
              transactionToUpdate = existingByRef;
              
              // If it's for a different user, log error but still use it (webhook might have created it)
              if (existingByRef.user_id !== authUser.id) {
                console.error('CRITICAL: Transaction reference belongs to different user!', {
                  reference,
                  existingUserId: existingByRef.user_id,
                  currentUserId: authUser.id,
                  existingTransactionId: existingByRef.id
                });
              }
              
              // Skip transaction creation, continue with approval logic below
            } else {
              // No existing transaction found by reference, check for transaction by user + amount + time
              // This handles case where initial transaction was created without reference
              const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
              const { data: existingByUserAmount, error: checkUserAmountError } = await supabase
                .from('transactions')
                .select('id, user_id, type, amount, status, paystack_reference, created_at')
                .eq('user_id', authUser.id)
                .eq('type', 'deposit')
                .eq('amount', amount)
                .eq('deposit_method', 'paystack')
                .gte('created_at', tenMinutesAgo)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (!checkUserAmountError && existingByUserAmount) {
                console.log('Found existing transaction by user + amount + time, updating with reference:', {
                  transactionId: existingByUserAmount.id,
                  status: existingByUserAmount.status,
                  hasReference: !!existingByUserAmount.paystack_reference
                });
                
                // Use existing transaction and update it with reference
                transactionToUpdate = existingByUserAmount;
                
                // Update with reference if it doesn't have one
                // But first check if another transaction already has this reference
                if (!existingByUserAmount.paystack_reference) {
                  const { data: refCheck } = await supabase
                    .from('transactions')
                    .select('id')
                    .eq('paystack_reference', reference)
                    .neq('id', existingByUserAmount.id)
                    .maybeSingle();
                  
                  if (refCheck) {
                    console.warn('Another transaction already has this reference, using that transaction instead:', {
                      existingTransactionId: existingByUserAmount.id,
                      transactionWithReference: refCheck.id,
                      reference
                    });
                    // Use the transaction that already has the reference
                    const { data: txWithRef } = await supabase
                      .from('transactions')
                      .select('id, user_id, type, amount, status, paystack_reference, created_at')
                      .eq('id', refCheck.id)
                      .maybeSingle();
                    if (txWithRef) {
                      transactionToUpdate = txWithRef;
                    }
                  } else {
                    // Safe to update with reference
                    await supabase
                      .from('transactions')
                      .update({ paystack_reference: reference })
                      .eq('id', existingByUserAmount.id);
                    console.log('Updated existing transaction with reference:', reference);
                  }
                }
              } else {
                // No existing transaction found, safe to create
                // Add small delay to handle race conditions with webhook
                console.log('No existing transaction found, waiting 500ms to handle race conditions...');
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Re-check one more time after delay (webhook might have created it)
                const { data: recheckByRef, error: recheckError } = await supabase
                  .from('transactions')
                  .select('id, user_id, type, amount, status, paystack_reference, created_at')
                  .eq('paystack_reference', reference)
                  .maybeSingle();
                
                if (!recheckError && recheckByRef) {
                  console.log('Transaction found after delay, using existing:', {
                    transactionId: recheckByRef.id,
                    status: recheckByRef.status
                  });
                  transactionToUpdate = recheckByRef;
                } else {
                  // Final check: look for transaction by user + amount again after delay
                  const { data: recheckByUserAmount } = await supabase
                    .from('transactions')
                    .select('id, user_id, type, amount, status, paystack_reference, created_at')
                    .eq('user_id', authUser.id)
                    .eq('type', 'deposit')
                    .eq('amount', amount)
                    .eq('deposit_method', 'paystack')
                    .gte('created_at', tenMinutesAgo)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                  if (recheckByUserAmount) {
                    console.log('Found transaction by user + amount after delay, updating with reference:', {
                      transactionId: recheckByUserAmount.id,
                      status: recheckByUserAmount.status
                    });
                    transactionToUpdate = recheckByUserAmount;
                    
                    // Update with reference, but first check if another transaction already has it
                    if (!recheckByUserAmount.paystack_reference) {
                      const { data: refCheck } = await supabase
                        .from('transactions')
                        .select('id')
                        .eq('paystack_reference', reference)
                        .neq('id', recheckByUserAmount.id)
                        .maybeSingle();
                      
                      if (refCheck) {
                        console.warn('Another transaction already has this reference, using that transaction instead:', {
                          existingTransactionId: recheckByUserAmount.id,
                          transactionWithReference: refCheck.id,
                          reference
                        });
                        // Use the transaction that already has the reference
                        const { data: txWithRef } = await supabase
                          .from('transactions')
                          .select('id, user_id, type, amount, status, paystack_reference, created_at')
                          .eq('id', refCheck.id)
                          .maybeSingle();
                        if (txWithRef) {
                          transactionToUpdate = txWithRef;
                        }
                      } else {
                        // Safe to update with reference
                        await supabase
                          .from('transactions')
                          .update({ paystack_reference: reference })
                          .eq('id', recheckByUserAmount.id);
                      }
                    }
                  } else {
                    // Still no transaction, safe to create
                    console.log('No transaction found after delay, creating new transaction record');
                    const { data: newTransaction, error: createError } = await supabase
                      .from('transactions')
                      .insert({
                        user_id: authUser.id,
                        amount: amount,
                        type: 'deposit',
                        status: 'pending', // Will be approved by the API call below
                        deposit_method: 'paystack',
                        paystack_reference: reference
                      })
                      .select()
                      .single();

                    if (createError || !newTransaction) {
                      // Check if error is due to duplicate reference (unique constraint violation)
                      if (createError?.code === '23505' || createError?.message?.includes('duplicate') || createError?.message?.includes('unique') || createError?.message?.includes('paystack_reference')) {
                        // Transaction was created by another process (webhook), fetch it
                        console.log('Transaction creation failed due to duplicate, fetching existing transaction');
                        const { data: existingTx, error: fetchError } = await supabase
                          .from('transactions')
                          .select('id, user_id, type, amount, status, paystack_reference, created_at')
                          .eq('paystack_reference', reference)
                          .maybeSingle();
                        
                        if (!fetchError && existingTx) {
                          transactionToUpdate = existingTx;
                          console.log('Using existing transaction after duplicate error:', {
                            transactionId: existingTx.id,
                            status: existingTx.status
                          });
                        } else {
                          throw new Error(`Failed to create transaction: ${createError?.message || 'Unknown error'}. Reference: ${reference || 'N/A'}. Please contact support.`);
                        }
                      } else {
                        throw new Error(`Failed to create transaction record: ${createError?.message || 'Unknown error'}. Reference: ${reference || 'N/A'}. Please contact support with this reference.`);
                      }
                    } else {
                      console.log('Transaction record created successfully:', newTransaction.id);
                      transactionToUpdate = newTransaction;
                    }
                  }
                }
              }
            }
          } else {
            // No reference available, cannot check for duplicates
            // This should not happen if payment was successful, but handle it gracefully
            throw new Error('Cannot create transaction: No Paystack reference available. Reference: N/A. Please contact support.');
          }
        } catch (fallbackError) {
          console.error('Fallback transaction creation failed:', fallbackError);
          // If fallback fails, throw the original error with more details
          throw new Error(`No pending transaction found for this payment. Reference: ${reference || 'N/A'}, Transaction ID: ${pendingTransaction?.id || 'N/A'}. ${fallbackError.message || ''} Please contact support with this information.`);
        }
      }
      
      // Store reference if not already stored, but first check for duplicates
      if (reference && !transactionToUpdate.paystack_reference) {
        const { data: existingWithRef } = await supabase
          .from('transactions')
          .select('id, user_id, amount, status')
          .eq('paystack_reference', reference)
          .neq('id', transactionToUpdate.id)
          .maybeSingle();
        
        if (existingWithRef) {
          // Another transaction already has this reference
          console.warn('Reference collision detected (main update):', {
            currentTransactionId: transactionToUpdate.id,
            existingTransactionId: existingWithRef.id,
            reference
          });
          // Use the existing transaction instead
          transactionToUpdate = existingWithRef;
        } else {
          // Safe to update
          await supabase
            .from('transactions')
            .update({ paystack_reference: reference })
            .eq('id', transactionToUpdate.id);
        }
      }

      // Check if already approved (avoid duplicate processing)
      if (transactionToUpdate.status === 'approved') {
        console.log('Transaction already approved, checking balance...');
        
        // Verify balance was updated
        const { data: profile } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', authUser.id)
          .single();
        
        toast.success(`Payment already processed! ₵${transactionToUpdate.amount.toFixed(2)} is in your balance.`);
        setDepositAmount('');
        setPendingTransaction(null);
        await onUpdateUser();
        return;
      }

      // Use atomic database function to approve transaction and update balance
      // This prevents race conditions and ensures consistency
      console.log('Approving transaction using atomic database function:', { 
        transactionId: transactionToUpdate.id, 
        reference 
      });
      
      // Verify payment with Paystack to get the actual status
      let paystackStatus = 'success'; // Default to success since callback was triggered
      try {
        const verifyResponse = await fetch('/api/verify-paystack-payment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ reference })
        });
        
        if (verifyResponse.ok) {
          const verifyData = await verifyResponse.json();
          paystackStatus = verifyData.status || 'success';
          console.log('Paystack status from verification:', paystackStatus);
        }
      } catch (verifyError) {
        console.warn('Could not verify payment status, assuming success:', verifyError);
        // Continue with success assumption since callback was triggered
      }
      
      // Call the atomic approval API endpoint
      // This uses the approve_deposit_transaction database function which:
      // 1. Atomically updates transaction status to 'approved'
      // 2. Stores the paystack_reference
      // 3. Updates user balance atomically (prevents race conditions)
      const approveResponse = await fetch('/api/approve-paystack-deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          transaction_id: transactionToUpdate.id,
          reference: reference,
          paystack_status: paystackStatus
        })
      });

      if (!approveResponse.ok) {
        const errorData = await approveResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Error approving transaction via API:', errorData);
        throw new Error(`Failed to approve transaction: ${errorData.error || errorData.message || 'Unknown error'}. Transaction ID: ${transactionToUpdate.id}, Reference: ${reference || 'N/A'}`);
      }

      const approveResult = await approveResponse.json();
      
      if (!approveResult.success) {
        // Check if transaction was already approved (idempotent)
        if (approveResult.message && approveResult.message.includes('already approved')) {
          console.log('Transaction already approved, verifying balance...');
          // Transaction is already approved, just verify balance and show success
          const { data: profile } = await supabase
            .from('profiles')
            .select('balance')
            .eq('id', authUser.id)
            .single();
          
          toast.success(`Payment already processed! ₵${transactionToUpdate.amount.toFixed(2)} is in your balance.`);
          setDepositAmount('');
          setPendingTransaction(null);
          await onUpdateUser();
          return;
        }
        
        // Other error
        throw new Error(`Transaction approval failed: ${approveResult.message || 'Unknown error'}. Transaction ID: ${transactionToUpdate.id}, Reference: ${reference || 'N/A'}`);
      }

      console.log('Transaction approved successfully via atomic function:', {
        transactionId: transactionToUpdate.id,
        oldStatus: approveResult.old_status,
        newStatus: approveResult.new_status,
        oldBalance: approveResult.old_balance,
        newBalance: approveResult.new_balance,
        reference: reference
      });

      // Get updated balance for UI
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', authUser.id)
        .single();

      if (profileError) {
        console.warn('Error fetching profile after approval (non-critical):', profileError);
        // Use balance from approval result if available
        const newBalance = approveResult.new_balance || (approveResult.old_balance + transactionToUpdate.amount);
        setOptimisticBalance(newBalance);
      } else {
        const newBalance = parseFloat(profile.balance || 0);
        setOptimisticBalance(newBalance);
      }

      // INSTANT UI UPDATE: Refresh user data immediately
      onUpdateUser(); // Don't await - let it run in background
      
      // Show success toast immediately
      toast.success(`Payment successful! ₵${transactionToUpdate.amount.toFixed(2)} added to your balance.`);
      setDepositAmount('');
      setPendingTransaction(null);

      // Run automatic manual verification in background (non-blocking)
      (async () => {
        try {
          console.log('Running automatic verification for transaction:', transactionToUpdate.id);
          const verifyResponse = await fetch('/api/manual-verify-paystack-deposit', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              transactionId: transactionToUpdate.id 
            })
          });

          if (verifyResponse.ok) {
            const verifyData = await verifyResponse.json();
            console.log('Automatic verification completed:', verifyData);
          } else {
            const errorData = await verifyResponse.json().catch(() => ({}));
            console.warn('Automatic verification warning (non-critical):', errorData.error || 'Unknown error');
          }
        } catch (verifyError) {
          // Log but don't fail - this is a background verification step
          console.warn('Automatic verification error (non-critical):', verifyError);
        }
      })();

      // Run verification in background (non-blocking) - read-only check, no retry updates
      (async () => {
        console.log('Verifying balance was updated (background, read-only check)...');
        let balanceVerified = false;
        const expectedBalance = approveResult.new_balance || (approveResult.old_balance + transactionToUpdate.amount);
        
        for (let verifyAttempt = 1; verifyAttempt <= 3; verifyAttempt++) {
          // Wait a moment for database to sync
          await new Promise(resolve => setTimeout(resolve, 200));
          
          const { data: verifyProfile, error: verifyError } = await supabase
            .from('profiles')
            .select('balance')
            .eq('id', authUser.id)
            .maybeSingle();

          if (verifyError || !verifyProfile) {
            console.warn(`Balance verification attempt ${verifyAttempt} failed (background):`, verifyError);
            continue;
          }

          const verifiedBalance = parseFloat(verifyProfile.balance || 0);
          
          // Allow small floating point differences (0.01)
          if (Math.abs(verifiedBalance - expectedBalance) < 0.01) {
            balanceVerified = true;
            console.log(`✅ Balance verified successfully (background, attempt ${verifyAttempt}):`, {
              expected: expectedBalance,
              actual: verifiedBalance
            });
            break;
          } else {
            console.warn(`Balance verification attempt ${verifyAttempt} - mismatch (background):`, {
              expected: expectedBalance,
              actual: verifiedBalance,
              difference: Math.abs(verifiedBalance - expectedBalance)
            });
            // Don't retry balance update - trust the atomic function result
            // If there's a mismatch, it's likely a timing issue or needs admin attention
          }
        }

        if (!balanceVerified) {
          console.error('⚠️ WARNING: Balance verification failed after multiple attempts (background)!', {
            transactionId: transactionToUpdate.id,
            transactionAmount: transactionToUpdate.amount,
            expectedBalance: expectedBalance
          });
          toast.warning('Balance verification failed. Please refresh the page to confirm your balance. If the issue persists, contact support.');
        }
      })();
    } catch (error) {
      console.error('Error processing payment:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        reference,
        pendingTransactionId: pendingTransaction?.id,
        userId: authUser?.id
      });
      
      // Extract transaction ID and reference for error message
      const transactionId = pendingTransaction?.id || 'N/A';
      const transactionIdShort = transactionId !== 'N/A' ? transactionId.slice(0, 8) : 'N/A';
      const referenceDisplay = reference || 'N/A';
      
      // Create detailed error message
      const errorMessage = `Payment successful but failed to update: ${error.message || 'Unknown error'}. Transaction ID: ${transactionIdShort}, Reference: ${referenceDisplay}. Please contact support with this information.`;
      
      toast.error(errorMessage);
      
      // Don't try to update transaction status here - let admin handle it manually
      // Just clear the pending transaction state
      setPendingTransaction(null);
    }
  };

  // Helper function to store Paystack reference with retry logic
  const storePaystackReference = useCallback(async (transactionId, reference, maxRetries = 3) => {
    if (!transactionId || !reference) {
      console.warn('[REFERENCE] Cannot store reference - missing transaction ID or reference:', {
        hasTransactionId: !!transactionId,
        hasReference: !!reference
      });
      return false;
    }

    // First, check if another transaction already has this reference
    const { data: existingWithRef } = await supabase
      .from('transactions')
      .select('id, user_id, amount, status')
      .eq('paystack_reference', reference)
      .neq('id', transactionId)
      .maybeSingle();
    
    if (existingWithRef) {
      console.warn('[REFERENCE] Another transaction already has this reference, skipping update:', {
        currentTransactionId: transactionId,
        existingTransactionId: existingWithRef.id,
        reference
      });
      return false; // Don't update, another transaction has it
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { data: refData, error: refError } = await supabase
          .from('transactions')
          .update({ paystack_reference: reference })
          .eq('id', transactionId)
          .select('paystack_reference')
          .single();

        if (refError) {
          console.error(`[REFERENCE] Attempt ${attempt} error storing reference:`, refError);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            continue;
          }
          return false;
        }

        if (refData?.paystack_reference === reference) {
          console.log(`[REFERENCE] ✅ Reference stored successfully (attempt ${attempt}):`, reference);
          return true;
        } else {
          console.warn(`[REFERENCE] Attempt ${attempt} - Reference update returned but value mismatch:`, {
            expected: reference,
            received: refData?.paystack_reference
          });
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            continue;
          }
        }
      } catch (error) {
        console.error(`[REFERENCE] Attempt ${attempt} exception storing reference:`, error);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    // Final verification
    const { data: finalCheck } = await supabase
      .from('transactions')
      .select('paystack_reference')
      .eq('id', transactionId)
      .single();

    if (finalCheck?.paystack_reference === reference) {
      console.log('[REFERENCE] ✅ Reference verified in final check');
      return true;
    }

    console.error('[REFERENCE] ❌ Failed to store reference after all attempts');
    return false;
  }, []);

  const handlePaymentCancellation = async () => {
    if (!pendingTransaction) {
      console.log('No pending transaction to cancel');
      return;
    }

    // Capture transaction ID immediately to avoid race conditions
    const transactionId = pendingTransaction.id;
    console.log('Payment cancelled or failed:', { transactionId });

    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        console.error('Not authenticated when cancelling payment');
        setPendingTransaction(null);
        return;
      }

      // Fetch transaction to check current status and get reference
      const { data: existingTransaction, error: fetchError } = await supabase
        .from('transactions')
        .select('status, paystack_reference, amount, user_id')
        .eq('id', transactionId)
        .maybeSingle();

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Error fetching transaction for cancellation:', fetchError);
        setPendingTransaction(null);
        return;
      }

      // Don't update if already approved
      if (existingTransaction?.status === 'approved') {
        console.log('Transaction already approved, not updating to cancelled');
        setPendingTransaction(null);
        return;
      }

      // If we have a Paystack reference, verify payment status before marking as cancelled
      // This handles the case where payment succeeded but callback didn't fire
      if (existingTransaction?.paystack_reference) {
        try {
          const verifyResponse = await fetch('/api/verify-paystack-payment', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              reference: existingTransaction.paystack_reference
            })
          });

          if (verifyResponse.ok) {
            const verifyData = await verifyResponse.json();
            
            // If payment was actually successful, process it instead of cancelling
            if (verifyData.success && verifyData.status === 'success') {
              console.log('Payment was successful despite window being closed, processing payment...');
              
              // Process the successful payment
              await handlePaymentSuccess(existingTransaction.paystack_reference);
              return; // Don't mark as cancelled
            }
            
            // If payment was abandoned or failed, mark as rejected and store Paystack status
            if (verifyData.status === 'abandoned' || verifyData.status === 'failed') {
              console.log('Payment was abandoned or failed, marking transaction as rejected:', {
                transactionId,
                status: verifyData.status
              });
              
              // Update transaction status to rejected and store Paystack status and reference
              const { error: abandonError } = await supabase
                .from('transactions')
                .update({ 
                  status: 'rejected',
                  paystack_status: verifyData.status,
                  paystack_reference: verifyData.reference || existingTransaction?.paystack_reference // Store reference if available
                })
                .eq('id', transactionId);
              
              if (abandonError) {
                console.error('Error updating abandoned transaction:', abandonError);
              } else {
                console.log('Transaction marked as rejected (abandoned/failed):', transactionId);
                toast.info(`Payment was ${verifyData.status}. Transaction has been cancelled.`);
              }
              
              setPendingTransaction(null);
              return; // Exit early since we've handled the abandoned transaction
            }
            
            // If payment status is something else, still store it and reference
            if (verifyData.status) {
              await supabase
                .from('transactions')
                .update({ 
                  paystack_status: verifyData.status,
                  paystack_reference: verifyData.reference || existingTransaction?.paystack_reference // Store reference if available
                })
                .eq('id', transactionId);
            }
          }
        } catch (verifyError) {
          console.error('Error verifying payment before cancellation:', verifyError);
          // Continue with cancellation if verification fails
        }
      } else {
        // No reference stored - try to find payment by email and amount
        // This is a fallback for when callback never fired
        // Note: This requires querying Paystack transactions, which needs secret key
        // For now, we'll mark as cancelled if no reference after a short delay
        console.log('No Paystack reference stored, cannot verify payment. Marking as cancelled.');
      }

      // Only update to rejected if still pending and payment was not successful
      if (existingTransaction?.status === 'pending') {
        const { error: updateError } = await supabase
          .from('transactions')
          .update({ 
            status: 'rejected',
            paystack_status: 'abandoned' // Mark as abandoned when user cancels
          })
          .eq('id', transactionId)
          .eq('status', 'pending');

        if (updateError) {
          console.error('Error updating transaction status to rejected:', updateError);
        } else {
          console.log('Transaction status updated to rejected (cancelled):', transactionId);
        }
      }

      setPendingTransaction(null);
    } catch (error) {
      console.error('Error handling payment cancellation:', error);
      setPendingTransaction(null);
    }
  };

  // Trigger Paystack payment when pendingTransaction is set (only for Paystack deposits)
  useEffect(() => {
    // Only initialize Paystack if this is a Paystack transaction
    // Skip if deposit_method is not 'paystack' (could be 'moolre', 'korapay', 'hubtel', 'manual', etc.)
    if (pendingTransaction && user?.email && pendingTransaction.deposit_method === 'paystack') {
      const initializePayment = async () => {
        try {
          if (!window.PaystackPop) {
            throw new Error('PaystackPop not loaded. Please refresh the page.');
          }

          if (!paystackPublicKey || paystackPublicKey.includes('xxxxxxxx')) {
            throw new Error('Paystack public key not configured. Please set REACT_APP_PAYSTACK_PUBLIC_KEY in your .env file.');
          }

          // Get auth user for metadata
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (!authUser) {
            throw new Error('Not authenticated');
          }

          // Validate inputs before calling Paystack
          const amountInPesewas = Math.round(pendingTransaction.amount * 100);
          const minPesewas = Math.round(minDepositSettings.paystack_min * 100);
          
          if (!amountInPesewas || amountInPesewas < minPesewas) {
            throw new Error(`Amount must be at least ₵${minDepositSettings.paystack_min.toFixed(2)} (${minPesewas} pesewas)`);
          }

          if (!user.email || !user.email.includes('@')) {
            throw new Error('Valid email is required for payment');
          }

          console.log('Initializing Paystack payment:', {
            key: paystackPublicKey.substring(0, 10) + '...',
            email: user.email,
            amount: amountInPesewas,
            currency: 'GHS',
            transactionId: pendingTransaction.id
          });

          // Prepare Paystack config - minimal required fields only
          // Include metadata to link transaction ID for verification
          const paystackConfig = {
            key: paystackPublicKey.trim(), // Remove any whitespace
            email: user.email.trim(),
            amount: amountInPesewas, // Amount in pesewas (1 GHS = 100 pesewas)
            currency: 'GHS',
            // Store transaction ID in metadata so we can verify later
            metadata: {
              transaction_id: pendingTransaction.id,
              user_id: authUser.id
            },
            callback: (response) => {
              // Paystack callback must be synchronous, handle async operations inside
              console.log('Paystack callback triggered:', response);
              
              // Check if response indicates failure
              if (!response || response.status === 'error' || response.status === 'failed') {
                console.error('[CALLBACK] Payment failed:', response);
                toast.error('Payment failed. Please try again.');
                // Try to store reference even for failed payments for tracking
                if (pendingTransaction?.id && response?.reference) {
                  storePaystackReference(pendingTransaction.id, response.reference).catch((refError) => {
                    console.error('[CALLBACK] Error storing reference for failed payment:', refError);
                  });
                }
                // Handle cancellation
                handlePaymentCancellation().catch((error) => {
                  console.error('Error handling payment failure:', error);
                });
                return;
              }
              
              // Verify response has reference
              if (!response.reference) {
                console.error('[CALLBACK] Invalid Paystack response (no reference):', response);
                toast.error('Payment response invalid. Please contact support.');
                handlePaymentCancellation().catch((error) => {
                  console.error('Error handling invalid payment response:', error);
                });
                return;
              }

              console.log('[CALLBACK] Paystack reference:', response.reference);
              console.log('[CALLBACK] Pending transaction:', pendingTransaction);

              // CRITICAL: Store reference BEFORE processing payment success
              // This ensures the reference is in the database before handlePaymentSuccess tries to find the transaction
              // Handle async operations inside synchronous callback
              if (pendingTransaction?.id && response.reference) {
                console.log('[CALLBACK] Storing Paystack reference before processing success:', response.reference);
                // Call async function without await (fire and forget in callback)
                storePaystackReference(pendingTransaction.id, response.reference)
                  .then((refStored) => {
                    if (refStored) {
                      console.log('[CALLBACK] Reference stored successfully, proceeding with payment success handler');
                    } else {
                      console.warn('[CALLBACK] Reference storage returned false, but continuing anyway');
                    }
                    // Now call the async handler after reference is stored
                    handlePaymentSuccess(response.reference).catch((error) => {
                      console.error('Payment success handler error:', error);
                      toast.error(`Payment processed but failed to update: ${error.message || 'Unknown error'}. Transaction ID: ${pendingTransaction?.id || 'N/A'}, Reference: ${response.reference || 'N/A'}. Please contact support.`);
                    });
                  })
                  .catch((refError) => {
                    console.error('[CALLBACK] Error storing reference in callback:', refError);
                    // Continue anyway - handlePaymentSuccess will try to store it again
                    handlePaymentSuccess(response.reference).catch((error) => {
                      console.error('Payment success handler error:', error);
                      toast.error(`Payment processed but failed to update: ${error.message || 'Unknown error'}. Transaction ID: ${pendingTransaction?.id || 'N/A'}, Reference: ${response.reference || 'N/A'}. Please contact support.`);
                    });
                  });
              } else {
                console.warn('[CALLBACK] Cannot store reference - missing transaction ID or reference:', {
                  hasTransactionId: !!pendingTransaction?.id,
                  hasReference: !!response?.reference,
                  response: response
                });
                // Call handler even if reference storage isn't possible
                handlePaymentSuccess(response.reference).catch((error) => {
                  console.error('Payment success handler error:', error);
                  toast.error(`Payment processed but failed to update: ${error.message || 'Unknown error'}. Transaction ID: ${pendingTransaction?.id || 'N/A'}, Reference: ${response.reference || 'N/A'}. Please contact support.`);
                });
              }
            },
            onClose: () => {
              console.log('[CALLBACK] Payment window closed by user before confirmation');
              // Note: If user closes window, we may not have a reference yet
              // But if we do have one from Paystack initialization, try to store it
              // The reference might be available in the pendingTransaction if Paystack provided it
              // We'll also try to retrieve it in handlePaymentCancellation
              handlePaymentCancellation().catch((error) => {
                console.error('Error handling payment cancellation:', error);
                toast.error('Failed to update payment status. Please contact support.');
              });
            }
          };

          // Validate Paystack key format
          if (paystackPublicKey.startsWith('sk_test_') || paystackPublicKey.startsWith('sk_live_')) {
            throw new Error('❌ You are using a SECRET key (sk_test_...) instead of a PUBLIC key (pk_test_...). Secret keys should NEVER be used in frontend code! Please get your PUBLIC key from Paystack Dashboard → Settings → API Keys and update REACT_APP_PAYSTACK_PUBLIC_KEY in your .env file.');
          }
          
          if (!paystackPublicKey.startsWith('pk_test_') && !paystackPublicKey.startsWith('pk_live_')) {
            throw new Error('Invalid Paystack public key format. Key must start with pk_test_ (test mode) or pk_live_ (live mode). Get it from: https://dashboard.paystack.com/#/settings/developer');
          }

          console.log('Paystack config (sanitized):', {
            key: paystackConfig.key.substring(0, 15) + '...',
            email: paystackConfig.email,
            amount: paystackConfig.amount,
            currency: paystackConfig.currency,
            metadata: paystackConfig.metadata
          });

          // Setup Paystack with error handling
          let handler;
          try {
            handler = window.PaystackPop.setup(paystackConfig);
          } catch (setupError) {
            console.error('Paystack setup error:', setupError);
            throw new Error('Failed to setup Paystack: ' + (setupError.message || 'Unknown error'));
          }
          
          // Open payment modal
          if (handler && typeof handler.openIframe === 'function') {
            handler.openIframe();
          } else {
            throw new Error('Failed to initialize Paystack payment handler. Please check your Paystack key.');
          }
        } catch (error) {
          console.error('Paystack initialization error:', error);
          
          // Check for specific error messages
          const errorMessage = error.message || '';
          if (errorMessage.includes('400') || errorMessage.includes('Bad Request')) {
            toast.error(`Invalid payment request. Please check: 1) Paystack key is valid, 2) Amount is at least ₵${minDepositSettings.paystack_min}, 3) Email is valid.`);
          } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
            toast.error('Invalid Paystack public key. Please check your REACT_APP_PAYSTACK_PUBLIC_KEY in .env file.');
          } else {
            toast.error('Failed to initialize payment: ' + (errorMessage || 'Unknown error'));
          }
          
          // Update transaction status to rejected when payment initialization fails
          if (pendingTransaction) {
            handlePaymentCancellation().catch((cancelError) => {
              console.error('Error handling payment cancellation after init failure:', cancelError);
            });
          } else {
            setPendingTransaction(null);
          }
        }
      };

      // Wait for PaystackPop to be available
      if (window.PaystackPop) {
        // Already loaded, initialize immediately
        const timer = setTimeout(() => {
          initializePayment().catch((error) => {
            console.error('Payment initialization error:', error);
            toast.error(error.message || 'Failed to initialize payment');
            if (pendingTransaction) {
              handlePaymentCancellation().catch((cancelError) => {
                console.error('Error handling payment cancellation after init failure:', cancelError);
              });
            }
          });
        }, 100);
        return () => clearTimeout(timer);
      } else {
        // Wait for script to load
        const checkInterval = setInterval(() => {
          if (window.PaystackPop) {
            clearInterval(checkInterval);
            initializePayment().catch((error) => {
              console.error('Payment initialization error:', error);
              toast.error(error.message || 'Failed to initialize payment');
              if (pendingTransaction) {
                handlePaymentCancellation().catch((cancelError) => {
                  console.error('Error handling payment cancellation after init failure:', cancelError);
                });
              }
            });
          }
        }, 100);

        // Timeout after 5 seconds
        const timeout = setTimeout(() => {
          clearInterval(checkInterval);
          if (!window.PaystackPop) {
            toast.error('Payment gateway failed to load. Please refresh the page and try again.');
            // Update transaction status to rejected when payment gateway fails to load
            if (pendingTransaction) {
              handlePaymentCancellation().catch((cancelError) => {
                console.error('Error handling payment cancellation after timeout:', cancelError);
                setPendingTransaction(null);
              });
            } else {
              setPendingTransaction(null);
            }
          }
        }, 5000);

        return () => {
          clearInterval(checkInterval);
          clearTimeout(timeout);
        };
      }
    }
  }, [pendingTransaction, user?.email, paystackPublicKey]);

  const handleManualDeposit = useCallback(async (e) => {
    e.preventDefault();

    if (!manualDepositForm.payment_proof_file) {
      toast.error('Please upload payment proof screenshot');
      return;
    }

    setLoading(true);
    setUploadingProof(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Not authenticated');

      // Get user's full name for reference
      const reference = user?.name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'user';

      // Upload payment proof to Supabase storage
      let paymentProofUrl = null;
      if (manualDepositForm.payment_proof_file) {
        const fileExt = manualDepositForm.payment_proof_file.name.split('.').pop();
        const fileName = `payment-proofs/${authUser.id}/${Date.now()}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('storage')
          .upload(fileName, manualDepositForm.payment_proof_file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('Error uploading payment proof:', uploadError);
          
          // Check if it's an RLS policy error
          if (uploadError.message?.includes('row-level security') || uploadError.message?.includes('policy')) {
            throw new Error('Storage access denied. Please contact admin to set up storage policies. Error: ' + uploadError.message);
          }
          
          // Check if bucket doesn't exist
          if (uploadError.message?.includes('Bucket not found') || uploadError.statusCode === 404) {
            throw new Error('Storage bucket not found. Please contact admin to create the storage bucket.');
          }
          
          throw new Error('Failed to upload payment proof: ' + (uploadError.message || 'Unknown error'));
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('storage')
          .getPublicUrl(fileName);
        
        paymentProofUrl = urlData.publicUrl;
      }

      // Create manual deposit transaction
      const { data: transaction, error } = await supabase
        .from('transactions')
        .insert({
          user_id: authUser.id,
          amount: 0,
          type: 'deposit',
          status: 'pending',
          deposit_method: 'manual',
          momo_number: '',
          manual_reference: reference,
          payment_proof_url: paymentProofUrl
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating manual deposit:', error);
        throw error;
      }

      toast.success('Manual deposit submitted! Your funds will be added within 5 minutes after verification.');
      setManualDepositForm({ amount: '', momo_number: '', payment_proof_file: null });
    } catch (error) {
      console.error('Manual deposit error:', error);
      toast.error(error.message || 'Failed to submit manual deposit. Please try again.');
    } finally {
      setLoading(false);
      setUploadingProof(false);
    }
  }, [manualDepositForm, onUpdateUser]);

  const handleHubtelDeposit = useCallback(async (e) => {
    e.preventDefault();
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    const amount = parseFloat(depositAmount);
    if (amount < minDepositSettings.hubtel_min) {
      toast.error(`Minimum deposit amount is ₵${minDepositSettings.hubtel_min}`);
      return;
    }

    setLoading(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Not authenticated');

      // Create transaction record for Hubtel payment
      const { data: transaction, error } = await supabase
        .from('transactions')
        .insert({
          user_id: authUser.id,
          amount: amount,
          type: 'deposit',
          status: 'pending',
          deposit_method: 'hubtel'
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating Hubtel deposit transaction:', error);
        throw error;
      }

      // ============================================
      // HUBTEL API INTEGRATION - ADD YOUR CODE HERE
      // ============================================
      // 
      // Example integration structure:
      // 
      // 1. Initialize Hubtel payment
      // const hubtelResponse = await fetch('https://api.hubtel.com/v1/merchantaccount/onlinecheckout/invoice/create', {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': `Basic ${btoa(CLIENT_ID + ':' + CLIENT_SECRET)}`
      //   },
      //   body: JSON.stringify({
      //     totalAmount: amount,
      //     description: `Deposit of ₵${amount}`,
      //     callbackUrl: `${window.location.origin}/payment-callback`,
      //     returnUrl: `${window.location.origin}/dashboard`,
      //     merchantReference: transaction.id,
      //     customerName: user.name,
      //     customerEmail: user.email,
      //     customerMsisdn: user.phone_number
      //   })
      // });
      // 
      // const hubtelData = await hubtelResponse.json();
      // 
      // 2. If successful, redirect to Hubtel payment page
      // if (hubtelData.responseCode === '0000') {
      //   window.location.href = hubtelData.data.checkoutUrl;
      // } else {
      //   throw new Error(hubtelData.responseMessage || 'Failed to initialize Hubtel payment');
      // }
      // 
      // 3. Update transaction with Hubtel reference
      // await supabase
      //   .from('transactions')
      //   .update({
      //     hubtel_reference: hubtelData.data.transactionId,
      //     hubtel_checkout_url: hubtelData.data.checkoutUrl
      //   })
      //   .eq('id', transaction.id);
      //
      // ============================================
      // END OF HUBTEL API INTEGRATION
      // ============================================

      // Temporary: Show message until Hubtel API is integrated
      toast.info('Hubtel payment integration is in progress. Please use Paystack or Manual deposit for now.');
      setDepositAmount('');
    } catch (error) {
      console.error('Hubtel deposit error:', error);
      toast.error(error.message || 'Failed to process Hubtel deposit. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [depositAmount, minDepositSettings.hubtel_min, onUpdateUser]);

  const handleKorapayDeposit = useCallback(async (e) => {
    e.preventDefault();
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    const amount = parseFloat(depositAmount);
    if (amount < minDepositSettings.korapay_min) {
      toast.error(`Minimum deposit amount is ₵${minDepositSettings.korapay_min}`);
      return;
    }

    setLoading(true);
    let transaction = null; // Declare outside try block so it's accessible in catch
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Not authenticated');

      // Create transaction record for Korapay payment
      const { data: transactionData, error } = await supabase
        .from('transactions')
        .insert({
          user_id: authUser.id,
          amount: amount,
          type: 'deposit',
          status: 'pending',
          deposit_method: 'korapay'
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating Korapay deposit transaction:', error);
        throw error;
      }
      
      transaction = transactionData; // Assign to outer variable

      // Check if Korapay SDK is loaded
      if (!window.Korapay) {
        // Wait a bit for script to load, then retry
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (!window.Korapay) {
          // Try loading the script again
          const korapayScript = document.createElement('script');
          korapayScript.src = 'https://korablobstorage.blob.core.windows.net/modal-bucket/korapay-collections.min.js';
          korapayScript.async = true;
          document.head.appendChild(korapayScript);
          
          // Wait a bit more for script to load
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          if (!window.Korapay) {
            toast.error('Korapay payment gateway is not available. Please refresh the page and try again.');
            setLoading(false);
            return;
          }
        }
      }

      // Generate unique reference for this transaction
      const korapayReference = `KORA_${transaction.id}_${Date.now()}`;

      // Initialize Korapay payment via serverless function to bypass CORS
      try {
        const initResponse = await fetch('/api/korapay-init', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            amount: amount,
            currency: 'GHS',
            reference: korapayReference,
            customer: {
              name: user?.name || authUser.user_metadata?.name || 'Customer',
              email: user?.email || authUser.email || ''
            },
            notification_url: `${window.location.origin}/api/payment-callback/korapay`,
            callback_url: `${window.location.origin}/payment/callback?method=korapay`
          })
        });

        if (!initResponse.ok) {
          const errorData = await initResponse.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || 'Failed to initialize Korapay payment');
        }

        const initData = await initResponse.json();

        if (!initData.success || !initData.authorization_url) {
          throw new Error(initData.error || 'Failed to get payment authorization URL');
        }

        // Update transaction with Korapay reference
        await supabase
          .from('transactions')
          .update({
            korapay_reference: korapayReference,
            korapay_status: 'pending'
          })
          .eq('id', transaction.id);

        // Redirect user to Korapay payment page
        window.location.href = initData.authorization_url;

        // Note: User will be redirected back via callback_url after payment
        // The callback handler should verify the payment and update the transaction

      } catch (initError) {
        console.error('Error initializing Korapay payment:', initError);
        toast.error(initError.message || 'Failed to initialize payment. Please try again or use another payment method.');
        setLoading(false);
        
        // Update transaction to rejected
        supabase
          .from('transactions')
          .update({
            status: 'rejected',
            korapay_reference: korapayReference,
            korapay_status: 'failed',
            korapay_error: initError.message || 'Initialization failed'
          })
          .eq('id', transaction.id)
          .then(() => {
            // Update successful
          })
          .catch((updateError) => {
            console.error('Error updating transaction:', updateError);
          });
      }

    } catch (error) {
      console.error('Korapay deposit error:', error);
      toast.error(error.message || 'Failed to initialize Korapay payment. Please try again.');
      setLoading(false);
      
      // Update transaction to rejected if it was created
      if (transaction?.id) {
        supabase
          .from('transactions')
          .update({
            status: 'rejected',
            korapay_status: 'failed',
            korapay_error: error.message || 'Initialization failed'
          })
          .eq('id', transaction.id)
          .then(() => {
            // Update successful
          })
          .catch((updateError) => {
            console.error('Error updating transaction:', updateError);
          });
      }
    }
  }, [depositAmount, minDepositSettings.korapay_min, onUpdateUser]);

  // Helper function to check if a phone number + channel is already verified
  const checkMoolreVerification = useCallback(async (phoneNumber, channel) => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        console.log('checkMoolreVerification: No auth user');
        return false;
      }

      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      if (!normalizedPhone) {
        console.log('checkMoolreVerification: Invalid phone number', phoneNumber);
        return false;
      }

      console.log('Checking verification for:', { normalizedPhone, channel, userId: authUser.id });

      const { data, error } = await supabase
        .from('moolre_verified_phones')
        .select('id, verified_at, phone_number, channel')
        .eq('user_id', authUser.id)
        .eq('phone_number', normalizedPhone)
        .eq('channel', channel)
        .maybeSingle();

      if (error) {
        console.error('Error checking Moolre verification:', error);
        // Check if error is due to table not existing
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.error('⚠️ moolre_verified_phones table does not exist! Please run the database migration.');
        }
        // Check if error is due to RLS policy
        if (error.code === '42501' || error.message?.includes('permission denied')) {
          console.error('⚠️ RLS policy issue - user may not have permission to read moolre_verified_phones table');
        }
        return false;
      }

      const isVerified = !!data;
      console.log('Verification check result:', { 
        isVerified, 
        data,
        queryParams: { normalizedPhone, channel, userId: authUser.id }
      });
      
      // If not verified, check if there are any records for this user at all (for debugging)
      if (!isVerified) {
        const { data: allUserRecords, error: checkError } = await supabase
          .from('moolre_verified_phones')
          .select('id, phone_number, channel')
          .eq('user_id', authUser.id)
          .limit(5);
        
        if (!checkError && allUserRecords && allUserRecords.length > 0) {
          console.log('Found other verified phones for this user:', allUserRecords);
          console.log('Looking for match:', { normalizedPhone, channel });
          console.log('Mismatch check:', {
            phoneMatch: allUserRecords.some(r => r.phone_number === normalizedPhone),
            channelMatch: allUserRecords.some(r => r.channel === channel),
            exactMatch: allUserRecords.some(r => r.phone_number === normalizedPhone && r.channel === channel)
          });
        } else if (checkError) {
          console.warn('Could not check for other records:', checkError);
        }
      }
      
      return isVerified;
    } catch (error) {
      console.error('Error in checkMoolreVerification:', error);
      return false;
    }
  }, []);

  // Helper function to store verified phone number + channel
  const storeMoolreVerification = useCallback(async (phoneNumber, channel) => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        console.error('Not authenticated, cannot store verification');
        return false;
      }

      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      if (!normalizedPhone) {
        console.error('Invalid phone number, cannot store verification');
        return false;
      }

      // Insert or update (using upsert with ON CONFLICT)
      const { data, error } = await supabase
        .from('moolre_verified_phones')
        .upsert({
          user_id: authUser.id,
          phone_number: normalizedPhone,
          channel: channel,
          verified_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,phone_number,channel'
        })
        .select();

      if (error) {
        console.error('Error storing Moolre verification:', error);
        return false;
      }

      console.log('Moolre verification stored successfully:', { 
        phoneNumber: normalizedPhone, 
        channel, 
        userId: authUser.id,
        storedData: data 
      });
      return true;
    } catch (error) {
      console.error('Error in storeMoolreVerification:', error);
      return false;
    }
  }, []);

  const handleMoolreWebDeposit = useCallback(async (e) => {
    e.preventDefault();
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    const amount = parseFloat(depositAmount);
    if (amount < minDepositSettings.moolre_web_min) {
      toast.error(`Minimum deposit amount is ₵${minDepositSettings.moolre_web_min}`);
      return;
    }

    setLoading(true);
    let transaction = null;
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Not authenticated');

      // Get user email
      const userEmail = user?.email || authUser.email;
      if (!userEmail) {
        throw new Error('Email is required for Moolre Web payment');
      }

      // Create transaction record for Moolre Web payment
      const { data: transactionData, error } = await supabase
        .from('transactions')
        .insert({
          user_id: authUser.id,
          amount: amount,
          type: 'deposit',
          status: 'pending',
          deposit_method: 'moolre_web'
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating Moolre Web deposit transaction:', error);
        throw error;
      }

      transaction = transactionData;

      // Generate unique reference for this transaction
      const moolreWebReference = `MOOLRE_WEB_${transaction.id}_${Date.now()}`;

      // Initialize Moolre Web payment via serverless function
      const initResponse = await fetch('/api/moolre-web-init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: amount,
          currency: 'GHS',
          email: userEmail,
          externalref: moolreWebReference,
          callback: `${window.location.origin}/payment-callback?method=moolre_web&ref=${moolreWebReference}`,
          redirect: `${window.location.origin}/payment-callback?method=moolre_web&ref=${moolreWebReference}`
        })
      });

      if (!initResponse.ok) {
        let errorData;
        try {
          errorData = await initResponse.json();
        } catch (parseError) {
          const text = await initResponse.text();
          console.error('Failed to parse error response:', text);
          throw new Error(`Server error (${initResponse.status}): ${text || 'Unknown error'}`);
        }
        console.error('Moolre Web init error:', errorData);
        throw new Error(errorData.error || errorData.message || 'Failed to initialize Moolre Web payment');
      }

      const initData = await initResponse.json();
      console.log('Moolre Web init response:', initData);

      if (!initData.success || !initData.payment_link) {
        console.error('Moolre Web init failed - missing payment link:', initData);
        throw new Error(initData.error || initData.message || 'Failed to get payment link from Moolre');
      }

      // Update transaction with reference
      await supabase
        .from('transactions')
        .update({
          moolre_web_reference: moolreWebReference
        })
        .eq('id', transaction.id);

      // Redirect user to Moolre payment page
      window.location.href = initData.payment_link;

    } catch (error) {
      console.error('Error in Moolre Web deposit:', error);
      toast.error(error.message || 'Failed to initialize payment. Please try again.');
      
      // Delete transaction if it was created but payment initialization failed
      if (transaction) {
        await supabase
          .from('transactions')
          .delete()
          .eq('id', transaction.id);
      }
    } finally {
      setLoading(false);
    }
  }, [depositAmount, minDepositSettings, user]);

  const handleMoolreDeposit = useCallback(async (e) => {
    e.preventDefault();
    
    // If OTP is required, handle OTP submission
    if (moolreRequiresOtp && moolreOtpTransaction) {
      if (!moolreOtpCode || moolreOtpCode.trim() === '') {
        toast.error('Please enter the OTP code sent to your phone');
        return;
      }

      // Reset previous states
      setMoolreOtpVerified(false);
      setMoolreOtpError(null);
      setMoolreOtpVerifying(true);
      setLoading(true);

      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) throw new Error('Not authenticated');

        // Resubmit with OTP code
        const otpResponse = await fetch('/api/moolre-init', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            amount: moolreOtpTransaction.amount,
            currency: 'GHS',
            payer: moolreOtpTransaction.phoneNumber,
            reference: moolreOtpTransaction.moolreReference,
            channel: moolreOtpTransaction.channel,
            otpcode: moolreOtpCode.trim()
          })
        });

        if (!otpResponse.ok) {
          const errorData = await otpResponse.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || 'Failed to verify OTP');
        }

        const otpData = await otpResponse.json();

        // Debug: Log the response to understand its structure
        console.log('OTP verification response:', otpData);

        // Check if OTP was verified successfully
        // Handle multiple possible success indicators:
        // 1. code === '200_OTP_SUCCESS'
        // 2. success === true with otpVerified === true
        // 3. success === true with message containing "Verification Successful"
        const isOtpSuccess = 
          otpData.code === '200_OTP_SUCCESS' ||
          (otpData.success === true && otpData.otpVerified === true) ||
          (otpData.success === true && otpData.message && otpData.message.toLowerCase().includes('verification successful'));

        if (isOtpSuccess) {
          // OTP verified successfully - store verification in database for future transactions
          await storeMoolreVerification(moolreOtpTransaction.phoneNumber, moolreOtpTransaction.channel);
          
          // OTP verified successfully - automatically initiate payment
          setMoolreOtpVerifying(false);
          setMoolreOtpVerified(true);
          
          // Immediately initiate payment after OTP verification
          setMoolreOtpVerifying(true);
          setMoolreOtpVerified(false);

          try {
            const paymentResponse = await fetch('/api/moolre-init', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                amount: moolreOtpTransaction.amount,
                currency: 'GHS',
                payer: moolreOtpTransaction.phoneNumber,
                reference: moolreOtpTransaction.moolreReference,
                channel: moolreOtpTransaction.channel
              })
            });

            const paymentData = await paymentResponse.json();
            
            // Debug: Log the payment response to understand its structure
            console.log('Payment initiation response after OTP:', paymentData);
            
            if (!paymentResponse.ok) {
              const errorMsg = paymentData.error || paymentData.message || 'Failed to initiate payment after OTP verification';
              console.error('Payment initiation failed - Response not OK:', {
                status: paymentResponse.status,
                statusText: paymentResponse.statusText,
                data: paymentData
              });
              throw new Error(errorMsg);
            }
            
            if (!paymentData.success) {
              const errorMsg = paymentData.error || paymentData.message || 'Failed to initiate payment after OTP verification';
              console.error('Payment initiation failed - success is false:', paymentData);
              throw new Error(errorMsg);
            }

            // Payment prompt sent - handle multiple possible success codes
            // After OTP verification, the API might return 200_PAYMENT_REQ or other success codes
            // If success is true and no OTP is required, treat as payment initiated
            if (paymentData.code === '200_PAYMENT_REQ' || 
                (paymentData.success === true && !paymentData.requiresOtp && paymentData.code !== 'TP14')) {
              // Update transaction with Moolre reference
              const channelNames = { '13': 'MTN', '14': 'Vodafone', '15': 'AirtelTigo' };
              await supabase
                .from('transactions')
                .update({
                  moolre_reference: moolreOtpTransaction.moolreReference,
                  moolre_status: 'pending',
                  moolre_channel: channelNames[moolreOtpTransaction.channel] || 'MTN'
                })
                .eq('id', moolreOtpTransaction.id);

              // Reset all states
              setMoolreOtpVerifying(false);
              setMoolreOtpVerified(false);
              setMoolreOtpError(null);
              setMoolrePaymentStatus('waiting'); // Set status to waiting for payment approval
              toast.success('Payment prompt sent to your phone. Please approve the payment on your device.');
              setPendingTransaction(moolreOtpTransaction);
              setMoolreRequiresOtp(false);
              setMoolreOtpCode('');
              setMoolreOtpTransaction(null);
              setDepositAmount('');
              setMoolrePhoneNumber('');
              setMoolreChannel('13');
              setLoading(false);
              return;
            } else {
              // Log the unexpected response for debugging
              console.warn('Unexpected payment response after OTP:', {
                code: paymentData.code,
                success: paymentData.success,
                message: paymentData.message,
                data: paymentData.data
              });
              throw new Error(paymentData.error || paymentData.message || `Payment initiation did not complete successfully. Response code: ${paymentData.code || 'unknown'}`);
            }
          } catch (paymentError) {
            console.error('Error initiating payment after OTP verification:', paymentError);
            // Log full error details for debugging
            if (paymentError.response) {
              console.error('Payment error response:', paymentError.response);
            }
            throw paymentError;
          }
        } else if (otpData.code === '400_INVALID_OTP') {
          setMoolreOtpVerifying(false);
          setMoolreOtpError('Invalid OTP code. Please check and try again.');
          setMoolreOtpCode('');
          setLoading(false);
          toast.error('Invalid OTP code. Please check and try again.');
          return;
        } else {
          // Check if this is actually a success response that we missed
          // Sometimes the API might return success in different formats
          if (otpData.success === true || 
              (otpData.message && otpData.message.toLowerCase().includes('verification successful'))) {
            // Treat as success even if code doesn't match
            console.log('Treating response as success based on success flag or message');
            // OTP verified successfully - store verification in database for future transactions
            await storeMoolreVerification(moolreOtpTransaction.phoneNumber, moolreOtpTransaction.channel);
            // OTP verified successfully - automatically initiate payment
            setMoolreOtpVerifying(false);
            setMoolreOtpVerified(true);
            
            // Immediately initiate payment after OTP verification
            setMoolreOtpVerifying(true);
            setMoolreOtpVerified(false);

            try {
              const paymentResponse = await fetch('/api/moolre-init', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  amount: moolreOtpTransaction.amount,
                  currency: 'GHS',
                  payer: moolreOtpTransaction.phoneNumber,
                  reference: moolreOtpTransaction.moolreReference,
                  channel: moolreOtpTransaction.channel
                })
              });

              const paymentData = await paymentResponse.json();
              
              // Debug: Log the payment response to understand its structure
              console.log('Payment initiation response after OTP (fallback):', paymentData);
              
              if (!paymentResponse.ok) {
                const errorMsg = paymentData.error || paymentData.message || 'Failed to initiate payment after OTP verification';
                console.error('Payment initiation failed - Response not OK (fallback):', {
                  status: paymentResponse.status,
                  statusText: paymentResponse.statusText,
                  data: paymentData
                });
                throw new Error(errorMsg);
              }
              
              if (!paymentData.success) {
                const errorMsg = paymentData.error || paymentData.message || 'Failed to initiate payment after OTP verification';
                console.error('Payment initiation failed - success is false (fallback):', paymentData);
                throw new Error(errorMsg);
              }

              // Payment prompt sent - handle multiple possible success codes
              // After OTP verification, the API might return 200_PAYMENT_REQ or other success codes
              // If success is true and no OTP is required, treat as payment initiated
              if (paymentData.code === '200_PAYMENT_REQ' || 
                  (paymentData.success === true && !paymentData.requiresOtp && paymentData.code !== 'TP14')) {
                // Update transaction with Moolre reference
                const channelNames = { '13': 'MTN', '14': 'Vodafone', '15': 'AirtelTigo' };
                await supabase
                  .from('transactions')
                  .update({
                    moolre_reference: moolreOtpTransaction.moolreReference,
                    moolre_status: 'pending',
                    moolre_channel: channelNames[moolreOtpTransaction.channel] || 'MTN'
                  })
                  .eq('id', moolreOtpTransaction.id);

                // Reset all states
                setMoolreOtpVerifying(false);
                setMoolreOtpVerified(false);
                setMoolreOtpError(null);
                setMoolrePaymentStatus('waiting'); // Set status to waiting for payment approval
                toast.success('Payment prompt sent to your phone. Please approve the payment on your device.');
                setPendingTransaction(moolreOtpTransaction);
                setMoolreRequiresOtp(false);
                setMoolreOtpCode('');
                setMoolreOtpTransaction(null);
                setDepositAmount('');
                setMoolrePhoneNumber('');
                setMoolreChannel('13');
                setLoading(false);
                return;
              } else {
                // Log the unexpected response for debugging
                console.warn('Unexpected payment response after OTP (fallback):', {
                  code: paymentData.code,
                  success: paymentData.success,
                  message: paymentData.message,
                  data: paymentData.data
                });
                throw new Error(paymentData.error || paymentData.message || `Payment initiation did not complete successfully. Response code: ${paymentData.code || 'unknown'}`);
              }
            } catch (paymentError) {
              console.error('Error initiating payment after OTP verification:', paymentError);
              throw paymentError;
            }
          } else {
            // Only throw error if it's actually an error
            throw new Error(otpData.error || otpData.message || 'OTP verification failed');
          }
        }
      } catch (error) {
        console.error('Error submitting OTP:', error);
        setMoolreOtpVerifying(false);
        setMoolreOtpError(error.message || 'Failed to verify OTP. Please try again.');
        setLoading(false);
        toast.error(error.message || 'Failed to verify OTP. Please try again.');
      }
      return;
    }

    // Clear OTP error when user starts typing (handled in component)
    // Reset OTP states when switching away from OTP flow
    if (!moolreRequiresOtp) {
      setMoolreOtpVerifying(false);
      setMoolreOtpVerified(false);
      setMoolreOtpError(null);
    }
    
    // Reset payment status when switching away from Moolre or when no pending transaction
    if (depositMethod !== 'moolre' || !pendingTransaction) {
      setMoolrePaymentStatus(null);
    }

    // Regular payment flow (first time, no OTP)
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    const amount = parseFloat(depositAmount);
    if (amount < minDepositSettings.moolre_min) {
      toast.error(`Minimum deposit amount is ₵${minDepositSettings.moolre_min}`);
      return;
    }

    // Validate phone number
    const phoneNumber = moolrePhoneNumber || user?.phone_number || authUser?.user_metadata?.phone_number;
    if (!phoneNumber || phoneNumber.trim() === '') {
      toast.error('Please enter your Mobile Money number');
      return;
    }

    setLoading(true);
    let transaction = null;
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Not authenticated');

      // Phone number already validated above, use it
      const phoneNumber = moolrePhoneNumber || user?.phone_number || authUser.user_metadata?.phone_number;
      
      // Check if phone number + channel is already verified
      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      const isPhoneVerified = await checkMoolreVerification(normalizedPhone, moolreChannel);
      
      console.log('Moolre verification check:', {
        phoneNumber,
        normalizedPhone,
        channel: moolreChannel,
        isPhoneVerified
      });
      
      if (isPhoneVerified) {
        console.log('Phone number already verified, will skip OTP UI if Moolre requires it');
      }

      // Create transaction record for Moolre payment
      const { data: transactionData, error } = await supabase
        .from('transactions')
        .insert({
          user_id: authUser.id,
          amount: amount,
          type: 'deposit',
          status: 'pending',
          deposit_method: 'moolre'
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating Moolre deposit transaction:', error);
        throw error;
      }
      
      transaction = transactionData;

      // Generate unique reference for this transaction
      const moolreReference = `MOOLRE_${transaction.id}_${Date.now()}`;

      // Initialize Moolre payment via serverless function
      try {
        const initResponse = await fetch('/api/moolre-init', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            amount: amount,
            currency: 'GHS',
            payer: phoneNumber,
            reference: moolreReference,
            channel: moolreChannel // Channel code: 13=MTN, 14=Vodafone, 15=AirtelTigo
          })
        });

        if (!initResponse.ok) {
          const errorData = await initResponse.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || 'Failed to initialize Moolre payment');
        }

        const initData = await initResponse.json();

        console.log('Moolre API response:', {
          code: initData.code,
          requiresOtp: initData.requiresOtp,
          success: initData.success,
          isPhoneVerified,
          normalizedPhone,
          channel: moolreChannel
        });

        // Handle OTP requirement
        // IMPORTANT: Even if phone is verified in our DB, Moolre's API may still return TP14
        // This is because Moolre has its own verification system that's independent of ours
        // However, if phone is verified in our DB, we should still show OTP but log it as unexpected
        if (initData.requiresOtp && initData.code === 'TP14') {
          if (isPhoneVerified) {
            // Phone is verified in our DB but Moolre still requires OTP
            // This can happen if:
            // 1. Moolre's verification expired or was reset
            // 2. There's a mismatch in phone number format
            // 3. Moolre requires OTP for every transaction regardless of previous verification
            console.warn('⚠️ Phone verified in our DB but Moolre still requires OTP');
            console.warn('This may indicate:', {
              reason: 'Moolre has its own verification system that may require OTP each time',
              ourVerification: { normalizedPhone, channel: moolreChannel },
              suggestion: 'User will need to enter OTP again, but we will not store duplicate verification'
            });
            toast.info('OTP sent to your phone. Please enter the OTP code.');
            setMoolreRequiresOtp(true);
            setMoolreOtpTransaction({ 
              ...transaction, 
              moolreReference, 
              amount, 
              phoneNumber: normalizedPhone, // Store normalized phone for consistency
              channel: moolreChannel 
            });
            setLoading(false);
            return;
          } else {
            // OTP required and phone not verified - show OTP input UI
            console.log('OTP required for unverified phone - this is expected');
            toast.info('OTP sent to your phone. Please enter the OTP code.');
            // Store transaction and OTP state for resubmission
            // Store normalized phone to ensure consistency when storing verification
            setMoolreRequiresOtp(true);
            setMoolreOtpTransaction({ 
              ...transaction, 
              moolreReference, 
              amount, 
              phoneNumber: normalizedPhone, // Store normalized phone for consistency
              channel: moolreChannel 
            });
            setLoading(false);
            return;
          }
        }


        // Payment prompt sent successfully
        if (initData.success && initData.code === '200_PAYMENT_REQ') {
          // Update transaction with Moolre reference
          const channelNames = { '13': 'MTN', '14': 'Vodafone', '15': 'AirtelTigo' };
          await supabase
            .from('transactions')
            .update({
              moolre_reference: moolreReference,
              moolre_status: 'pending',
              moolre_channel: channelNames[moolreChannel] || 'MTN'
            })
            .eq('id', transaction.id);

          setMoolrePaymentStatus('waiting'); // Set status to waiting for payment approval
          toast.success('Payment prompt sent to your phone. Please approve the payment on your device.');
          setPendingTransaction(transaction);
          setDepositAmount('');
          setMoolrePhoneNumber('');
          setMoolreChannel('13'); // Reset to default
          setLoading(false);
          
          // Start polling for payment status
          return;
        }

        // If we get here, something unexpected happened
        throw new Error(initData.error || initData.message || 'Failed to initialize payment');

      } catch (initError) {
        console.error('Error initializing Moolre payment:', initError);
        toast.error(initError.message || 'Failed to initialize payment. Please try again or use another payment method.');
        setLoading(false);
        
        // Update transaction to rejected
        if (transaction?.id) {
          supabase
            .from('transactions')
            .update({
              status: 'rejected',
              moolre_reference: moolreReference,
              moolre_status: 'failed',
              moolre_error: initError.message || 'Initialization failed'
            })
            .eq('id', transaction.id)
            .then(() => {
              // Update successful
            })
            .catch((updateError) => {
              console.error('Error updating transaction:', updateError);
            });
        }
      }

    } catch (error) {
      console.error('Moolre deposit error:', error);
      toast.error(error.message || 'Failed to initialize Moolre payment. Please try again.');
      setLoading(false);
      
      // Update transaction to rejected if it was created
      if (transaction?.id) {
        supabase
          .from('transactions')
          .update({
            status: 'rejected',
            moolre_status: 'failed',
            moolre_error: error.message || 'Initialization failed'
          })
          .eq('id', transaction.id)
          .then(() => {
            // Update successful
          })
          .catch((updateError) => {
            console.error('Error updating transaction:', updateError);
          });
      }
    }
  }, [depositAmount, moolrePhoneNumber, moolreChannel, moolreOtpCode, moolreRequiresOtp, moolreOtpTransaction, minDepositSettings.moolre_min, onUpdateUser, user]);

  const handleDeposit = useCallback(async (e) => {
    e.preventDefault();
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    const amount = parseFloat(depositAmount);
    if (amount < minDepositSettings.paystack_min) {
      toast.error(`Minimum deposit amount is ₵${minDepositSettings.paystack_min}`);
      return;
    }

    setLoading(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Not authenticated');

      // First, verify profile exists (required for foreign key)
      // Handle 500 errors gracefully - profile might exist but RLS is blocking
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', authUser.id)
        .single();

      if (profileError) {
        // If it's a 500 error, the profile likely exists but RLS is blocking
        if (profileError.message?.includes('500') || 
            profileError.message?.includes('Internal Server Error') ||
            profileError.message?.includes('Response body')) {
          console.warn('Profile check returned 500 - likely RLS issue. Proceeding with transaction creation...');
          // Continue anyway - the transaction insert will fail with a clearer error if profile doesn't exist
        } else if (profileError.code === 'PGRST116') {
          // Profile doesn't exist - try to create it
          console.log('Profile not found, attempting to create...');
          const { error: createProfileError } = await supabase
            .from('profiles')
            .insert({
              id: authUser.id,
              email: authUser.email || '',
              name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
              balance: 0.0,
              role: 'user'
            });

          if (createProfileError) {
            // 409 means profile already exists (race condition or RLS issue)
            if (createProfileError.code === '23505' || createProfileError.message?.includes('409')) {
              console.log('Profile already exists (409 conflict). Proceeding...');
              // Profile exists, continue
            } else {
              console.error('Profile creation failed:', createProfileError);
              toast.error('Cannot create profile. Please run FIX_RLS_POLICIES.sql in Supabase SQL Editor.');
              return;
            }
          } else {
            toast.success('Profile created!');
          }
        } else {
          console.error('Profile check error:', profileError);
          toast.error('Database error: Please run FIX_RLS_POLICIES.sql in Supabase SQL Editor.');
          return;
        }
      }

      // Check for existing pending transactions for this amount (prevent duplicates)
      // Also check for approved transactions with same amount (webhook might have processed it)
      const { data: existingPending, error: checkPendingError } = await supabase
        .from('transactions')
        .select('id, status, amount, created_at, paystack_reference')
        .eq('user_id', authUser.id)
        .eq('type', 'deposit')
        .in('status', ['pending', 'approved'])
        .eq('amount', amount)
        .eq('deposit_method', 'paystack')
        .order('created_at', { ascending: false })
        .limit(1);

      // If there's a recent transaction (within last 5 minutes), reuse it
      if (!checkPendingError && existingPending && existingPending.length > 0) {
        const existingTx = existingPending[0];
        const txAge = Date.now() - new Date(existingTx.created_at).getTime();
        const fiveMinutes = 5 * 60 * 1000;
        
        if (txAge < fiveMinutes) {
          console.log('Reusing existing transaction:', {
            transactionId: existingTx.id,
            status: existingTx.status,
            hasReference: !!existingTx.paystack_reference
          });
          setPendingTransaction({
            id: existingTx.id,
            amount: existingTx.amount,
            user_id: authUser.id
          });
          setDepositAmount('');
          setLoading(false);
          return; // Don't create a new transaction, reuse the existing one
        }
      }

      // Create new transaction record
      const { data: transaction, error } = await supabase
        .from('transactions')
        .insert({
        user_id: authUser.id,
          amount: amount,
        type: 'deposit',
        status: 'pending',
        deposit_method: 'paystack'
        })
        .select()
        .single();

      if (error) {
        // Log the full error for debugging
        console.error('Transaction insert error:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          fullError: error
        });

        // Handle specific error cases
        const errorMessage = error.message || '';
        const errorCode = error.code || '';
        const errorDetails = error.details || '';
        
        // Check for 500 errors or database issues
        if (errorCode === 'PGRST301' || 
            errorMessage.includes('500') || 
            errorMessage.includes('Internal Server Error') ||
            errorDetails.includes('500')) {
          console.error('Transaction table error - 500:', error);
          toast.error('Database error: Transactions table may not exist. Please run SUPABASE_DATABASE_SETUP.sql in Supabase SQL Editor.');
          return;
        }
        
        // Foreign key constraint error
        if (errorCode === '23503' || errorMessage.includes('foreign key')) {
          toast.error('User profile not found. Please ensure your profile exists in the database.');
          return;
        }
        
        // Permission/RLS errors
        if (errorCode === '42501' || errorMessage.includes('permission') || errorMessage.includes('policy')) {
          toast.error('Permission denied: RLS policies may not be set up correctly. Please run SUPABASE_DATABASE_SETUP.sql');
          return;
        }
        
        // Network or connection errors
        if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
          toast.error('Network error: Please check your internet connection and try again.');
          return;
        }
        
        // Generic error
        toast.error(errorMessage || 'Failed to create transaction. Please try again.');
        return;
      }

      // Store transaction - useEffect will trigger payment
      setPendingTransaction(transaction);
    } catch (error) {
      console.error('Deposit error (catch block):', error);
      const errorMessage = error.message || '';
      const errorDetails = error.details || '';
      
      // Handle "Response body already used" - this is usually masking a 500 error
      if (errorMessage.includes('Response body is already used') || 
          errorMessage.includes('clone') ||
          errorDetails.includes('Response body is already used')) {
        toast.error('Database setup required: Please run SUPABASE_DATABASE_SETUP.sql in your Supabase SQL Editor.');
        console.error('Underlying error (likely 500): Check browser Network tab or Supabase logs');
        return;
      }
      
      // Handle other error types
      if (errorMessage.includes('500') || errorMessage.includes('Internal Server Error')) {
        toast.error('Database error: Please ensure all tables are created. Run SUPABASE_DATABASE_SETUP.sql');
      } else if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
        toast.error('Network error: Please check your connection and try again.');
      } else if (errorMessage) {
        toast.error(errorMessage);
      } else {
        toast.error('Failed to initialize payment. Please try again.');
      }
      
      setPendingTransaction(null);
    } finally {
      setLoading(false);
    }
  }, [depositAmount, minDepositSettings.paystack_min, onUpdateUser]);

  const handleOrder = useCallback(async (e) => {
    e.preventDefault();
    if ((!orderForm.service_id && !orderForm.package_id) || !orderForm.link) {
      toast.error('Please fill all fields');
      return;
    }

    setLoading(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Not authenticated');

      // Check if this is a promotion package order
      if (orderForm.package_id) {
        const pkg = promotionPackages.find(p => p.id === orderForm.package_id);
        if (!pkg) throw new Error('Promotion package not found');

        // Use fixed quantity and price from package
        const quantity = pkg.quantity;
        const totalCost = pkg.price;

        // Check balance (use displayUser to allow immediate orders after deposit)
        if (displayUser.balance < totalCost) {
          throw new Error('Insufficient balance');
        }

        // Place order via SMMGen API if package has SMMGen ID
        let smmgenOrderId = null;
        if (pkg.smmgen_service_id) {
          console.log('Attempting to place SMMGen order for package:', {
            serviceId: pkg.smmgen_service_id,
            link: orderForm.link,
            quantity: quantity
          });
          
          try {
            const smmgenResponse = await placeSMMGenOrder(
              pkg.smmgen_service_id,
              orderForm.link,
              quantity
            );
            
            console.log('SMMGen API response for package:', smmgenResponse);
            
            if (smmgenResponse === null) {
              console.warn('SMMGen returned null - backend unavailable or not configured');
            } else if (smmgenResponse) {
              smmgenOrderId = smmgenResponse.order || 
                             smmgenResponse.order_id || 
                             smmgenResponse.orderId || 
                             smmgenResponse.id || 
                             null;
              console.log('SMMGen order response for package:', smmgenResponse);
              console.log('SMMGen order ID extracted:', smmgenOrderId);
            }
          } catch (smmgenError) {
            console.error('SMMGen order error caught for package:', smmgenError);
            if (!smmgenError.message?.includes('Failed to fetch') && 
                !smmgenError.message?.includes('ERR_CONNECTION_REFUSED') &&
                !smmgenError.message?.includes('Backend proxy server not running')) {
              console.error('SMMGen order failed for package:', smmgenError);
            }
          }
          
          if (smmgenOrderId === null) {
            smmgenOrderId = "order not placed at smm gen";
            console.log('SMMGen order failed for package - setting failure message:', smmgenOrderId);
          } else {
            console.log('SMMGen order successful for package - order ID:', smmgenOrderId);
          }
        } else {
          console.log('Package does not have SMMGen service ID - skipping SMMGen order placement');
          smmgenOrderId = "order not placed at smm gen";
        }

        // Create order record
        const { data: orderData, error: orderError } = await supabase.from('orders').insert({
          user_id: authUser.id,
          service_id: null, // No service_id for package orders
          promotion_package_id: pkg.id,
          link: orderForm.link,
          quantity: quantity,
          total_cost: totalCost,
          status: 'pending',
          smmgen_order_id: smmgenOrderId
        }).select('*').single();

        if (orderError) {
          console.error('Error creating order:', orderError);
          throw orderError;
        }
        
        console.log('Package order created successfully:', orderData);

        // Deduct balance (use displayUser to reflect optimistic balance)
        const newBalanceAfterOrder = displayUser.balance - totalCost;
        const { error: balanceError } = await supabase
          .from('profiles')
          .update({ balance: newBalanceAfterOrder })
          .eq('id', authUser.id);

        if (balanceError) throw balanceError;
        
        // Update optimistic balance immediately
        setOptimisticBalance(newBalanceAfterOrder);

        // Record transaction
        const { error: transactionError } = await supabase
          .from('transactions')
          .insert({
            user_id: authUser.id,
            amount: totalCost,
            type: 'order',
            status: 'approved',
            order_id: orderData.id
          });

        if (transactionError) {
          console.warn('Failed to create transaction record for package order:', transactionError);
        }

        // Show success immediately
        toast.success('Package order placed successfully!');
        setOrderForm({ service_id: '', package_id: '', link: '', quantity: '' });
        
        // Refresh user data and orders in background (non-blocking)
        onUpdateUser(); // Don't await - let it run in background
        // Fetch orders after a short delay in background
        setTimeout(() => {
          fetchRecentOrders().catch((error) => {
            console.error('Error fetching recent orders:', error);
          });
        }, 300);
        return;
      }

      // Regular service order handling (existing code)
      if (!orderForm.quantity) {
        toast.error('Please fill all fields');
        return;
      }

      // Get service details from local state (from SMMGen or Supabase)
      const service = services.find(s => s.id === orderForm.service_id);
      if (!service) throw new Error('Service not found');

      // Validate quantity
      const quantity = parseInt(orderForm.quantity);
      if (quantity < service.min_quantity || quantity > service.max_quantity) {
        throw new Error(`Quantity must be between ${service.min_quantity} and ${service.max_quantity}`);
      }

      // Handle combo services
      if (service.is_combo && service.combo_service_ids && service.combo_service_ids.length > 0) {
        // Get component services
        const componentServices = service.combo_service_ids
          .map(serviceId => services.find(s => s.id === serviceId))
          .filter(s => s !== undefined);

        if (componentServices.length === 0) {
          throw new Error('Combo service components not found');
        }

        // Calculate total cost for all component services
        let totalCost = 0;
        const orderPromises = [];
        const smmgenServiceIds = service.combo_smmgen_service_ids || [];

        for (let i = 0; i < componentServices.length; i++) {
          const componentService = componentServices[i];
          const componentCost = (quantity / 1000) * componentService.rate;
          totalCost += componentCost;

          // Place SMMGen order if service has SMMGen ID
          let smmgenOrderId = null;
          const smmgenServiceId = smmgenServiceIds[i] || componentService.smmgen_service_id;
          
          if (smmgenServiceId) {
            console.log(`Attempting to place SMMGen order for ${componentService.name}:`, {
              serviceId: smmgenServiceId,
              link: orderForm.link,
              quantity: quantity
            });
            
            try {
              const smmgenResponse = await placeSMMGenOrder(
                smmgenServiceId,
                orderForm.link,
                quantity
              );
              
              console.log(`SMMGen API response for ${componentService.name}:`, smmgenResponse);
              
              if (smmgenResponse === null) {
                console.warn(`SMMGen returned null for ${componentService.name} - backend unavailable or not configured`);
                // Mark as failure since we attempted but couldn't place the order
              } else if (smmgenResponse) {
                // SMMGen API might return order ID in different fields
                smmgenOrderId = smmgenResponse.order || 
                               smmgenResponse.order_id || 
                               smmgenResponse.orderId || 
                               smmgenResponse.id || 
                               null;
                console.log(`SMMGen order response for ${componentService.name}:`, smmgenResponse);
                console.log(`SMMGen order ID extracted:`, smmgenOrderId);
              }
            } catch (smmgenError) {
              console.error(`SMMGen order error caught for ${componentService.name}:`, smmgenError);
              if (!smmgenError.message?.includes('Failed to fetch') && 
                  !smmgenError.message?.includes('ERR_CONNECTION_REFUSED') &&
                  !smmgenError.message?.includes('Backend proxy server not running')) {
                console.error(`SMMGen order failed for ${componentService.name}:`, smmgenError);
              }
              // Continue with local order creation
            }
            
            // If SMMGen service ID exists but order failed (smmgenOrderId is still null), set failure message
            if (smmgenOrderId === null) {
              smmgenOrderId = "order not placed at smm gen";
              console.log(`SMMGen order failed for ${componentService.name} - setting failure message:`, smmgenOrderId);
            } else {
              console.log(`SMMGen order successful for ${componentService.name} - order ID:`, smmgenOrderId);
            }
          } else {
            console.log(`Component service ${componentService.name} does not have SMMGen service ID - skipping SMMGen order placement`);
            // Set failure message to prevent database trigger from overwriting with order ID
            smmgenOrderId = "order not placed at smm gen";
          }

          // Create order record for this component
          orderPromises.push(
            supabase.from('orders').insert({
              user_id: authUser.id,
              service_id: componentService.id,
              link: orderForm.link,
              quantity: quantity,
              total_cost: componentCost,
              status: 'pending',
              smmgen_order_id: smmgenOrderId // Store SMMGen order ID for tracking
            }).select('*').single()
          );
        }

        // Check balance (use displayUser to allow immediate orders after deposit)
        if (displayUser.balance < totalCost) {
          throw new Error('Insufficient balance');
        }

        // Create all orders
        const orderResults = await Promise.all(orderPromises);
        const orderErrors = orderResults.filter(r => r.error);
        
        if (orderErrors.length > 0) {
          throw new Error(`Failed to create some orders: ${orderErrors[0].error.message}`);
        }

        // Deduct balance (use displayUser to reflect optimistic balance)
        const newBalanceAfterOrder = displayUser.balance - totalCost;
        const { error: balanceError } = await supabase
          .from('profiles')
          .update({ balance: newBalanceAfterOrder })
          .eq('id', authUser.id);

        if (balanceError) throw balanceError;
        
        // Update optimistic balance immediately
        setOptimisticBalance(newBalanceAfterOrder);

        // Record transaction for combo order (balance subtraction)
        // Create one transaction record for the total cost
        const { error: transactionError } = await supabase
          .from('transactions')
          .insert({
            user_id: authUser.id,
            amount: totalCost,
            type: 'order',
            status: 'approved', // Order transactions are immediately approved when balance is deducted
            order_id: orderResults[0]?.data?.id || null // Link to first order in combo
          });

        if (transactionError) {
          console.warn('Failed to create transaction record for combo order:', transactionError);
          // Don't fail the order if transaction record fails, but log it
        }

        toast.success(`Combo order placed successfully! ${componentServices.length} orders created.`);
        setOrderForm({ service_id: '', link: '', quantity: '' });
        await onUpdateUser();
        fetchRecentOrders().catch((error) => {
          console.error('Error fetching recent orders:', error);
        });
        return;
      }

      // Regular (non-combo) service handling
      // Calculate cost
      const totalCost = (quantity / 1000) * service.rate;

      // Check balance (use displayUser to allow immediate orders after deposit)
      if (displayUser.balance < totalCost) {
        throw new Error('Insufficient balance');
      }

      // Place order via SMMGen API if service has SMMGen ID
      let smmgenOrderId = null;
      if (service.smmgen_service_id) {
        console.log('Attempting to place SMMGen order:', {
          serviceId: service.smmgen_service_id,
          link: orderForm.link,
          quantity: quantity
        });
        
        try {
          const smmgenResponse = await placeSMMGenOrder(
            service.smmgen_service_id,
            orderForm.link,
            quantity
          );
          
          console.log('SMMGen API response received:', smmgenResponse);
          
          // If SMMGen returns null, it means backend is not available (graceful skip)
          if (smmgenResponse === null) {
            console.warn('SMMGen returned null - backend unavailable or not configured');
            // Mark as failure since we attempted but couldn't place the order
          } else if (smmgenResponse) {
            // SMMGen API might return order ID in different fields
            // Common formats: { order: "12345" }, { id: "12345" }, { order_id: "12345" }, { orderId: "12345" }
            smmgenOrderId = smmgenResponse.order || 
                           smmgenResponse.order_id || 
                           smmgenResponse.orderId || 
                           smmgenResponse.id || 
                           null;
            console.log('SMMGen order response:', smmgenResponse);
            console.log('SMMGen order ID extracted:', smmgenOrderId);
          }
        } catch (smmgenError) {
          console.error('SMMGen order error caught:', smmgenError);
          // Only log actual API errors, not connection failures (which are handled gracefully)
          if (!smmgenError.message?.includes('Failed to fetch') && 
              !smmgenError.message?.includes('ERR_CONNECTION_REFUSED') &&
              !smmgenError.message?.includes('Backend proxy server not running')) {
            console.error('SMMGen order failed:', smmgenError);
            
            // If SMMGen API key is not configured, continue with local order only
            if (smmgenError.message?.includes('API key not configured')) {
              toast.warning('SMMGen API not configured. Order created locally.');
            } else {
              // For other SMMGen errors, still create the order locally
              toast.warning(`SMMGen order failed: ${smmgenError.message}. Order created locally.`);
            }
          }
          // Continue with local order creation even if SMMGen fails
        }
        
        // If SMMGen service ID exists but order failed (smmgenOrderId is still null), set failure message
        if (smmgenOrderId === null) {
          smmgenOrderId = "order not placed at smm gen";
          console.log('SMMGen order failed - setting failure message:', smmgenOrderId);
        } else {
          console.log('SMMGen order successful - order ID:', smmgenOrderId);
        }
      } else {
        console.log('Service does not have SMMGen service ID - skipping SMMGen order placement');
        // Set failure message to prevent database trigger from overwriting with order ID
        smmgenOrderId = "order not placed at smm gen";
      }

      // Create order record in our database
      console.log('Creating order with SMMGen ID:', smmgenOrderId);
      console.log('SMMGen ID type:', typeof smmgenOrderId);
      console.log('SMMGen ID value before insert:', JSON.stringify(smmgenOrderId));
      
      const { data: orderData, error: orderError } = await supabase.from('orders').insert({
        user_id: authUser.id,
        service_id: orderForm.service_id,
        link: orderForm.link,
        quantity: quantity,
        total_cost: totalCost,
        status: 'pending',
        smmgen_order_id: smmgenOrderId // Store SMMGen order ID for tracking
      }).select('*').single();

      if (orderError) {
        console.error('Error creating order:', orderError);
        throw orderError;
      }
      
      console.log('Order created successfully:', orderData);
      console.log('Order SMMGen ID in database:', orderData.smmgen_order_id);

      // Deduct balance (use displayUser to reflect optimistic balance)
      const newBalanceAfterOrder = displayUser.balance - totalCost;
      const { error: balanceError } = await supabase
        .from('profiles')
        .update({ balance: newBalanceAfterOrder })
        .eq('id', authUser.id);

      if (balanceError) throw balanceError;
      
      // Update optimistic balance immediately
      setOptimisticBalance(newBalanceAfterOrder);

      // Record transaction for order (balance subtraction)
      const { error: transactionError } = await supabase
        .from('transactions')
        .insert({
          user_id: authUser.id,
          amount: totalCost,
          type: 'order',
          status: 'approved', // Order transactions are immediately approved when balance is deducted
          order_id: orderData.id
        });

      if (transactionError) {
        console.warn('Failed to create transaction record for order:', transactionError);
        // Don't fail the order if transaction record fails, but log it
      }

      toast.success('Order placed successfully!');
      setOrderForm({ service_id: '', package_id: '', link: '', quantity: '' });
      await onUpdateUser();
      // Wait a moment for database to sync, then refresh orders
      await new Promise(resolve => setTimeout(resolve, 500));
      await fetchRecentOrders().catch((error) => {
        console.error('Error fetching recent orders:', error);
      });
    } catch (error) {
      toast.error(error.message || 'Failed to place order');
    } finally {
      setLoading(false);
    }
  }, [orderForm, services, promotionPackages, displayUser, fetchRecentOrders, onUpdateUser]);

  return (
    <div className="min-h-screen bg-gray-50">
      <SEO
        title="Dashboard"
        description="Manage your BoostUp GH account, place orders, and track your social media growth"
        canonical="/dashboard"
        noindex={true}
      />
      <Navbar user={displayUser} onLogout={onLogout} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 md:pt-6 pb-6 sm:pb-8">
        {/* Welcome Section */}
        <div className="mb-6 sm:mb-8 animate-fadeIn">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">Welcome back, {displayUser.name}!</h1>
          <p className="text-sm sm:text-base text-gray-600">Manage your orders and grow your social presence</p>
        </div>

        {/* Stats Cards */}
        <DashboardStats user={displayUser} orderCount={recentOrders.length} />

        {/* Promotion Packages Section */}
        {promotionPackages.length > 0 && (
          <div className="mb-6 sm:mb-8">
            <DashboardPromotionPackages
              packages={promotionPackages}
              onPackageSelect={(pkg) => {
                setOrderForm({
                  service_id: '',
                  package_id: pkg.id,
                  link: '',
                  quantity: pkg.quantity.toString()
                });
                // Scroll to order form
                setTimeout(() => {
                  const orderFormSection = document.getElementById('order-form-section');
                  if (orderFormSection) {
                    orderFormSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }, 100);
              }}
              user={displayUser}
            />
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6 lg:gap-8">
          {/* Add Funds */}
          <DashboardDeposit
            depositMethod={depositMethod}
            setDepositMethod={setDepositMethod}
            depositAmount={depositAmount}
            setDepositAmount={setDepositAmount}
            paymentMethodSettings={paymentMethodSettings}
            manualDepositForm={manualDepositForm}
            setManualDepositForm={setManualDepositForm}
            uploadingProof={uploadingProof}
            handleDeposit={handleDeposit}
            handleManualDeposit={handleManualDeposit}
            handleHubtelDeposit={handleHubtelDeposit}
            handleKorapayDeposit={handleKorapayDeposit}
            handleMoolreDeposit={handleMoolreDeposit}
            handleMoolreWebDeposit={handleMoolreWebDeposit}
            moolrePhoneNumber={moolrePhoneNumber}
            setMoolrePhoneNumber={setMoolrePhoneNumber}
            moolreChannel={moolreChannel}
            setMoolreChannel={setMoolreChannel}
            moolreOtpCode={moolreOtpCode}
            setMoolreOtpCode={(value) => {
              setMoolreOtpCode(value);
              // Clear error when user starts typing
              if (moolreOtpError) {
                setMoolreOtpError(null);
              }
            }}
            moolreRequiresOtp={moolreRequiresOtp}
            moolreOtpVerifying={moolreOtpVerifying}
            moolreOtpVerified={moolreOtpVerified}
            moolreOtpError={moolreOtpError}
            moolrePaymentStatus={moolrePaymentStatus}
            loading={loading || isPollingDeposit}
            isPollingDeposit={isPollingDeposit}
            pendingTransaction={pendingTransaction}
            manualDepositDetails={manualDepositDetails}
          />

          {/* Quick Order */}
          <DashboardOrderForm
            services={services}
            packages={promotionPackages}
            orderForm={orderForm}
            setOrderForm={setOrderForm}
            handleOrder={handleOrder}
            loading={loading}
          />
        </div>

        {/* Recent Orders */}
        <DashboardOrders orders={recentOrders} services={services} />

        {/* Referral Section */}
        <div className="mt-6 sm:mt-8 animate-slideUp">
          <ReferralSection user={displayUser} />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
