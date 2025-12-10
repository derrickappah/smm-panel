import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { checkUserRole } from './useUserRole';
import { toast } from 'sonner';

const PAGE_SIZE = 50;

const fetchTransactions = async ({ pageParam = 0 }) => {
  const userRole = await checkUserRole();
  
  if (!userRole.isAdmin) {
    throw new Error('Access denied. Admin role required.');
  }

  const from = pageParam * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await supabase
    .from('transactions')
    .select('*, profiles(email, name, balance)', { count: 'exact' })
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

// Fetch all transactions (for stats calculation) - Optimized with limit
// Only fetch what's needed for stats, not all records
const fetchAllTransactions = async () => {
  const userRole = await checkUserRole();
  
  if (!userRole.isAdmin) {
    throw new Error('Access denied. Admin role required.');
  }

  // For stats, we typically only need recent transactions or aggregated data
  // Limit to last 5000 transactions instead of fetching everything
  const { data, error } = await supabase
    .from('transactions')
    .select('*, profiles(email, name, balance)')
    .order('created_at', { ascending: false })
    .limit(5000);

  if (error) {
    throw error;
  }

  return data || [];
};

export const useAdminTransactions = (options = {}) => {
  const { enabled = true, useInfinite = false } = options;

  if (useInfinite) {
    return useInfiniteQuery({
      queryKey: ['admin', 'transactions'],
      queryFn: fetchTransactions,
      getNextPageParam: (lastPage) => lastPage.nextPage,
      initialPageParam: 0,
      enabled,
      staleTime: 2 * 60 * 1000,
      gcTime: 5 * 60 * 1000,
    });
  }

  return useQuery({
    queryKey: ['admin', 'transactions', 'all'],
    queryFn: fetchAllTransactions,
    enabled,
    staleTime: 3 * 60 * 1000, // 3 minutes - increased for better caching
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache longer
  });
};




