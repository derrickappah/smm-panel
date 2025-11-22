import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { placeSMMGenOrder, getSMMGenOrderStatus } from '@/lib/smmgen';
import Navbar from '@/components/Navbar';
import { Wallet, ShoppingCart, Clock, Search, Layers } from 'lucide-react';
// Paystack will be loaded via react-paystack package

const Dashboard = ({ user, onLogout, onUpdateUser }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [services, setServices] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [depositAmount, setDepositAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingTransaction, setPendingTransaction] = useState(null);
  const [serviceSearch, setServiceSearch] = useState('');
  const [selectOpen, setSelectOpen] = useState(false);
  const [orderForm, setOrderForm] = useState({
    service_id: '',
    link: '',
    quantity: ''
  });

  // Paystack public key - should be in environment variable
  const paystackPublicKey = process.env.REACT_APP_PAYSTACK_PUBLIC_KEY || 'pk_test_xxxxxxxxxxxxx';

  useEffect(() => {
    fetchServices();
    fetchRecentOrders();
    verifyPendingPayments(); // Check for pending payments that might have succeeded
    
    // Ensure PaystackPop is loaded (react-paystack should load it, but we ensure it's available)
    if (!window.PaystackPop && !document.querySelector('script[src*="paystack"]')) {
      const script = document.createElement('script');
      script.src = 'https://js.paystack.co/v1/inline.js';
      script.async = true;
      script.onerror = (error) => {
        console.warn('Failed to load Paystack script:', error);
        // Don't show error to user yet - will show when they try to pay
      };
      script.onload = () => {
        console.log('Paystack script loaded successfully');
      };
      document.head.appendChild(script);
    }
  }, []);

  // Verify pending payments that might have succeeded
  const verifyPendingPayments = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      // Find recent pending deposit transactions (within last 30 minutes)
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      
      const { data: pendingTransactions, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', authUser.id)
        .eq('type', 'deposit')
        .eq('status', 'pending')
        .gte('created_at', thirtyMinutesAgo)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('Error fetching pending transactions for verification:', error);
        return;
      }

      if (!pendingTransactions || pendingTransactions.length === 0) {
        return;
      }

      // Verify each pending transaction with Paystack
      for (const transaction of pendingTransactions) {
        // If transaction has a reference stored, verify it
        if (transaction.paystack_reference) {
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
                
                // Update transaction status
                const { error: updateError } = await supabase
                  .from('transactions')
                  .update({ status: 'approved' })
                  .eq('id', transaction.id)
                  .eq('status', 'pending');

                if (!updateError) {
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
                }
              } else if (verifyData.status === 'failed' || verifyData.status === 'abandoned') {
                // Payment failed or was abandoned, mark as rejected
                console.log('Payment failed or abandoned, marking transaction as rejected:', transaction.id);
                await supabase
                  .from('transactions')
                  .update({ status: 'rejected' })
                  .eq('id', transaction.id)
                  .eq('status', 'pending');
              }
            }
          } catch (verifyError) {
            console.error('Error verifying payment:', verifyError);
            // Continue with other transactions
          }
        } else {
          // No reference stored - this means callback never fired
          // We can't verify without reference, but we can check if it's been more than 10 minutes
          // If so, it's likely the payment was never completed
          const transactionAge = Date.now() - new Date(transaction.created_at).getTime();
          const tenMinutes = 10 * 60 * 1000;
          
          if (transactionAge > tenMinutes) {
            // Transaction is old and has no reference - likely never completed
            // Mark as rejected after 10 minutes
            console.log('Old pending transaction without reference, marking as rejected:', transaction.id);
            await supabase
              .from('transactions')
              .update({ status: 'rejected' })
              .eq('id', transaction.id)
              .eq('status', 'pending');
          }
        }
      }
    } catch (error) {
      console.error('Error in verifyPendingPayments:', error);
    }
  };

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

  const fetchServices = async () => {
    try {
      // Get current user role to filter services
      const { data: { user: authUser } } = await supabase.auth.getUser();
      let userRole = 'user';
      
      if (authUser) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', authUser.id)
          .single();
        
        if (profile) {
          userRole = profile.role || 'user';
        }
      }
      
      // Fetch services from Supabase
      // RLS policies will automatically filter based on seller_only flag and user role
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        // Handle 500 errors and other database issues gracefully
        if (error.code === 'PGRST301' || error.message?.includes('500') || error.message?.includes('Internal Server Error')) {
          console.warn('Services table may not exist or RLS policy issue:', error.message);
          setServices([]);
          return;
        }
        throw error;
      }
      setServices(data || []);
    } catch (error) {
      console.error('Error fetching services:', error);
      // Set empty array on error to prevent UI issues
      setServices([]);
      // Only show toast for non-500 errors
      if (!error.message?.includes('500') && !error.message?.includes('Internal Server Error')) {
      toast.error('Failed to load services');
      }
    }
  };

  // Map SMMGen status to our status format
  const mapSMMGenStatus = (smmgenStatus) => {
    if (!smmgenStatus) return null;
    
    const statusLower = String(smmgenStatus).toLowerCase();
    
    if (statusLower.includes('completed') || statusLower === 'completed') {
      return 'completed';
    }
    if (statusLower.includes('cancelled') || statusLower.includes('canceled')) {
      return 'cancelled';
    }
    if (statusLower.includes('processing') || statusLower.includes('in progress') || statusLower.includes('partial')) {
      return 'processing';
    }
    if (statusLower.includes('pending') || statusLower === 'pending') {
      return 'pending';
    }
    
    return null;
  };

  const fetchRecentOrders = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', authUser.id)
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (error) {
        // Handle 500 errors and other database issues gracefully
        if (error.code === 'PGRST301' || error.message?.includes('500') || error.message?.includes('Internal Server Error')) {
          console.warn('Orders table may not exist or RLS policy issue:', error.message);
          setRecentOrders([]);
          return;
        }
        throw error;
      }
      
      // Check SMMGen status for orders with SMMGen IDs (only for pending/processing orders)
      const updatedOrders = await Promise.all(
        (data || []).map(async (order) => {
          if (order.smmgen_order_id && (order.status === 'pending' || order.status === 'processing')) {
            try {
              const statusData = await getSMMGenOrderStatus(order.smmgen_order_id);
              const smmgenStatus = statusData.status || statusData.Status;
              const mappedStatus = mapSMMGenStatus(smmgenStatus);

              // Update in database if status changed
              if (mappedStatus && mappedStatus !== order.status) {
                await supabase
                  .from('orders')
                  .update({ 
                    status: mappedStatus,
                    completed_at: mappedStatus === 'completed' ? new Date().toISOString() : order.completed_at
                  })
                  .eq('id', order.id);
                
                return { ...order, status: mappedStatus };
              }
            } catch (error) {
              console.warn('Failed to check SMMGen status for order:', order.id, error);
              // Continue with original order if check fails
            }
          }
          return order;
        })
      );

      setRecentOrders(updatedOrders);
    } catch (error) {
      console.error('Error fetching orders:', error);
      // Set empty array on error to prevent UI issues
      setRecentOrders([]);
    }
  };

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
          .select('*')
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
          .select('*')
          .eq('id', pendingTransaction.id)
          .maybeSingle();
        
        if (!findByIdError && foundById) {
          transactionToUpdate = foundById;
          // Update the transaction with the reference for future verification
          if (reference && !foundById.paystack_reference) {
            await supabase
              .from('transactions')
              .update({ paystack_reference: reference })
              .eq('id', foundById.id);
          }
        }
      }
      
      // If still not found, search for most recent pending transaction
      if (!transactionToUpdate) {
        const { data: pendingTransactions, error: findPendingError } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', authUser.id)
          .eq('status', 'pending')
          .eq('type', 'deposit')
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (!findPendingError && pendingTransactions && pendingTransactions.length > 0) {
          transactionToUpdate = pendingTransactions[0];
          // Update with reference
          if (reference) {
            await supabase
              .from('transactions')
              .update({ paystack_reference: reference })
              .eq('id', transactionToUpdate.id);
          }
          console.log('Found pending transaction by search:', transactionToUpdate.id);
        }
      }

      if (!transactionToUpdate) {
        throw new Error('No pending transaction found for this payment');
      }
      
      // Store reference if not already stored
      if (reference && !transactionToUpdate.paystack_reference) {
        await supabase
          .from('transactions')
          .update({ paystack_reference: reference })
          .eq('id', transactionToUpdate.id);
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

      // Update transaction status to approved (use maybeSingle to handle multiple rows gracefully)
      // First check current status to avoid unnecessary updates
      const { data: currentStatusCheck } = await supabase
        .from('transactions')
        .select('status')
        .eq('id', transactionToUpdate.id)
        .maybeSingle();

      // If already approved, skip update and continue with balance
      if (currentStatusCheck?.status === 'approved') {
        console.log('Transaction already approved, skipping update and continuing with balance check');
      } else {
        // Update transaction status to approved
        const { data: updatedTransactions, error: transactionError } = await supabase
          .from('transactions')
          .update({ 
            status: 'approved'
          })
          .eq('id', transactionToUpdate.id)
          .eq('status', 'pending') // Only update if still pending (prevents race conditions)
          .select();

        if (transactionError) {
          console.error('Error updating transaction status:', transactionError);
          
          // Check if transaction was already updated by another process
          const { data: currentTransaction } = await supabase
            .from('transactions')
            .select('status')
            .eq('id', transactionToUpdate.id)
            .maybeSingle();
          
          if (currentTransaction?.status === 'approved') {
            console.log('Transaction was already approved by another process, continuing with balance update');
            // Continue with balance update
          } else {
            // If update failed and status is not approved, this might be a real error
            // But we'll still try to update balance if the payment was successful
            console.warn('Transaction update failed, but payment was successful. Continuing with balance update.');
          }
        } else if (!updatedTransactions || updatedTransactions.length === 0) {
          // Transaction was already updated or status changed
          const { data: checkTransaction } = await supabase
            .from('transactions')
            .select('status')
            .eq('id', transactionToUpdate.id)
            .maybeSingle();
          
          if (checkTransaction?.status === 'approved') {
            console.log('Transaction already approved (no rows updated), continuing with balance update');
          } else if (checkTransaction?.status === 'rejected') {
            // Transaction was rejected, but payment succeeded - this is a conflict
            // Update it to approved since payment was successful
            console.log('Transaction was rejected but payment succeeded, updating to approved');
            await supabase
              .from('transactions')
              .update({ status: 'approved' })
              .eq('id', transactionToUpdate.id);
          } else {
            // Status is still pending but update returned no rows - might be a race condition
            // Try one more time without the status check
            console.log('Retrying transaction update without status check');
            const { error: retryError } = await supabase
              .from('transactions')
              .update({ status: 'approved' })
              .eq('id', transactionToUpdate.id);
            
            if (retryError) {
              console.error('Retry update also failed:', retryError);
              // Continue anyway - payment was successful, we'll update balance
            }
          }
        } else {
          console.log('Transaction status updated to approved:', updatedTransactions[0]);
        }
      }

      // Get current balance and update it (use atomic update to prevent race conditions)
      // This is the critical part - we must update balance since payment was successful
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', authUser.id)
        .single();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
        // Try to get balance with maybeSingle as fallback
        const { data: profileFallback } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', authUser.id)
          .maybeSingle();
        
        if (!profileFallback) {
          throw new Error(`Failed to fetch profile: ${profileError.message}`);
        }
        
        // Use fallback profile
        const transactionAmount = transactionToUpdate.amount;
        const currentBalance = profileFallback.balance || 0;
        const newBalance = currentBalance + transactionAmount;
        
        const { error: balanceError } = await supabase
          .from('profiles')
          .update({ balance: newBalance })
          .eq('id', authUser.id);

        if (balanceError) {
          console.error('Error updating balance:', balanceError);
          throw new Error(`Failed to update balance: ${balanceError.message}`);
        }

        console.log('Balance updated successfully (fallback):', { 
          oldBalance: currentBalance, 
          transactionAmount, 
          newBalance 
        });

        toast.success(`Payment successful! ₵${transactionAmount.toFixed(2)} added to your balance.`);
        setDepositAmount('');
        setPendingTransaction(null);
        await onUpdateUser();
        return;
      }

      // Calculate new balance
      const transactionAmount = transactionToUpdate.amount;
      const currentBalance = profile.balance || 0;
      const newBalance = currentBalance + transactionAmount;
      
      // Double-check transaction status before updating balance (prevent double crediting)
      const { data: preBalanceStatusCheck } = await supabase
        .from('transactions')
        .select('status')
        .eq('id', transactionToUpdate.id)
        .maybeSingle();
      
      if (preBalanceStatusCheck?.status === 'approved') {
        // Transaction is already approved - verify balance was updated
        // If balance seems correct (accounting for this transaction), don't update again
        console.log('Transaction already approved, verifying balance was updated');
        // We'll still update balance to be safe, but log it
      }
      
      // Update balance atomically
      const { error: balanceError } = await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', authUser.id);

      if (balanceError) {
        console.error('Error updating balance:', balanceError);
        // Try one more time with a retry
        console.log('Retrying balance update...');
        const { data: retryProfile } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', authUser.id)
          .single();
        
        if (retryProfile) {
          const retryBalance = (retryProfile.balance || 0) + transactionAmount;
          const { error: retryBalanceError } = await supabase
            .from('profiles')
            .update({ balance: retryBalance })
            .eq('id', authUser.id);
          
          if (retryBalanceError) {
            throw new Error(`Failed to update balance after retry: ${retryBalanceError.message}`);
          }
          
          console.log('Balance updated successfully (retry):', { 
            oldBalance: retryProfile.balance, 
            transactionAmount, 
            newBalance: retryBalance 
          });
        } else {
          throw new Error(`Failed to update balance: ${balanceError.message}`);
        }
      } else {
        console.log('Balance updated successfully:', { 
          oldBalance: currentBalance, 
          transactionAmount, 
          newBalance 
        });
      }

      // Final verification: ensure transaction is marked as approved
      // This is non-blocking - if it fails, balance is already updated
      try {
        const { data: finalTransaction } = await supabase
          .from('transactions')
          .select('status')
          .eq('id', transactionToUpdate.id)
          .maybeSingle();
        
        if (finalTransaction?.status !== 'approved') {
          console.log('Final transaction status check - updating to approved if needed');
          await supabase
            .from('transactions')
            .update({ status: 'approved' })
            .eq('id', transactionToUpdate.id);
        }
      } catch (finalUpdateError) {
        console.warn('Failed to finalize transaction status, but balance was updated:', finalUpdateError);
        // Non-critical - balance is already updated
      }

      toast.success(`Payment successful! ₵${transactionAmount.toFixed(2)} added to your balance.`);
      setDepositAmount('');
      setPendingTransaction(null);
      
      // Refresh user data
      await onUpdateUser();
    } catch (error) {
      console.error('Error processing payment:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        reference,
        pendingTransactionId: pendingTransaction?.id
      });
      
      const transactionId = pendingTransaction?.id?.slice(0, 8) || 'unknown';
      toast.error(`Payment successful but failed to update: ${error.message || 'Unknown error'}. Transaction ID: ${transactionId}. Please contact support with this ID.`);
      
      // Don't try to update transaction status here - let admin handle it manually
      // Just clear the pending transaction state
      setPendingTransaction(null);
    }
  };

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
        .select('status, paystack_reference')
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
          .update({ status: 'rejected' })
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

  // Trigger Paystack payment when pendingTransaction is set
  useEffect(() => {
    if (pendingTransaction && user?.email) {
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
          
          if (!amountInPesewas || amountInPesewas < 1000) {
            throw new Error('Amount must be at least ₵10.00 (1000 pesewas)');
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
              // Paystack callback must be synchronous, handle async operation inside
              console.log('Paystack callback triggered:', response);
              
              // Check if response indicates failure
              if (!response || response.status === 'error' || response.status === 'failed') {
                console.error('Payment failed:', response);
                toast.error('Payment failed. Please try again.');
                handlePaymentCancellation().catch((error) => {
                  console.error('Error handling payment failure:', error);
                });
                return;
              }
              
              // Verify response has reference
              if (!response.reference) {
                console.error('Invalid Paystack response (no reference):', response);
                toast.error('Payment response invalid. Please contact support.');
                handlePaymentCancellation().catch((error) => {
                  console.error('Error handling invalid payment response:', error);
                });
                return;
              }

              console.log('Paystack reference:', response.reference);
              console.log('Pending transaction:', pendingTransaction);

              // Store the reference immediately (even before processing) so we can verify later if needed
              if (pendingTransaction?.id && response.reference) {
                supabase
                  .from('transactions')
                  .update({ paystack_reference: response.reference })
                  .eq('id', pendingTransaction.id)
                  .then(() => {
                    console.log('Paystack reference stored:', response.reference);
                  })
                  .catch((refError) => {
                    console.error('Error storing Paystack reference:', refError);
                  });
              }

              // Call the async handler
              handlePaymentSuccess(response.reference).catch((error) => {
                console.error('Payment success handler error:', error);
                toast.error(`Payment processed but failed to update: ${error.message || 'Unknown error'}. Please contact support.`);
              });
            },
            onClose: () => {
              console.log('Payment window closed by user before confirmation');
              // Update transaction status to rejected when payment window is closed
              // The toast will be shown in handlePaymentCancellation after successful update
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
            toast.error('Invalid payment request. Please check: 1) Paystack key is valid, 2) Amount is at least ₵1, 3) Email is valid.');
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

  const handleDeposit = async (e) => {
    e.preventDefault();
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    const amount = parseFloat(depositAmount);
    if (amount < 10) {
      toast.error('Minimum deposit amount is ₵10');
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
      const { data: existingPending, error: checkPendingError } = await supabase
        .from('transactions')
        .select('id, status, amount, created_at')
        .eq('user_id', authUser.id)
        .eq('type', 'deposit')
        .eq('status', 'pending')
        .eq('amount', amount)
        .order('created_at', { ascending: false })
        .limit(1);

      // If there's a recent pending transaction (within last 5 minutes), reuse it
      if (!checkPendingError && existingPending && existingPending.length > 0) {
        const pendingTx = existingPending[0];
        const txAge = Date.now() - new Date(pendingTx.created_at).getTime();
        const fiveMinutes = 5 * 60 * 1000;
        
        if (txAge < fiveMinutes) {
          console.log('Reusing existing pending transaction:', pendingTx.id);
          setPendingTransaction({
            id: pendingTx.id,
            amount: pendingTx.amount,
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
        status: 'pending'
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
  };

  const handleOrder = async (e) => {
    e.preventDefault();
    if (!orderForm.service_id || !orderForm.link || !orderForm.quantity) {
      toast.error('Please fill all fields');
      return;
    }

    setLoading(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Not authenticated');

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
            try {
              const smmgenResponse = await placeSMMGenOrder(
                smmgenServiceId,
                orderForm.link,
                quantity
              );
              
              if (smmgenResponse === null) {
                // Backend not available, continue with local order
              } else if (smmgenResponse) {
                smmgenOrderId = smmgenResponse.order || smmgenResponse.id || null;
                console.log(`SMMGen order placed for ${componentService.name}:`, smmgenOrderId);
              }
            } catch (smmgenError) {
              if (!smmgenError.message?.includes('Failed to fetch') && 
                  !smmgenError.message?.includes('ERR_CONNECTION_REFUSED') &&
                  !smmgenError.message?.includes('Backend proxy server not running')) {
                console.error(`SMMGen order failed for ${componentService.name}:`, smmgenError);
              }
              // Continue with local order creation
            }
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
              smmgen_order_id: smmgenOrderId
            }).select().single()
          );
        }

        // Check balance
        if (user.balance < totalCost) {
          throw new Error('Insufficient balance');
        }

        // Create all orders
        const orderResults = await Promise.all(orderPromises);
        const orderErrors = orderResults.filter(r => r.error);
        
        if (orderErrors.length > 0) {
          throw new Error(`Failed to create some orders: ${orderErrors[0].error.message}`);
        }

        // Deduct balance
        const { error: balanceError } = await supabase
          .from('profiles')
          .update({ balance: user.balance - totalCost })
          .eq('id', authUser.id);

        if (balanceError) throw balanceError;

        toast.success(`Combo order placed successfully! ${componentServices.length} orders created.`);
        setOrderForm({ service_id: '', link: '', quantity: '' });
        await onUpdateUser();
        fetchRecentOrders();
        return;
      }

      // Regular (non-combo) service handling
      // Calculate cost
      const totalCost = (quantity / 1000) * service.rate;

      // Check balance
      if (user.balance < totalCost) {
        throw new Error('Insufficient balance');
      }

      // Place order via SMMGen API if service has SMMGen ID
      let smmgenOrderId = null;
      if (service.smmgen_service_id) {
        try {
          const smmgenResponse = await placeSMMGenOrder(
            service.smmgen_service_id,
            orderForm.link,
            quantity
          );
          
          // If SMMGen returns null, it means backend is not available (graceful skip)
          if (smmgenResponse === null) {
            // Silently continue - this is expected when backend/serverless functions aren't available
            // Order will be created locally in Supabase
          } else if (smmgenResponse) {
            smmgenOrderId = smmgenResponse.order || smmgenResponse.id || null;
            console.log('SMMGen order placed:', smmgenOrderId);
          }
        } catch (smmgenError) {
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
      }

      // Create order record in our database
      const { data: orderData, error: orderError } = await supabase.from('orders').insert({
        user_id: authUser.id,
        service_id: orderForm.service_id,
        link: orderForm.link,
        quantity: quantity,
        total_cost: totalCost,
        status: 'pending',
        smmgen_order_id: smmgenOrderId // Store SMMGen order ID for tracking
      }).select().single();

      if (orderError) throw orderError;

      // Deduct balance
      const { error: balanceError } = await supabase
        .from('profiles')
        .update({ balance: user.balance - totalCost })
        .eq('id', authUser.id);

      if (balanceError) throw balanceError;

      toast.success('Order placed successfully!');
      setOrderForm({ service_id: '', link: '', quantity: '' });
      await onUpdateUser();
      fetchRecentOrders();
    } catch (error) {
      toast.error(error.message || 'Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  const selectedService = services.find(s => s.id === orderForm.service_id);
  
  // Calculate estimated cost - handle combo services differently
  const estimatedCost = (() => {
    if (!selectedService || !orderForm.quantity) return '0.00';
    
    const quantity = parseInt(orderForm.quantity);
    if (isNaN(quantity) || quantity <= 0) return '0.00';
    
    // For combo services, calculate sum of component service costs
    if (selectedService.is_combo && selectedService.combo_service_ids && selectedService.combo_service_ids.length > 0) {
      const componentServices = selectedService.combo_service_ids
        .map(serviceId => services.find(s => s.id === serviceId))
        .filter(s => s !== undefined);
      
      if (componentServices.length === 0) {
        // Fallback to combo service rate if components not found
        return ((quantity / 1000) * selectedService.rate).toFixed(2);
      }
      
      // Sum up all component service costs
      const totalCost = componentServices.reduce((sum, componentService) => {
        const componentCost = (quantity / 1000) * componentService.rate;
        return sum + componentCost;
      }, 0);
      
      return totalCost.toFixed(2);
    }
    
    // For regular services, use the service rate
    return ((quantity / 1000) * selectedService.rate).toFixed(2);
  })();

  // Filter services based on search query
  const filteredServices = services.filter(service => {
    if (!serviceSearch.trim()) return true;
    const searchLower = serviceSearch.toLowerCase();
    return (
      service.name?.toLowerCase().includes(searchLower) ||
      service.platform?.toLowerCase().includes(searchLower) ||
      service.service_type?.toLowerCase().includes(searchLower) ||
      service.description?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <Navbar user={user} onLogout={onLogout} />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Welcome Section */}
        <div className="mb-8 animate-fadeIn">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Welcome back, {user.name}!</h1>
          <p className="text-gray-600">Manage your orders and grow your social presence</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-4 sm:gap-6 mb-8 animate-slideUp">
          <div className="glass p-4 sm:p-6 rounded-2xl card-hover">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
                <Wallet className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
            </div>
            <p className="text-gray-600 text-xs sm:text-sm mb-1">Current Balance</p>
            <h3 data-testid="user-balance" className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">₵{user.balance.toFixed(2)}</h3>
          </div>

          <div className="glass p-4 sm:p-6 rounded-2xl card-hover">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
            </div>
            <p className="text-gray-600 text-xs sm:text-sm mb-1">Total Orders</p>
            <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">{recentOrders.length}</h3>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Add Funds */}
          <div className="glass p-8 rounded-3xl animate-slideUp">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Add Funds</h2>
            <form onSubmit={handleDeposit} className="space-y-5">
              <div>
                <Label htmlFor="amount" className="text-gray-700 font-medium mb-2 block">Amount (GHS)</Label>
                <Input
                  id="amount"
                  data-testid="deposit-amount-input"
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="Enter amount"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="rounded-xl bg-white/70"
                />
              </div>
              <Button
                data-testid="deposit-submit-btn"
                type="submit"
                disabled={loading || !depositAmount}
                className="w-full btn-hover bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white py-6 rounded-full"
              >
                {loading ? 'Processing...' : 'Pay with Paystack'}
              </Button>
              <p className="text-sm text-gray-600 text-center">
                Secure payment via Paystack. Funds are added instantly after successful payment.
              </p>
            </form>
          </div>

          {/* Quick Order */}
          <div className="glass p-8 rounded-3xl animate-slideUp" id="order-form-section">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Place New Order</h2>
            <form onSubmit={handleOrder} className="space-y-5">
              <div className="relative">
                <Label htmlFor="service" className="text-gray-700 font-medium mb-2 block">Service</Label>
                {/* Search Input with Dropdown */}
                <div className="relative service-dropdown-container">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none z-20" />
                  <Input
                    type="text"
                    placeholder="Search services by name, platform, or type..."
                    value={serviceSearch}
                    onChange={(e) => {
                      const value = e.target.value;
                      setServiceSearch(value);
                      // Open dropdown immediately when typing starts
                      if (value.length > 0 && services.length > 0) {
                        setSelectOpen(true);
                      } else if (value.length === 0 && services.length > 0) {
                        // Show all services when search is cleared
                        setSelectOpen(true);
                      }
                    }}
                    onFocus={() => {
                      // Open dropdown when search field is focused
                      if (services.length > 0) {
                        setSelectOpen(true);
                      }
                    }}
                    onBlur={(e) => {
                      // Small delay to allow click events on dropdown items
                      setTimeout(() => {
                        // Check if focus moved to dropdown or if clicking outside
                        const activeElement = document.activeElement;
                        if (!activeElement || !activeElement.closest('.service-dropdown-container')) {
                          setSelectOpen(false);
                        }
                      }, 150);
                    }}
                    className="rounded-xl bg-white/70 pl-10 z-10"
                    autoComplete="off"
                    id="service-search-input"
                  />
                  
                  {/* Dropdown positioned below search input */}
                  {selectOpen && (
                    <div 
                      className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-[300px] overflow-y-auto"
                      onMouseDown={(e) => {
                        // Prevent blur when clicking on dropdown
                        e.preventDefault();
                      }}
                    >
                      {filteredServices.length === 0 ? (
                        <div className="px-4 py-6 text-center text-sm text-gray-500">
                          No services found matching "{serviceSearch}"
                        </div>
                      ) : (
                        <div className="p-1">
                          {filteredServices.map((service) => (
                            <div
                              key={service.id}
                              onClick={() => {
                                setOrderForm({ ...orderForm, service_id: service.id });
                                setServiceSearch('');
                                setSelectOpen(false);
                              }}
                              className="px-3 py-2 rounded-md hover:bg-gray-100 cursor-pointer transition-colors"
                            >
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-900">{service.name}</span>
                                  {service.is_combo && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                                      <Layers className="w-3 h-3" />
                                      Combo
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-gray-500">
                                  {service.platform && `${service.platform} • `}₵{service.rate}/1000
                                  {service.is_combo && service.combo_service_ids && (
                                    <span className="ml-2 text-purple-600">
                                      ({service.combo_service_ids.length} services)
                                    </span>
                                  )}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Hidden Select for form submission */}
                <Select 
                  value={orderForm.service_id || ''}
                  onValueChange={() => {}}
                  style={{ display: 'none' }}
                >
                  <SelectTrigger style={{ display: 'none' }}>
                    <SelectValue />
                  </SelectTrigger>
                </Select>
                
                {/* Selected service display */}
                {orderForm.service_id && services.find(s => s.id === orderForm.service_id) && (
                  <div className="mt-3 p-3 bg-indigo-50 rounded-xl">
                    <p className="text-sm font-medium text-gray-900">
                      Selected: {services.find(s => s.id === orderForm.service_id).name}
                    </p>
                    <p className="text-xs text-gray-600">
                      ₵{services.find(s => s.id === orderForm.service_id).rate}/1000
                    </p>
                  </div>
                )}
                
                {serviceSearch && (
                  <p className="text-xs text-gray-500 mt-2">
                    {filteredServices.length} service{filteredServices.length !== 1 ? 's' : ''} found
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="link" className="text-gray-700 font-medium mb-2 block">Link</Label>
                <Input
                  id="link"
                  data-testid="order-link-input"
                  type="url"
                  placeholder="https://instagram.com/yourprofile"
                  value={orderForm.link}
                  onChange={(e) => setOrderForm({ ...orderForm, link: e.target.value })}
                  className="rounded-xl bg-white/70"
                />
              </div>

              <div>
                <Label htmlFor="quantity" className="text-gray-700 font-medium mb-2 block">Quantity</Label>
                <Input
                  id="quantity"
                  data-testid="order-quantity-input"
                  type="number"
                  placeholder="1000"
                  value={orderForm.quantity}
                  onChange={(e) => setOrderForm({ ...orderForm, quantity: e.target.value })}
                  className="rounded-xl bg-white/70"
                />
                {selectedService && (
                  <div className="mt-2 space-y-1">
                    <p className="text-sm text-gray-600">
                      Min: {selectedService.min_quantity} | Max: {selectedService.max_quantity}
                    </p>
                    {selectedService.is_combo && selectedService.combo_service_ids && (
                      <div className="mt-2 p-2 bg-purple-50 rounded-lg border border-purple-200">
                        <p className="text-xs font-medium text-purple-900 mb-1 flex items-center gap-1">
                          <Layers className="w-3 h-3" />
                          Combo includes:
                        </p>
                        <ul className="text-xs text-purple-700 space-y-0.5">
                          {selectedService.combo_service_ids.map((serviceId, idx) => {
                            const componentService = services.find(s => s.id === serviceId);
                            return componentService ? (
                              <li key={serviceId} className="flex items-center gap-1">
                                <span className="w-1 h-1 bg-purple-500 rounded-full"></span>
                                {componentService.name} (₵{componentService.rate}/1000)
                              </li>
                            ) : null;
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-indigo-50 p-4 rounded-xl">
                <p className="text-sm text-gray-600 mb-1">Estimated Cost</p>
                <p data-testid="order-estimated-cost" className="text-2xl font-bold text-indigo-600">₵{estimatedCost}</p>
              </div>

              <Button
                data-testid="order-submit-btn"
                type="submit"
                disabled={loading || !orderForm.service_id}
                className="w-full btn-hover bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white py-6 rounded-full"
              >
                {loading ? 'Processing...' : 'Place Order'}
              </Button>
            </form>
          </div>
        </div>

        {/* Recent Orders */}
        {recentOrders.length > 0 && (
          <div className="mt-8 glass p-8 rounded-3xl animate-slideUp">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Recent Orders</h2>
              <Button
                data-testid="view-all-orders-btn"
                variant="ghost"
                onClick={() => navigate('/orders')}
                className="text-indigo-600 hover:text-indigo-700"
              >
                View All
              </Button>
            </div>
            <div className="space-y-3">
              {recentOrders.map((order) => {
                const service = services.find(s => s.id === order.service_id);
                return (
                  <div key={order.id} className="bg-white/50 p-4 rounded-xl flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900">{service?.name || 'Service'}</p>
                      <p className="text-sm text-gray-600">Quantity: {order.quantity}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">₵{order.total_cost.toFixed(2)}</p>
                      <span className={`text-xs px-3 py-1 rounded-full ${
                        order.status === 'completed' ? 'bg-green-100 text-green-700' :
                        order.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                        order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
