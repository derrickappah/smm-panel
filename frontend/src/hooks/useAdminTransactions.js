import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUserRole } from './useUserRole';
import { toast } from 'sonner';

const PAGE_SIZE = 50;

const fetchTransactions = async ({ pageParam = 0 }) => {
  const from = pageParam * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await supabase
    .from('transactions')
    .select('id, user_id, amount, type, status, created_at, paystack_status, reference, payment_method, payment_provider, profiles(email, name, balance)', { count: 'exact' })
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

// Fetch all transactions (for stats calculation) - Fetches ALL records efficiently using optimized pagination
const fetchAllTransactions = async () => {
  const BATCH_SIZE = 1000; // Fetch in batches for optimal performance
  let allTransactions = [];
  let from = 0;
  let hasMore = true;
  
  // First, get total count to optimize fetching
  const { count, error: countError } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true });
  
  if (countError) {
    throw countError;
  }

  // Fetch all batches - optimized sequential fetching for large datasets
  while (hasMore) {
    const to = from + BATCH_SIZE - 1;
    
    const { data, error } = await supabase
      .from('transactions')
      .select('id, user_id, amount, type, status, created_at, paystack_status, reference, payment_method, payment_provider, profiles(email, name, balance)')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw error;
    }

    if (data && data.length > 0) {
      allTransactions = allTransactions.concat(data);
      hasMore = data.length === BATCH_SIZE && allTransactions.length < (count || Infinity);
      from += BATCH_SIZE;
    } else {
      hasMore = false;
    }
  }

  return allTransactions;
};

export const useAdminTransactions = (options = {}) => {
  const { enabled = true, useInfinite = false } = options;
  
  // Check role at hook level (cached)
  const { data: userRole, isLoading: roleLoading } = useUserRole();
  const isAdmin = userRole?.isAdmin ?? false;
  
  // Only enable queries if user is admin
  const queryEnabled = enabled && !roleLoading && isAdmin;

  if (useInfinite) {
    return useInfiniteQuery({
      queryKey: ['admin', 'transactions'],
      queryFn: fetchTransactions,
      getNextPageParam: (lastPage) => lastPage.nextPage,
      initialPageParam: 0,
      enabled: queryEnabled,
      staleTime: 2 * 60 * 1000,
      gcTime: 5 * 60 * 1000,
    });
  }

  return useQuery({
    queryKey: ['admin', 'transactions', 'all'],
    queryFn: fetchAllTransactions,
    enabled: queryEnabled,
    staleTime: 3 * 60 * 1000, // 3 minutes - increased for better caching
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache longer
  });
};




