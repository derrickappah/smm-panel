import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export const DEFAULT_ANNOUNCEMENT = {
  id: 'default',
  message: '⚡ ORDERS PROCESSING SPEED: FAST & ACTIVE !! 🚀 24/7 AUTOMATED DELIVERY ACROSS ALL SERVICES',
  enabled: true,
  speed: 'normal',
  theme: 'navy',
  display_scope: 'all'
};

// Fetch current announcement config
export const fetchAnnouncement = async () => {
  try {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      if (error.code === '42P01') {
        // Table doesn't exist yet, return safe default
        console.warn('[Announcement] Table "announcements" does not exist yet. Using default configuration.');
        return DEFAULT_ANNOUNCEMENT;
      }
      throw error;
    }

    if (data && data.length > 0) {
      return data[0];
    }

    return DEFAULT_ANNOUNCEMENT;
  } catch (err) {
    console.warn('[Announcement] Error fetching announcement:', err);
    return DEFAULT_ANNOUNCEMENT;
  }
};

// Hook for fetching and subscribing to announcement updates
export const useAnnouncement = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['announcement'],
    queryFn: fetchAnnouncement,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: true,
  });

  // Setup realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('announcements-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'announcements' },
        (payload) => {
          if (payload.new) {
            queryClient.setQueryData(['announcement'], payload.new);
          } else {
            queryClient.invalidateQueries({ queryKey: ['announcement'] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
};

// Mutation for saving/updating announcement settings
export const useUpdateAnnouncement = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (announcementData) => {
      const { id, ...dataToSave } = announcementData;
      dataToSave.updated_at = new Date().toISOString();

      if (id && id !== 'default') {
        const { data, error } = await supabase
          .from('announcements')
          .update(dataToSave)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // First check if an announcement already exists to update it
        const { data: existing } = await supabase
          .from('announcements')
          .select('id')
          .limit(1);

        if (existing && existing.length > 0) {
          const { data, error } = await supabase
            .from('announcements')
            .update(dataToSave)
            .eq('id', existing[0].id)
            .select()
            .single();

          if (error) throw error;
          return data;
        } else {
          const { data, error } = await supabase
            .from('announcements')
            .insert([dataToSave])
            .select()
            .single();

          if (error) throw error;
          return data;
        }
      }
    },
    onSuccess: (updatedData) => {
      queryClient.setQueryData(['announcement'], updatedData);
      queryClient.invalidateQueries({ queryKey: ['announcement'] });
      toast.success('Announcement bar updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update announcement bar');
    },
  });
};
