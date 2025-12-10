import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';

const ROLE_QUERY_KEY = ['user', 'role'];

/**
 * Fetch user role from database
 * Internal function used by both hook and helper
 */
const fetchUserRole = async () => {
  const { data: currentUser } = await supabase.auth.getUser();
  if (!currentUser?.user) {
    throw new Error('Not authenticated');
  }

  const { data: userProfile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', currentUser.user.id)
    .single();

  if (error) {
    throw error;
  }

  return {
    userId: currentUser.user.id,
    role: userProfile?.role || 'user',
    isAdmin: userProfile?.role === 'admin',
  };
};

/**
 * Cached hook to get current user's role
 * This prevents redundant profile queries across all admin hooks
 */
export const useUserRole = () => {
  return useQuery({
    queryKey: ROLE_QUERY_KEY,
    queryFn: fetchUserRole,
    staleTime: 10 * 60 * 1000, // 10 minutes - role rarely changes
    gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache longer
    retry: 1,
  });
};

/**
 * Helper function to check if user is admin (for use in non-hook contexts)
 * This reads from React Query cache first, then fetches if not cached
 * This prevents redundant database queries across all admin hooks
 */
export const checkUserRole = async () => {
  // Try to get from cache first
  const cachedData = queryClient.getQueryData(ROLE_QUERY_KEY);
  if (cachedData) {
    return cachedData;
  }

  // Check if there's a pending query
  const queryState = queryClient.getQueryState(ROLE_QUERY_KEY);
  if (queryState?.status === 'pending') {
    // Wait for the pending query to complete
    return queryClient.fetchQuery({
      queryKey: ROLE_QUERY_KEY,
      queryFn: fetchUserRole,
      staleTime: 10 * 60 * 1000,
    });
  }

  // Fetch and cache the result
  return queryClient.fetchQuery({
    queryKey: ROLE_QUERY_KEY,
    queryFn: fetchUserRole,
    staleTime: 10 * 60 * 1000,
  });
};

