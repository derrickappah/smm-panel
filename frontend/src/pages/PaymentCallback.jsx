import React, { useEffect, useState } from 'react';
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

  useEffect(() => {
    const verifyPayment = async () => {
      try {
        // Get reference from URL params (Korapay may use different param names)
        const reference = searchParams.get('reference') || 
                         searchParams.get('ref') || 
                         searchParams.get('trxref') ||
                         searchParams.get('reference_id');
        const paymentMethod = searchParams.get('method') || 'korapay'; // Default to korapay

        if (!reference) {
          // Try to get reference from URL hash or other locations
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const hashReference = hashParams.get('reference') || hashParams.get('ref');
          
          if (hashReference) {
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
            .select('id, user_id, type, amount, status, payment_method, korapay_reference, created_at')
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
            // Update transaction to approved
            const { error: updateError } = await supabase
              .from('transactions')
              .update({
                status: 'approved',
                korapay_status: 'success',
                korapay_reference: reference
              })
              .eq('id', transaction.id);

            if (updateError) {
              console.error('Error updating transaction:', updateError);
              throw new Error('Payment verified but failed to update transaction. Please contact support.');
            }

            // Update user balance
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('balance')
              .eq('id', authUser.id)
              .single();

            if (profileError) {
              console.error('Error fetching profile:', profileError);
              throw new Error('Payment verified but failed to fetch profile. Please contact support.');
            }

            const currentBalance = parseFloat(profile.balance || 0);
            const newBalance = currentBalance + parseFloat(transaction.amount);

            const { error: balanceError } = await supabase
              .from('profiles')
              .update({ balance: newBalance })
              .eq('id', authUser.id);

            if (balanceError) {
              console.error('Error updating balance:', balanceError);
              throw new Error('Payment verified but failed to update balance. Please contact support.');
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

