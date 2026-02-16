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
            /^[a-zA-Z0-9_-]+$/.test(ref);
        };

        if (!reference || !isValidReference(reference)) {
          // Try to get reference from URL hash
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const hashReference = hashParams.get('reference') ||
            hashParams.get('ref') ||
            hashParams.get('externalref') ||
            hashParams.get('external_ref');

          if (hashReference && isValidReference(hashReference)) {
            const newSearchParams = new URLSearchParams(searchParams);
            newSearchParams.set('reference', hashReference);
            window.history.replaceState({}, '', `${window.location.pathname}?${newSearchParams.toString()}`);
            verifyPayment();
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

        // Get JWT token for API authentication
        const { data: { session } } = await supabase.auth.getSession();
        const authToken = session?.access_token ? `Bearer ${session.access_token}` : '';

        // Verify payment based on method
        if (paymentMethod === 'korapay') {
          const verifyResponse = await fetch('/api/korapay-verify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': authToken
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
          const paymentStatus = verifyData.status || verifyData.data?.status;
          const isSuccessful = paymentStatus === 'success' || paymentStatus === 'successful' || paymentStatus === 'completed';

          if (isSuccessful && transaction.status !== 'approved') {
            console.log('Payment successful, updating UI...');
            // Refresh user data
            if (onUpdateUser) {
              const { data: updatedProfile } = await supabase
                .from('profiles')
                .select('id, balance')
                .eq('id', authUser.id)
                .single();
              if (updatedProfile) onUpdateUser(updatedProfile);
            }

            setStatus('success');
            setMessage(`Payment successful! ₵${parseFloat(transaction.amount).toFixed(2)} has been added to your account.`);
            toast.success(`Payment successful! ₵${parseFloat(transaction.amount).toFixed(2)} added to your balance.`);
            setTimeout(() => navigate('/dashboard'), 3000);
          } else if (paymentStatus === 'failed' || paymentStatus === 'cancelled') {
            await supabase
              .from('transactions')
              .update({ status: 'rejected', korapay_status: 'failed' })
              .eq('id', transaction.id);

            setStatus('failed');
            setMessage('Payment failed or was cancelled.');
            toast.error('Payment failed or was cancelled.');
            setTimeout(() => navigate('/dashboard'), 3000);
          } else {
            setStatus('verifying');
            setMessage('Payment is still being processed. Please wait...');
            setTimeout(() => verifyPayment(), 5000);
          }
        } else if (paymentMethod === 'moolre_web' || paymentMethod === 'moolre') {
          const verifyResponse = await fetch('/api/moolre-verify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': authToken
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

          // Extract transaction ID from reference if moolre_web
          let transactionId = null;
          if (paymentMethod === 'moolre_web' && reference.startsWith('MOOLRE_WEB_')) {
            const uuidPattern = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
            const match = reference.match(uuidPattern);
            if (match) transactionId = match[1];
          }

          let transaction = null;
          if (transactionId) {
            const { data } = await supabase
              .from('transactions')
              .select('id, amount, status')
              .eq('id', transactionId)
              .eq('user_id', authUser.id)
              .single();
            transaction = data;
          }

          if (!transaction && reference) {
            const { data } = await supabase
              .from('transactions')
              .select('id, amount, status')
              .eq('moolre_reference', reference)
              .eq('user_id', authUser.id)
              .order('created_at', { ascending: false })
              .limit(1);
            if (data && data.length > 0) transaction = data[0];
          }

          if (!transaction) throw new Error('Transaction not found');

          const isSuccessful = verifyData.status === 'success' || verifyData.txstatus === 1;

          if (isSuccessful && transaction.status !== 'approved') {
            if (onUpdateUser) {
              const { data: updatedProfile } = await supabase
                .from('profiles')
                .select('id, balance')
                .eq('id', authUser.id)
                .single();
              if (updatedProfile) onUpdateUser(updatedProfile);
            }
            setStatus('success');
            setMessage(`Payment successful! ₵${parseFloat(transaction.amount).toFixed(2)} added.`);
            toast.success(`Payment successful!`);
            setTimeout(() => navigate('/dashboard'), 3000);
          } else if (verifyData.status === 'failed' || verifyData.txstatus === 2) {
            await supabase.from('transactions').update({ status: 'rejected' }).eq('id', transaction.id);
            setStatus('failed');
            setMessage('Payment failed.');
            setTimeout(() => navigate('/dashboard'), 3000);
          } else {
            retryCountRef.current += 1;
            if (retryCountRef.current >= MAX_RETRIES) {
              setStatus('failed');
              setMessage('Verification timeout.');
              setTimeout(() => navigate('/dashboard'), 5000);
              return;
            }
            setStatus('verifying');
            setMessage(`Processing... (${retryCountRef.current}/${MAX_RETRIES})`);
            setTimeout(() => verifyPayment(), 5000);
          }
        } else {
          setStatus('failed');
          setMessage('Unknown payment method.');
          setTimeout(() => navigate('/dashboard'), 3000);
        }
      } catch (error) {
        console.error('Verification error:', error);
        setStatus('failed');
        setMessage(error.message || 'Verification failed.');
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
            <p className="text-sm text-gray-500">Redirecting...</p>
          </>
        )}

        {status === 'failed' && (
          <>
            <XCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Payment Failed</h2>
            <p className="text-gray-600 mb-4">{message}</p>
            <p className="text-sm text-gray-500">Redirecting...</p>
          </>
        )}
      </div>
    </div>
  );
};

export default PaymentCallback;
