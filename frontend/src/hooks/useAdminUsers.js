import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUserRole } from './useUserRole';
import { toast } from 'sonner';

const PAGE_SIZE = 50;

// Fetch users with pagination
const fetchUsers = async ({ pageParam = 0 }) => {
  const from = pageParam * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await supabase
    .from('profiles')
    .select('id, email, name, balance, role, phone_number, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('policy')) {
      toast.error('RLS Policy Error: Cannot view all users. Please run database/fixes/FIX_ADMIN_RLS.sql in Supabase SQL Editor.');
    }
    throw error;
  }

  return {
    data: data || [],
    nextPage: data && data.length === PAGE_SIZE ? pageParam + 1 : undefined,
    total: count || 0,
  };
};

// Fetch all users (for stats calculation) - Fetches ALL records efficiently using optimized pagination
const fetchAllUsers = async () => {
  const BATCH_SIZE = 1000; // Fetch in batches for optimal performance
  let allUsers = [];
  let from = 0;
  let hasMore = true;
  
  // First, get total count to optimize fetching
  const { count, error: countError } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true });
  
  if (countError) {
    throw countError;
  }
  
  // Fetch all batches - optimized sequential fetching for large datasets
  while (hasMore) {
    const to = from + BATCH_SIZE - 1;
    
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, name, balance, role, phone_number, created_at')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw error;
    }

    if (data && data.length > 0) {
      allUsers = allUsers.concat(data);
      hasMore = data.length === BATCH_SIZE && allUsers.length < (count || Infinity);
      from += BATCH_SIZE;
    } else {
      hasMore = false;
    }
  }

  return allUsers;
};

export const useAdminUsers = (options = {}) => {
  const { enabled = true, useInfinite = false } = options;
  
  // Check role at hook level (cached)
  const { data: userRole, isLoading: roleLoading } = useUserRole();
  const isAdmin = userRole?.isAdmin ?? false;
  
  // Only enable queries if user is admin
  const queryEnabled = enabled && !roleLoading && isAdmin;

  if (useInfinite) {
    return useInfiniteQuery({
      queryKey: ['admin', 'users'],
      queryFn: fetchUsers,
      getNextPageParam: (lastPage) => lastPage.nextPage,
      initialPageParam: 0,
      enabled: queryEnabled,
      staleTime: 2 * 60 * 1000, // 2 minutes
      gcTime: 5 * 60 * 1000, // 5 minutes
    });
  }

  return useQuery({
    queryKey: ['admin', 'users', 'all'],
    queryFn: fetchAllUsers,
    enabled: queryEnabled,
    staleTime: 3 * 60 * 1000, // 3 minutes - increased for better caching
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache longer
  });
};

export const useUpdateUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, updates }) => {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.success('User updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update user');
    },
  });
};

export const useDeleteUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId) => {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.success('User deleted successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete user');
    },
  });
};


