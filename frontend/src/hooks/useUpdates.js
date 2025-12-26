import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

// Fetch published updates for public display
const fetchUpdates = async () => {
  const { data, error } = await supabase
    .from('updates')
    .select('id, title, content, type, priority, created_at, updated_at')
    .eq('published', true)
    .order('created_at', { ascending: false });

  if (error) {
    if (error.code === '42P01') {
      console.warn('Updates table may not exist. Run CREATE_UPDATES_TABLE.sql migration.');
      return [];
    }
    throw error;
  }

  return data || [];
};

// Fetch all updates (admin only)
const fetchAllUpdates = async () => {
  const { data, error } = await supabase
    .from('updates')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    if (error.code === '42P01') {
      console.warn('Updates table may not exist. Run CREATE_UPDATES_TABLE.sql migration.');
      return [];
    }
    throw error;
  }

  return data || [];
};

// Create update
const createUpdate = async (updateData) => {
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('updates')
    .insert({
      ...updateData,
      created_by: user?.id
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Update update
const updateUpdate = async ({ id, ...updates }) => {
  const { data, error } = await supabase
    .from('updates')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Delete update
const deleteUpdate = async (id) => {
  const { error } = await supabase
    .from('updates')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// Public hook: Fetch published updates
export const useUpdates = () => {
  return useQuery({
    queryKey: ['updates'],
    queryFn: fetchUpdates,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Admin hook: Fetch all updates
export const useAllUpdates = () => {
  return useQuery({
    queryKey: ['admin', 'updates'],
    queryFn: fetchAllUpdates,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};

// Admin hook: Create update
export const useCreateUpdate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createUpdate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'updates'] });
      queryClient.invalidateQueries({ queryKey: ['updates'] });
      toast.success('Update created successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create update');
    },
  });
};

// Admin hook: Update update
export const useUpdateUpdate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateUpdate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'updates'] });
      queryClient.invalidateQueries({ queryKey: ['updates'] });
      toast.success('Update updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update update');
    },
  });
};

// Admin hook: Delete update
export const useDeleteUpdate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteUpdate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'updates'] });
      queryClient.invalidateQueries({ queryKey: ['updates'] });
      toast.success('Update deleted successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete update');
    },
  });
};

