import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export const useServiceNotifications = (userId) => {
  const queryClient = useQueryClient();

  // Fetch pending notifications for this user
  const { data: notifications = [], isLoading, refetch } = useQuery({
    queryKey: ['user', 'service-notifications', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase.rpc('get_pending_service_notifications', {
        p_user_id: userId
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
    staleTime: 0, // Always check on mount
  });

  // Acknowledge a notification
  const acknowledgeMutation = useMutation({
    mutationFn: async ({ notificationId, orderId }) => {
      const { data, error } = await supabase
        .from('service_notification_acknowledgments')
        .insert({
          user_id: userId,
          notification_id: notificationId,
          order_id: orderId
        });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'service-notifications', userId] });
    },
    onError: (error) => {
      console.error('Acknowledgment error:', error);
      toast.error('Failed to save acknowledgment');
    }
  });

  return {
    notifications,
    isLoading,
    refetch,
    acknowledge: acknowledgeMutation.mutateAsync,
    isAcknowledging: acknowledgeMutation.isPending
  };
};
