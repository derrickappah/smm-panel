import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

/**
 * Payment Callback Page
 * 
 * Handles payment callbacks from payment gateways (Korapay, Paystack, etc.)
 * Verifies payment status and updates transaction accordingly
 */
const PaymentCallback = ({ onUpdateUser }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('verifying'); // 'verifying', 'success', 'failed'
  const [message, setMessage] = useState('Verifying payment...');
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 12; // Maximum 12 retries (1 minute total)

  useEffect(() => {
    // Reset retry count for new payment verification
    retryCountRef.current = 0;
    
    const verifyPayment = async () => {
      try {
        // Get reference from URL params (Korapay may use different param names)
        // For Moolre, also check for externalref parameter
        const reference = searchParams.get('reference') ||
                         searchParams.get('ref') ||
                         searchParams.get('trxref') ||
                         searchParams.get('reference_id') ||
                         searchParams.get('externalref') ||
                         searchParams.get('external_ref');
        const paymentMethod = searchParams.get('method') || 'korapay'; // Default to korapay

        // Validate reference format and length
        const isValidReference = (ref) => {
          return ref &&
                 typeof ref === 'string' &&
                 ref.length >= 3 &&
                 ref.length <= 100 &&
                 /^[a-zA-Z0-9_-]+$/.test(ref); // Only alphanumeric, underscore, hyphen
        };

        if (!reference || !isValidReference(reference)) {
          // Try to get reference from URL hash or other locations
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const hashReference = hashParams.get('reference') ||
                               hashParams.get('ref') ||
                               hashParams.get('externalref') ||
                               hashParams.get('external_ref');

          if (hashReference && isValidReference(hashReference)) {
            // Use hash reference and continue
            const verifyWithHash = async () => {
              // Retry with hash reference
              const newSearchParams = new URLSearchParams(searchParams);
              newSearchParams.set('reference', hashReference);
              window.history.replaceState({}, '', `${window.location.pathname}?${newSearchParams.toString()}`);
              verifyPayment();
            };
            verifyWithHash();
            return;
          }
          
          // For moolre_web, if reference is missing, we can't look it up since the column doesn't exist
          // The reference should always be in the URL from Moolre redirect
          
          setStatus('failed');
          setMessage('No payment reference found. Please contact support.');
          setTimeout(() => navigate('/dashboard'), 3000);
          return;
        }

        // Get current user
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) {
          setStatus('failed');
          setMessage('Please log in to verify your payment.');
          setTimeout(() => navigate('/auth'), 3000);
          return;
        }

        // Verify payment based on method
        if (paymentMethod === 'korapay') {
          // Verify via serverless function
          const verifyResponse = await fetch('/api/korapay-verify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reference })
          });

          if (!verifyResponse.ok) {
            const errorData = await verifyResponse.json().catch(() => ({ error: 'Verification failed' }));
            throw new Error(errorData.error || 'Payment verification failed');
          }

          const verifyData = await verifyResponse.json();

          if (!verifyData.success) {
            throw new Error(verifyData.error || 'Payment verification failed');
          }

          // Find transaction by reference
          const { data: transactions, error: txError } = await supabase
            .from('transactions')
            .select('id, user_id, type, amount, status, deposit_method, korapay_reference, created_at')
            .eq('korapay_reference', reference)
            .eq('user_id', authUser.id)
            .order('created_at', { ascending: false })
            .limit(1);

          if (txError || !transactions || transactions.length === 0) {
            throw new Error('Transaction not found');
          }

          const transaction = transactions[0];

          // Check payment status
          const paymentStatus = verifyData.status || verifyData.data?.status;
          const isSuccessful = paymentStatus === 'success' || paymentStatus === 'successful' || paymentStatus === 'completed';

          if (isSuccessful && transaction.status !== 'approved') {
            // Get JWT token for API authentication
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
              throw new Error('No session token available. Please log in again.');
            }

            // Check if transaction is already approved (webhook should have processed it)
            if (transaction.status === 'approved') {
              console.log('Transaction already approved by webhook');
            } else {
              // Transaction not yet approved - this is normal as webhooks can be delayed
              // Show message to user that payment is being processed
              console.log('Transaction still pending - webhook processing may be delayed');
            }

            // Refresh user data
            if (onUpdateUser) {
              const { data: updatedProfile } = await supabase
                .from('profiles')
                .select('id, email, name, balance, role, phone_number')
                .eq('id', authUser.id)
                .single();
              if (updatedProfile) {
                onUpdateUser(updatedProfile);
              }
            }

            setStatus('success');
            setMessage(`Payment successful! ₵${parseFloat(transaction.amount).toFixed(2)} has been added to your account.`);
            toast.success(`Payment successful! ₵${parseFloat(transaction.amount).toFixed(2)} added to your balance.`);
            
            setTimeout(() => navigate('/dashboard'), 3000);
          } else if (paymentStatus === 'failed' || paymentStatus === 'cancelled') {
            // Update transaction to rejected
            await supabase
              .from('transactions')
              .update({
                status: 'rejected',
                korapay_status: 'failed',
                korapay_error: 'Payment failed or was cancelled'
              })
              .eq('id', transaction.id);

            setStatus('failed');
            setMessage('Payment was cancelled or failed. Please try again.');
            toast.error('Payment was cancelled or failed.');
            setTimeout(() => navigate('/dashboard'), 3000);
          } else {
            // Payment is still pending
            setStatus('verifying');
            setMessage('Payment is still being processed. Please wait...');
            // Check again after 5 seconds
            setTimeout(() => verifyPayment(), 5000);
          }
        } else if (paymentMethod === 'moolre_web') {
          // Verify via serverless function (using same endpoint as moolre)
          const verifyResponse = await fetch('/api/moolre-verify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reference })
          });

          if (!verifyResponse.ok) {
            const errorData = await verifyResponse.json().catch(() => ({ error: 'Verification failed' }));
            throw new Error(errorData.error || 'Payment verification failed');
          }

          const verifyData = await verifyResponse.json();

          if (!verifyData.success) {
            throw new Error(verifyData.error || 'Payment verification failed');
          }

          // Find transaction by reference
          // Reference format: MOOLRE_WEB_{transaction_id}_{timestamp}
          // Try to extract transaction ID from reference
          let transactionIdFromRef = null;
          if (reference && reference.startsWith('MOOLRE_WEB_')) {
            const parts = reference.replace('MOOLRE_WEB_', '').split('_');
            // The transaction ID is everything except the last part (timestamp)
            if (parts.length >= 2) {
              // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (36 chars)
              // Try to find UUID pattern in the reference
              const uuidPattern = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
              const match = reference.match(uuidPattern);
              if (match) {
                transactionIdFromRef = match[1];
              }
            }
          }

          let transactions = null;
          let txError = null;

          // Since moolre_web_reference column doesn't exist, skip that query
          // Go directly to finding by transaction ID extracted from reference
          if (transactionIdFromRef) {
            // Find by transaction ID extracted from reference
            const { data: txById, error: idError } = await supabase
              .from('transactions')
              .select('id, user_id, type, amount, status, deposit_method, created_at')
              .eq('id', transactionIdFromRef)
              .eq('user_id', authUser.id)
              .eq('deposit_method', 'moolre_web')
              .order('created_at', { ascending: false })
              .limit(1);

            if (!idError && txById && txById.length > 0) {
              transactions = txById;
            } else {
              // Try to find transaction by moolre_reference
              if (reference) {
                const { data: txByRef, error: refError } = await supabase
                  .from('transactions')
                  .select('id, user_id, type, amount, status, deposit_method, created_at')
                  .eq('user_id', authUser.id)
                  .eq('deposit_method', 'moolre_web')
                  .eq('moolre_reference', reference)
                  .in('status', ['pending', 'approved'])
                  .order('created_at', { ascending: false })
                  .limit(1);

                if (!refError && txByRef && txByRef.length > 0) {
                  transactions = txByRef;
                } else {
                  txError = refError || idError || new Error('Transaction not found');
                }
              } else {
                txError = idError || new Error('Transaction not found - no reference available');
              }
            }
          } else {
            // Try to find transaction by moolre_reference if available
            if (reference) {
              const { data: txByRef, error: refError } = await supabase
                .from('transactions')
                .select('id, user_id, type, amount, status, deposit_method, created_at')
                .eq('user_id', authUser.id)
                .eq('deposit_method', 'moolre_web')
                .eq('moolre_reference', reference)
                .in('status', ['pending', 'approved'])
                .order('created_at', { ascending: false })
                .limit(1);

              if (!refError && txByRef && txByRef.length > 0) {
                transactions = txByRef;
              } else {
                txError = refError || new Error('Transaction not found for reference');
              }
            } else {
              txError = new Error('No reference available for transaction lookup');
            }
          }

          if (txError || !transactions || transactions.length === 0) {
            console.error('Transaction lookup error:', txError);
            console.error('Reference used:', reference);
            console.error('Extracted transaction ID:', transactionIdFromRef);
            throw new Error('Transaction not found. Please check your dashboard.');
          }

          const transaction = transactions[0];

          // Check payment status
          const paymentStatus = verifyData.status;
          const txstatus = verifyData.txstatus; // 1=Success, 0=Pending, 2=Failed
          const isSuccessful = paymentStatus === 'success' || txstatus === 1;

          // If transaction is already approved (by callback handler), just show success
          if (transaction.status === 'approved') {
            // Refresh user data
            if (onUpdateUser) {
              const { data: updatedProfile } = await supabase
                .from('profiles')
                .select('id, email, name, balance, role, phone_number')
                .eq('id', authUser.id)
                .single();
              if (updatedProfile) {
                onUpdateUser(updatedProfile);
              }
            }

            setStatus('success');
            setMessage(`Payment successful! ₵${parseFloat(transaction.amount).toFixed(2)} has been added to your account.`);
            toast.success(`Payment successful! ₵${parseFloat(transaction.amount).toFixed(2)} added to your balance.`);
            
            setTimeout(() => navigate('/dashboard'), 3000);
            return;
          }

          if (isSuccessful && transaction.status !== 'approved') {
            // Transaction should be approved by webhook, but if not, show processing message
            console.log('Payment successful but transaction not yet approved - webhook may be processing');

            // Refresh user data
            if (onUpdateUser) {
              const { data: updatedProfile } = await supabase
                .from('profiles')
                .select('id, email, name, balance, role, phone_number')
                .eq('id', authUser.id)
                .single();
              if (updatedProfile) {
                onUpdateUser(updatedProfile);
              }
            }

            setStatus('success');
            setMessage(`Payment successful! ₵${parseFloat(transaction.amount).toFixed(2)} has been added to your account.`);
            toast.success(`Payment successful! ₵${parseFloat(transaction.amount).toFixed(2)} added to your balance.`);
            
            setTimeout(() => navigate('/dashboard'), 3000);
          } else if (paymentStatus === 'failed' || txstatus === 2) {
            // Update transaction to rejected
            await supabase
              .from('transactions')
              .update({
                status: 'rejected'
              })
              .eq('id', transaction.id);

            setStatus('failed');
            setMessage('Payment was cancelled or failed. Please try again.');
            toast.error('Payment was cancelled or failed.');
            setTimeout(() => navigate('/dashboard'), 3000);
          } else {
            // Payment is still pending
            retryCountRef.current += 1;
            if (retryCountRef.current >= MAX_RETRIES) {
              setStatus('failed');
              setMessage('Payment verification is taking longer than expected. Please check your dashboard or contact support.');
              toast.error('Payment verification timeout. Please check your dashboard.');
              setTimeout(() => navigate('/dashboard'), 5000);
              return;
            }
            
            setStatus('verifying');
            setMessage(`Payment is still being processed. Please wait... (${retryCountRef.current}/${MAX_RETRIES})`);
            // Check again after 5 seconds
            setTimeout(() => verifyPayment(), 5000);
          }
        } else if (paymentMethod === 'moolre') {
          // Verify via serverless function
          const verifyResponse = await fetch('/api/moolre-verify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reference })
          });

          if (!verifyResponse.ok) {
            const errorData = await verifyResponse.json().catch(() => ({ error: 'Verification failed' }));
            throw new Error(errorData.error || 'Payment verification failed');
          }

          const verifyData = await verifyResponse.json();

          if (!verifyData.success) {
            throw new Error(verifyData.error || 'Payment verification failed');
          }

          // Find transaction by reference
          const { data: transactions, error: txError } = await supabase
            .from('transactions')
            .select('id, user_id, type, amount, status, deposit_method, moolre_reference, created_at')
            .eq('moolre_reference', reference)
            .eq('user_id', authUser.id)
            .order('created_at', { ascending: false })
            .limit(1);

          if (txError || !transactions || transactions.length === 0) {
            throw new Error('Transaction not found');
          }

          const transaction = transactions[0];

          // Check payment status
          const paymentStatus = verifyData.status;
          const txstatus = verifyData.txstatus; // 1=Success, 0=Pending, 2=Failed
          const isSuccessful = paymentStatus === 'success' || txstatus === 1;

          if (isSuccessful && transaction.status !== 'approved') {
            // Transaction should be approved by webhook or status check, but if not, show processing message
            console.log('Payment successful but transaction not yet approved - webhook/status check may be processing');

            // Refresh user data
            if (onUpdateUser) {
              const { data: updatedProfile } = await supabase
                .from('profiles')
                .select('id, email, name, balance, role, phone_number')
                .eq('id', authUser.id)
                .single();
              if (updatedProfile) {
                onUpdateUser(updatedProfile);
              }
            }

            setStatus('success');
            setMessage(`Payment successful! ₵${parseFloat(transaction.amount).toFixed(2)} has been added to your account.`);
            toast.success(`Payment successful! ₵${parseFloat(transaction.amount).toFixed(2)} added to your balance.`);
            
            setTimeout(() => navigate('/dashboard'), 3000);
          } else if (paymentStatus === 'failed' || txstatus === 2) {
            // Update transaction to rejected
            await supabase
              .from('transactions')
              .update({
                status: 'rejected',
                moolre_status: 'failed',
                moolre_error: 'Payment failed or was cancelled'
              })
              .eq('id', transaction.id);

            setStatus('failed');
            setMessage('Payment was cancelled or failed. Please try again.');
            toast.error('Payment was cancelled or failed.');
            setTimeout(() => navigate('/dashboard'), 3000);
          } else {
            // Payment is still pending
            setStatus('verifying');
            setMessage('Payment is still being processed. Please wait...');
            // Check again after 5 seconds
            setTimeout(() => verifyPayment(), 5000);
          }
        } else {
          // Handle other payment methods if needed
          setStatus('failed');
          setMessage('Unknown payment method.');
          setTimeout(() => navigate('/dashboard'), 3000);
        }

      } catch (error) {
        console.error('Payment verification error:', error);
        setStatus('failed');
        setMessage(error.message || 'Failed to verify payment. Please contact support.');
        toast.error(error.message || 'Payment verification failed.');
        setTimeout(() => navigate('/dashboard'), 5000);
      }
    };

    verifyPayment();
  }, [searchParams, navigate, onUpdateUser]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="glass p-8 sm:p-12 rounded-3xl max-w-md w-full text-center animate-slideUp">
        {status === 'verifying' && (
          <>
            <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Verifying Payment</h2>
            <p className="text-gray-600">{message}</p>
          </>
        )}
        
        {status === 'success' && (
          <>
            <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h2>
            <p className="text-gray-600 mb-4">{message}</p>
            <p className="text-sm text-gray-500">Redirecting to dashboard...</p>
          </>
        )}
        
        {status === 'failed' && (
          <>
            <XCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Payment Failed</h2>
            <p className="text-gray-600 mb-4">{message}</p>
            <p className="text-sm text-gray-500">Redirecting to dashboard...</p>
          </>
        )}
      </div>
    </div>
  );
};

export default PaymentCallback;

