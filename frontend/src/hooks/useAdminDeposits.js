import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUserRole } from './useUserRole';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

export const useAdminDeposits = (options = {}) => {
  const {
    enabled = true,
    page = 1,
    limit = 50,
    search = '',
    status = 'all',
    date = ''
  } = options;

  // Check role at hook level (cached)
  const { data: userRole, isLoading: roleLoading } = useUserRole();
  const isAdmin = userRole?.isAdmin ?? false;

  // Only enable queries if user is admin
  const queryEnabled = enabled && !roleLoading && isAdmin;

  const queryClient = useQueryClient();
  const isSubscribedRef = useRef(false);

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
          console.log('[useAdminDeposits] Realtime event received:', payload.eventType);
          // Invalidate admin deposits, stats, and users to trigger a fresh background fetch
          queryClient.invalidateQueries({ queryKey: ['admin', 'deposits'] });
          queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
          queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
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
  }, [queryEnabled, queryClient]);

  return useQuery({
    queryKey: ['admin', 'deposits', { page, limit, search, status, date }],
    queryFn: async () => {
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      let query = supabase
        .from('transactions')
        .select('id, user_id, amount, type, status, created_at, paystack_status, paystack_reference, manual_reference, korapay_reference, deposit_method, payment_proof_url, profiles!transactions_user_id_fkey(email, name, phone_number)', { count: 'exact' })
        .eq('type', 'deposit')
        .order('created_at', { ascending: false });

      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      if (date) {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.gte('created_at', startOfDay.toISOString()).lte('created_at', endOfDay.toISOString());
      }

      if (search) {
        const searchClean = search.trim();
        const searchEscaped = searchClean.replace(/[,()]/g, '');
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(searchClean);

        // Fetch profiles matching search first
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id')
          .or(`name.ilike.%${searchEscaped}%,email.ilike.%${searchEscaped}%,phone_number.ilike.%${searchEscaped}%`)
          .limit(100);

        const matchingUserIds = profiles ? profiles.map(p => p.id) : [];

        let filterParts = [];
        if (matchingUserIds.length > 0) {
          filterParts.push(`user_id.in.(${matchingUserIds.join(',')})`);
        }
        if (isUuid) {
          filterParts.push(`id.eq.${searchClean}`);
        }
        
        // Direct search on transaction reference fields
        if (searchEscaped) {
          filterParts.push(`paystack_reference.ilike.%${searchEscaped}%`);
          filterParts.push(`manual_reference.ilike.%${searchEscaped}%`);
          filterParts.push(`korapay_reference.ilike.%${searchEscaped}%`);
        }

        if (filterParts.length > 0) {
          query = query.or(filterParts.join(','));
        } else {
          // No match, return empty page immediately
          return { data: [], total: 0 };
        }
      }

      const { data, error, count } = await query.range(from, to);

      if (error) {
        if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('policy')) {
          toast.error('RLS Policy Error: Cannot view all transactions. Please run database/fixes/FIX_ADMIN_RLS.sql in Supabase SQL Editor.');
        }
        throw error;
      }

      return {
        data: data || [],
        total: count || 0
      };
    },
    enabled: queryEnabled,
    staleTime: 0,
    gcTime: 0
  });
};;

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

export const useBanUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, reason, rejectPending = true }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No session. Please log in again.');

      const response = await fetch('/api/admin/ban-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          userId,
          reason,
          rejectPending
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to ban user');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'deposits'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast.success(data.message || 'User banned successfully');
    },
    onError: (error) => {
      console.error('[ADMIN] Ban user error:', error);
      toast.error(error.message || 'Failed to ban user');
    },
  });
};


