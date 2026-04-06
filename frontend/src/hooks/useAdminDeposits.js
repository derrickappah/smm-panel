import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUserRole } from './useUserRole';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

const PAGE_SIZE = 1000;

// Fetch deposits with pagination
const fetchDeposits = async ({ pageParam = 0 }) => {
  const from = pageParam * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await supabase
    .from('transactions')
    .select('id, user_id, amount, type, status, created_at, paystack_status, paystack_reference, manual_reference, korapay_reference, deposit_method, payment_proof_url, profiles!transactions_user_id_fkey(email, name, phone_number)', { count: 'exact' })
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
      .select('id, user_id, amount, type, status, created_at, paystack_status, paystack_reference, manual_reference, korapay_reference, order_id, payment_proof_url, profiles!transactions_user_id_fkey(email, name, phone_number)')
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

  const queryClient = useQueryClient();
  const isSubscribedRef = useRef(false);

  // Helper to update both infinite and regular query data
  const updateQueryData = (payload) => {
    // 1. Update infinite query [ 'admin', 'deposits' ]
    queryClient.setQueryData(['admin', 'deposits'], (oldData) => {
      if (!oldData?.pages) return oldData;
      
      const { eventType, new: next, old } = payload;
      
      if (eventType === 'INSERT') {
        const firstPage = oldData.pages[0];
        return {
          ...oldData,
          pages: [
            {
              ...firstPage,
              data: [next, ...(firstPage.data || [])],
              total: (firstPage.total || 0) + 1
            },
            ...oldData.pages.slice(1)
          ]
        };
      }
      
      if (eventType === 'UPDATE') {
        return {
          ...oldData,
          pages: oldData.pages.map(page => ({
            ...page,
            data: page.data?.map(tx => tx.id === next.id ? { ...tx, ...next } : tx) || []
          }))
        };
      }
      
      if (eventType === 'DELETE') {
        return {
          ...oldData,
          pages: oldData.pages.map(page => ({
            ...page,
            data: page.data?.filter(tx => tx.id !== old.id) || [],
            total: Math.max(0, (page.total || 0) - 1)
          }))
        };
      }
      
      return oldData;
    });

    // 2. Update regular query [ 'admin', 'deposits', 'all' ]
    queryClient.setQueryData(['admin', 'deposits', 'all'], (oldData) => {
      if (!oldData) return oldData;
      
      const { eventType, new: next, old } = payload;
      
      if (eventType === 'INSERT') return [next, ...oldData];
      if (eventType === 'UPDATE') return oldData.map(tx => tx.id === next.id ? { ...tx, ...next } : tx);
      if (eventType === 'DELETE') return oldData.filter(tx => tx.id !== old.id);
      
      return oldData;
    });

    // 3. Invalidate related queries
    queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
       queryClient.invalidateQueries({ queryKey: ['admin', 'deposits'] });
       queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
       queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    }
  };

  useEffect(() => {
    if (!queryEnabled || isSubscribedRef.current) return;

    console.log('[useAdminDeposits] Setting up real-time subscription for deposits');

    const channel = supabase
      .channel('admin-deposits-hook-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: 'type=eq.deposit'
        },
        (payload) => {
          console.log('[useAdminDeposits] Realtime event received:', payload.eventType, payload.new || payload.old);
          updateQueryData(payload);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          isSubscribedRef.current = true;
        }
      });

    return () => {
      console.log('[useAdminDeposits] Cleaning up real-time subscription');
      supabase.removeChannel(channel);
      isSubscribedRef.current = false;
    };
  }, [queryEnabled]);

  if (useInfinite) {
    return useInfiniteQuery({
      queryKey: ['admin', 'deposits'],
      queryFn: fetchDeposits,
      getNextPageParam: (lastPage) => lastPage.nextPage,
      initialPageParam: 0,
      enabled: queryEnabled,
      staleTime: 0, 
      gcTime: 0, // Never keep stale admin data in cache
    });
  }

  return useQuery({
    queryKey: ['admin', 'deposits', 'all'],
    queryFn: fetchAllDeposits,
    enabled: queryEnabled,
    staleTime: 0, 
    gcTime: 0, // Never keep stale admin data in cache
  });
};

export const useApproveDeposit = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ transactionId, paymentMethod }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No session. Please log in again.');

      const response = await fetch('/api/approve-deposit-universal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          transaction_id: transactionId,
          payment_method: paymentMethod || 'manual',
          payment_status: 'success',
          payment_reference: `admin-manual-${Date.now()}`
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to approve deposit');
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'deposits'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      await queryClient.refetchQueries({ queryKey: ['admin', 'deposits'] });
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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No session. Please log in again.');

      const response = await fetch('/api/reject-transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ transaction_id: transactionId })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to reject deposit');
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'deposits'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      await queryClient.refetchQueries({ queryKey: ['admin', 'deposits'] });
      toast.success('Deposit rejected');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to reject deposit');
    },
  });
};


