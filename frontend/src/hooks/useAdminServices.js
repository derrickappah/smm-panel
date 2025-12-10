import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUserRole } from './useUserRole';
import { toast } from 'sonner';

// Fetch all services
const fetchServices = async () => {
  const { data, error } = await supabase
    .from('services')
    .select('id, name, description, rate, platform, enabled, min_quantity, max_quantity, service_type, smmgen_service_id, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const useAdminServices = (options = {}) => {
  const { enabled = true } = options;
  
  // Check role at hook level (cached)
  const { data: userRole, isLoading: roleLoading } = useUserRole();
  const isAdmin = userRole?.isAdmin ?? false;
  
  // Only enable queries if user is admin
  const queryEnabled = enabled && !roleLoading && isAdmin;

  return useQuery({
    queryKey: ['admin', 'services'],
    queryFn: fetchServices,
    enabled: queryEnabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const useCreateService = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (serviceData) => {
      const { data, error } = await supabase
        .from('services')
        .insert(serviceData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'services'] });
      queryClient.invalidateQueries({ queryKey: ['services'] }); // Also invalidate user-facing services
      toast.success('Service created successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create service');
    },
  });
};

export const useUpdateService = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ serviceId, updates }) => {
      const { data, error } = await supabase
        .from('services')
        .update(updates)
        .eq('id', serviceId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'services'] });
      queryClient.invalidateQueries({ queryKey: ['services'] }); // Also invalidate user-facing services
      toast.success('Service updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update service');
    },
  });
};

export const useDeleteService = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (serviceId) => {
      const { error } = await supabase
        .from('services')
        .delete()
        .eq('id', serviceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'services'] });
      queryClient.invalidateQueries({ queryKey: ['services'] }); // Also invalidate user-facing services
      toast.success('Service deleted successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete service');
    },
  });
};


