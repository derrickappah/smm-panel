import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

const PAGE_SIZE = 50;

// Fetch users with pagination
const fetchUsers = async ({ pageParam = 0 }) => {
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

// Fetch all users (for stats calculation)
const fetchAllUsers = async () => {
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
        .from('profiles')
        .select('id, email, name, balance, role, phone_number, created_at')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error(`Error fetching users batch (from ${from} to ${to}):`, error);
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
      console.error('Error in fetchAllUsers batch:', error);
      // If we have some records, return them rather than failing completely
      if (allRecords.length > 0) {
        console.warn(`Returning partial user data (${allRecords.length} records) due to error`);
        return allRecords;
      }
      throw error;
    }
  }

  if (iterations >= maxIterations) {
    console.warn(`fetchAllUsers reached max iterations (${maxIterations}), returning ${allRecords.length} records`);
  }

  return allRecords;
};

export const useAdminUsers = (options = {}) => {
  const { enabled = true, useInfinite = false } = options;

  if (useInfinite) {
    return useInfiniteQuery({
      queryKey: ['admin', 'users'],
      queryFn: fetchUsers,
      getNextPageParam: (lastPage) => lastPage.nextPage,
      initialPageParam: 0,
      enabled,
      staleTime: 2 * 60 * 1000, // 2 minutes
      gcTime: 5 * 60 * 1000, // 5 minutes
    });
  }

  return useQuery({
    queryKey: ['admin', 'users', 'all'],
    queryFn: fetchAllUsers,
    enabled,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
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


