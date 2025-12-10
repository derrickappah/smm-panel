import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Cached hook to get current user's role
 * This prevents redundant profile queries across all admin hooks
 */
export const useUserRole = () => {
  return useQuery({
    queryKey: ['user', 'role'],
    queryFn: async () => {
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
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - role doesn't change often
    gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache
    retry: 1,
  });
};

/**
 * Helper function to check if user is admin (for use in non-hook contexts)
 * This uses the same cache key as useUserRole
 */
export const checkUserRole = async () => {
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

