import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUserRole } from './useUserRole';
import { toast } from 'sonner';

const PAGE_SIZE = 50;

// Fetch deposits with pagination
const fetchDeposits = async ({ pageParam = 0 }) => {
  const from = pageParam * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await supabase
    .from('transactions')
    .select('id, user_id, amount, type, status, created_at, paystack_status, paystack_reference, manual_reference, korapay_reference, deposit_method, payment_proof_url, profiles(email, name, phone_number)', { count: 'exact' })
    .eq('type', 'deposit')
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('policy')) {
      toast.error('RLS Policy Error: Cannot view all transactions. Please run database/fixes/FIX_ADMIN_RLS.sql in Supabase SQL Editor.');
    }
    throw error;
  }

  return {
    data: data || [],
    nextPage: data && data.length === PAGE_SIZE ? pageParam + 1 : undefined,
    total: count || 0,
  };
};

// Fetch all deposits (for stats calculation) - Fetches ALL records efficiently using optimized pagination
const fetchAllDeposits = async () => {
  const BATCH_SIZE = 1000; // Fetch in batches for optimal performance
  let allDeposits = [];
  let from = 0;
  let hasMore = true;
  
  // First, get total count to optimize fetching
  const { count, error: countError } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('type', 'deposit');
  
  if (countError) {
    throw countError;
  }

  // Fetch all batches - optimized sequential fetching for large datasets
  while (hasMore) {
    const to = from + BATCH_SIZE - 1;
    
    const { data, error } = await supabase
      .from('transactions')
      .select('id, user_id, amount, type, status, created_at, paystack_status, paystack_reference, manual_reference, korapay_reference, order_id, payment_proof_url, profiles(email, name, phone_number)')
      .eq('type', 'deposit')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw error;
    }

    if (data && data.length > 0) {
      allDeposits = allDeposits.concat(data);
      hasMore = data.length === BATCH_SIZE && allDeposits.length < (count || Infinity);
      from += BATCH_SIZE;
    } else {
      hasMore = false;
    }
  }

  return allDeposits;
};

export const useAdminDeposits = (options = {}) => {
  const { enabled = true, useInfinite = false } = options;
  
  // Check role at hook level (cached)
  const { data: userRole, isLoading: roleLoading } = useUserRole();
  const isAdmin = userRole?.isAdmin ?? false;
  
  // Only enable queries if user is admin
  const queryEnabled = enabled && !roleLoading && isAdmin;

  if (useInfinite) {
    return useInfiniteQuery({
      queryKey: ['admin', 'deposits'],
      queryFn: fetchDeposits,
      getNextPageParam: (lastPage) => lastPage.nextPage,
      initialPageParam: 0,
      enabled: queryEnabled,
      staleTime: 2 * 60 * 1000, // 2 minutes
      gcTime: 5 * 60 * 1000, // 5 minutes
    });
  }

  return useQuery({
    queryKey: ['admin', 'deposits', 'all'],
    queryFn: fetchAllDeposits,
    enabled: queryEnabled,
    staleTime: 3 * 60 * 1000, // 3 minutes - increased for better caching
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache longer
  });
};

