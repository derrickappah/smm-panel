import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export const useOrderStatus = () => {
  const verifyPendingPayments = useCallback(async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      // Find recent pending deposit transactions (within last 48 hours to catch old ones too)
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      
      const { data: pendingTransactions, error } = await supabase
        .from('transactions')
        .select('id, user_id, type, status, paystack_reference, korapay_reference, deposit_method, created_at')
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
              
              if (verifyData.success && verifyData.data && verifyData.data.status === 'success') {
                // Payment succeeded, update transaction
                await supabase
                  .from('transactions')
                  .update({ 
                    status: 'completed',
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', transaction.id);
              } else if (verifyData.data && verifyData.data.status === 'failed') {
                // Payment failed, update transaction
                await supabase
                  .from('transactions')
                  .update({ 
                    status: 'failed',
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', transaction.id);
              }
            }
          } catch (error) {
            console.error(`Error verifying Paystack transaction ${transaction.id}:`, error);
          }
        }
        
        // Verify Korapay transactions
        if (transaction.korapay_reference && transaction.deposit_method === 'korapay') {
          try {
            const verifyResponse = await fetch('/api/korapay-verify', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                reference: transaction.korapay_reference
              })
            });

            if (verifyResponse.ok) {
              const verifyData = await verifyResponse.json();
              
              if (verifyData.success && verifyData.data && verifyData.data.status === 'success') {
                // Payment succeeded, update transaction
                await supabase
                  .from('transactions')
                  .update({ 
                    status: 'completed',
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', transaction.id);
              } else if (verifyData.data && verifyData.data.status === 'failed') {
                // Payment failed, update transaction
                await supabase
                  .from('transactions')
                  .update({ 
                    status: 'failed',
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', transaction.id);
              }
            }
          } catch (error) {
            console.error(`Error verifying Korapay transaction ${transaction.id}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error verifying pending payments:', error);
    }
  }, []);

  return {
    verifyPendingPayments,
  };
};

