import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUserRole } from './useUserRole';
import { toast } from 'sonner';

// Fetch all services
const fetchServices = async () => {
  const { data, error } = await supabase
    .from('services')
    .select('id, name, description, rate, platform, enabled, min_quantity, max_quantity, service_type, smmgen_service_id, smmcost_service_id, display_order, created_at')
    .order('display_order', { ascending: true })
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
      // If display_order is not provided, set it to max + 1
      if (serviceData.display_order === undefined) {
        const { data: existingServices } = await supabase
          .from('services')
          .select('display_order')
          .order('display_order', { ascending: false })
          .limit(1);
        
        const maxOrder = existingServices && existingServices.length > 0 
          ? existingServices[0].display_order 
          : -1;
        serviceData.display_order = maxOrder + 1;
      }

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

export const useReorderServices = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (serviceIds) => {
      // serviceIds is an array of service IDs in the new order
      // We need to update each service's display_order to match its position in the array
      const updates = serviceIds.map((serviceId, index) => ({
        id: serviceId,
        display_order: index
      }));

      // Batch update all services
      const updatePromises = updates.map(({ id, display_order }) =>
        supabase
          .from('services')
          .update({ display_order })
          .eq('id', id)
      );

      const results = await Promise.all(updatePromises);
      
      // Check for errors
      const errors = results.filter(result => result.error);
      if (errors.length > 0) {
        throw new Error(errors[0].error.message || 'Failed to reorder services');
      }

      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'services'] });
      queryClient.invalidateQueries({ queryKey: ['services'] }); // Also invalidate user-facing services
      toast.success('Services reordered successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to reorder services');
    },
  });
};


