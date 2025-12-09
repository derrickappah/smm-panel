import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

const PAGE_SIZE = 50;

// Fetch deposits with pagination
const fetchDeposits = async ({ pageParam = 0 }) => {
  const { data: currentUser } = await supabase.auth.getUser();
  if (!currentUser?.user) {
    throw new Error('Not authenticated');
  }

  const { data: userProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', currentUser.user.id)
    .single();

  if (userProfile?.role !== 'admin') {
    throw new Error('Access denied. Admin role required.');
  }

  const from = pageParam * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await supabase
    .from('transactions')
    .select('*, profiles(email, name, phone_number)', { count: 'exact' })
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

// Fetch all deposits (for stats calculation)
const fetchAllDeposits = async () => {
  const { data: currentUser } = await supabase.auth.getUser();
  if (!currentUser?.user) {
    throw new Error('Not authenticated');
  }

  const { data: userProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', currentUser.user.id)
    .single();

  if (userProfile?.role !== 'admin') {
    throw new Error('Access denied. Admin role required.');
  }

  let allRecords = [];
  let from = 0;
  let hasMore = true;
  const batchSize = 1000;
  const maxIterations = 10000; // Safety limit to prevent infinite loops
  let iterations = 0;

  while (hasMore && iterations < maxIterations) {
    iterations++;
    const to = from + batchSize - 1;
    
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*, profiles(email, name, phone_number)')
        .eq('type', 'deposit')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error(`Error fetching deposits batch (from ${from} to ${to}):`, error);
        throw error;
      }

      if (data && data.length > 0) {
        allRecords = [...allRecords, ...data];
        // Continue if we got a full batch, stop if we got less
        hasMore = data.length === batchSize;
        from = to + 1;
      } else {
        // No more data
        hasMore = false;
      }
    } catch (error) {
      console.error('Error in fetchAllDeposits batch:', error);
      // If we have some records, return them rather than failing completely
      if (allRecords.length > 0) {
        console.warn(`Returning partial deposit data (${allRecords.length} records) due to error`);
        return allRecords;
      }
      throw error;
    }
  }

  if (iterations >= maxIterations) {
    console.warn(`fetchAllDeposits reached max iterations (${maxIterations}), returning ${allRecords.length} records`);
  }

  return allRecords;
};

export const useAdminDeposits = (options = {}) => {
  const { enabled = true, useInfinite = false } = options;

  if (useInfinite) {
    return useInfiniteQuery({
      queryKey: ['admin', 'deposits'],
      queryFn: fetchDeposits,
      getNextPageParam: (lastPage) => lastPage.nextPage,
      initialPageParam: 0,
      enabled,
      staleTime: 2 * 60 * 1000, // 2 minutes
      gcTime: 5 * 60 * 1000, // 5 minutes
    });
  }

  return useQuery({
    queryKey: ['admin', 'deposits', 'all'],
    queryFn: fetchAllDeposits,
    enabled,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
};

export const useApproveDeposit = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ transactionId, userId, amount }) => {
      // Update transaction status
      const { error: transactionError } = await supabase
        .from('transactions')
        .update({ status: 'approved' })
        .eq('id', transactionId);

      if (transactionError) throw transactionError;

      // Get current balance
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;

      // Update user balance
      const newBalance = (parseFloat(profile.balance) || 0) + parseFloat(amount);
      const { error: balanceError } = await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', userId);

      if (balanceError) throw balanceError;

      return { transactionId, userId, amount };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'deposits'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success('Deposit approved successfully');
    },
    onError: (error) => {
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


