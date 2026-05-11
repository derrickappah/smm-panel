import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export const useAdminServiceNotifications = () => {
  const queryClient = useQueryClient();

  // Fetch all notifications with acknowledgment counts
  const { data: notifications = [], isLoading, refetch } = useQuery({
    queryKey: ['admin', 'service-notifications'],
    queryFn: async () => {
      // Fetch notifications
      const { data: notifications, error: notificationsError } = await supabase
        .from('service_notifications')
        .select(`
          *,
          service:services(id, name, platform)
        `)
        .order('created_at', { ascending: false });

      if (notificationsError) throw notificationsError;

      // Fetch acknowledgment counts for each notification
      const { data: counts, error: countsError } = await supabase
        .from('service_notification_acknowledgments')
        .select('notification_id', { count: 'exact', head: false });

      if (countsError) throw countsError;

      // Map counts to notifications
      const mappedNotifications = notifications.map(n => {
        const count = counts?.filter(c => c.notification_id === n.id).length || 0;
        return { ...n, acknowledgment_count: count };
      });

      return mappedNotifications;
    }
  });

  // Create notification
  const createMutation = useMutation({
    mutationFn: async (newNotification) => {
      const { data, error } = await supabase
        .from('service_notifications')
        .insert(newNotification)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'service-notifications'] });
      toast.success('Notification created successfully');
    },
    onError: (error) => {
      console.error('Create notification error:', error);
      toast.error('Failed to create notification');
    }
  });

  // Update notification
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }) => {
      const { data, error } = await supabase
        .from('service_notifications')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'service-notifications'] });
      toast.success('Notification updated successfully');
    },
    onError: (error) => {
      console.error('Update notification error:', error);
      toast.error('Failed to update notification');
    }
  });

  // Delete notification
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('service_notifications')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'service-notifications'] });
      toast.success('Notification deleted successfully');
    },
    onError: (error) => {
      console.error('Delete notification error:', error);
      toast.error('Failed to delete notification');
    }
  });

  return {
    notifications,
    isLoading,
    refetch,
    createNotification: createMutation.mutateAsync,
    updateNotification: updateMutation.mutateAsync,
    deleteNotification: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending
  };
};
