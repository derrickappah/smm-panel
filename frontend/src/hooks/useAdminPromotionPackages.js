import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUserRole } from './useUserRole';
import { toast } from 'sonner';

// Fetch all promotion packages
const fetchPromotionPackages = async () => {
  const { data, error } = await supabase
    .from('promotion_packages')
    .select('*')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

// Fetch enabled promotion packages (for public display)
const fetchEnabledPromotionPackages = async () => {
  const { data, error } = await supabase
    .from('promotion_packages')
    .select('*')
    .eq('enabled', true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const useAdminPromotionPackages = (options = {}) => {
  const { enabled = true } = options;
  
  // Check role at hook level (cached)
  const { data: userRole, isLoading: roleLoading } = useUserRole();
  const isAdmin = userRole?.isAdmin ?? false;
  
  // Only enable queries if user is admin
  const queryEnabled = enabled && !roleLoading && isAdmin;

  return useQuery({
    queryKey: ['admin', 'promotion-packages'],
    queryFn: fetchPromotionPackages,
    enabled: queryEnabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Hook for fetching enabled packages (public, no admin check)
export const usePromotionPackages = (options = {}) => {
  const { enabled = true } = options;

  return useQuery({
    queryKey: ['promotion-packages'],
    queryFn: fetchEnabledPromotionPackages,
    enabled: enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes,
  });
};

export const useCreatePromotionPackage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (packageData) => {
      const { data, error } = await supabase
        .from('promotion_packages')
        .insert(packageData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'promotion-packages'] });
      queryClient.invalidateQueries({ queryKey: ['promotion-packages'] });
      toast.success('Promotion package created successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create promotion package');
    },
  });
};

export const useUpdatePromotionPackage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ packageId, updates }) => {
      const { data, error } = await supabase
        .from('promotion_packages')
        .update(updates)
        .eq('id', packageId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'promotion-packages'] });
      queryClient.invalidateQueries({ queryKey: ['promotion-packages'] });
      toast.success('Promotion package updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update promotion package');
    },
  });
};

export const useDeletePromotionPackage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (packageId) => {
      const { error } = await supabase
        .from('promotion_packages')
        .delete()
        .eq('id', packageId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'promotion-packages'] });
      queryClient.invalidateQueries({ queryKey: ['promotion-packages'] });
      toast.success('Promotion package deleted successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete promotion package');
    },
  });
};