export const useApproveDeposit = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ transactionId, userId, amount }) => {
      const maxRetries = 3;
      let statusUpdated = false;
      let statusUpdateError = null;

      // Update transaction status with retry logic
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const { data: updatedData, error: transactionError } = await supabase
            .from('transactions')
            .update({ status: 'approved' })
            .eq('id', transactionId)
            .select('status');

          if (transactionError) {
            console.error(`[ADMIN] Approval attempt ${attempt} error:`, transactionError);
            statusUpdateError = transactionError;
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
              continue;
            }
            throw transactionError;
          }

          // Verify the update succeeded
          if (updatedData && updatedData.length > 0) {
            const updatedStatus = updatedData[0]?.status;
            if (updatedStatus === 'approved') {
              statusUpdated = true;
              console.log(`[ADMIN] Transaction ${transactionId} status updated to approved (attempt ${attempt})`);
              break;
            } else {
              console.warn(`[ADMIN] Status update returned but status is ${updatedStatus}, retrying...`);
              if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                continue;
              }
            }
          } else {
            // No data returned - verify current status
            const { data: currentTx } = await supabase
              .from('transactions')
              .select('status')
              .eq('id', transactionId)
              .single();

            if (currentTx?.status === 'approved') {
              statusUpdated = true;
              console.log(`[ADMIN] Transaction ${transactionId} already approved`);
              break;
            } else {
              console.warn(`[ADMIN] Update returned no data, current status: ${currentTx?.status}, retrying...`);
              if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                continue;
              }
            }
          }
        } catch (retryError) {
          console.error(`[ADMIN] Approval attempt ${attempt} exception:`, retryError);
          statusUpdateError = retryError;
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          } else {
            throw retryError;
          }
        }
      }

      // Final verification - check status one more time
      if (!statusUpdated) {
        const { data: finalCheck } = await supabase
          .from('transactions')
          .select('status')
          .eq('id', transactionId)
          .single();

        if (finalCheck?.status === 'approved') {
          statusUpdated = true;
          console.log(`[ADMIN] Transaction ${transactionId} verified as approved after retries`);
        } else {
          throw new Error(`Failed to update transaction status to approved after ${maxRetries} attempts. Current status: ${finalCheck?.status || 'unknown'}`);
        }
      }

      // Update user balance (independent of status update)
      let balanceUpdated = false;
      let balanceUpdateError = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          // Get current balance
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('balance')
            .eq('id', userId)
            .single();

          if (profileError) {
            console.error(`[ADMIN] Balance fetch attempt ${attempt} error:`, profileError);
            balanceUpdateError = profileError;
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
              continue;
            }
            throw profileError;
          }

          // Calculate and update balance
          const currentBalance = parseFloat(profile.balance || 0);
          const newBalance = currentBalance + parseFloat(amount);

          const { error: balanceError } = await supabase
            .from('profiles')
            .update({ balance: newBalance })
            .eq('id', userId);

          if (balanceError) {
            console.error(`[ADMIN] Balance update attempt ${attempt} error:`, balanceError);
            balanceUpdateError = balanceError;
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
              continue;
            }
            throw balanceError;
          }

          // Verify balance was updated
          const { data: verifyProfile } = await supabase
            .from('profiles')
            .select('balance')
            .eq('id', userId)
            .single();

          if (verifyProfile && parseFloat(verifyProfile.balance) === newBalance) {
            balanceUpdated = true;
            console.log(`[ADMIN] Balance updated successfully (attempt ${attempt}):`, {
              userId,
              oldBalance: currentBalance,
              newBalance,
              amount
            });
            break;
          } else {
            console.warn(`[ADMIN] Balance verification failed, expected ${newBalance}, got ${verifyProfile?.balance}`);
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
              continue;
            }
          }
        } catch (balanceRetryError) {
          console.error(`[ADMIN] Balance update attempt ${attempt} exception:`, balanceRetryError);
          balanceUpdateError = balanceRetryError;
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          } else {
            throw balanceRetryError;
          }
        }
      }

      if (!balanceUpdated) {
        throw new Error(`Failed to update user balance after ${maxRetries} attempts: ${balanceUpdateError?.message || 'Unknown error'}`);
      }

      return { transactionId, userId, amount };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'deposits'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('Deposit approved successfully');
    },
    onError: (error) => {
      console.error('[ADMIN] Deposit approval error:', error);
      toast.error(error.message || 'Failed to approve deposit');
    },
  });
};

export const useRejectDeposit = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transactionId) => {
      const { error } = await supabase
        .from('transactions')
        .update({ status: 'rejected' })
        .eq('id', transactionId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'deposits'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.success('Deposit rejected');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to reject deposit');
    },
  });
};


