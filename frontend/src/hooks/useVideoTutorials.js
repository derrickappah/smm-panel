import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

// Fetch published video tutorials for public display
const fetchVideoTutorials = async () => {
  const { data, error } = await supabase
    .from('video_tutorials')
    .select('id, title, description, video_url, thumbnail_url, category, duration, "order", views, created_at')
    .eq('published', true)
    .order('order', { ascending: true });

  if (error) {
    if (error.code === '42P01') {
      console.warn('Video tutorials table may not exist. Run CREATE_VIDEO_TUTORIALS_TABLE.sql migration.');
      return [];
    }
    throw error;
  }

  return data || [];
};

// Fetch all video tutorials (admin only)
const fetchAllVideoTutorials = async () => {
  const { data, error } = await supabase
    .from('video_tutorials')
    .select('*')
    .order('order', { ascending: true });

  if (error) {
    if (error.code === '42P01') {
      console.warn('Video tutorials table may not exist. Run CREATE_VIDEO_TUTORIALS_TABLE.sql migration.');
      return [];
    }
    throw error;
  }

  return data || [];
};

// Create video tutorial
const createVideoTutorial = async (tutorialData) => {
  const { data: { user } } = await supabase.auth.getUser();
  
  console.log('createVideoTutorial - received data:', tutorialData);
  
  const insertData = {
    ...tutorialData,
    created_by: user?.id
  };
  
  console.log('createVideoTutorial - inserting data:', insertData);
  
  const { data, error } = await supabase
    .from('video_tutorials')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('createVideoTutorial - error:', error);
    throw error;
  }
  
  console.log('createVideoTutorial - success, returned data:', data);
  return data;
};

// Update video tutorial
const updateVideoTutorial = async ({ id, ...updates }) => {
  console.log('updateVideoTutorial - id:', id, 'updates:', updates);
  
  const { data, error } = await supabase
    .from('video_tutorials')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('updateVideoTutorial - error:', error);
    throw error;
  }
  
  console.log('updateVideoTutorial - success, returned data:', data);
  return data;
};

// Delete video tutorial
const deleteVideoTutorial = async (id) => {
  const { error } = await supabase
    .from('video_tutorials')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// Increment views
const incrementViews = async (id) => {
  const { error } = await supabase.rpc('increment_video_views', { video_id: id });
  if (error) {
    // Fallback: manual update if RPC doesn't exist
    const { data } = await supabase
      .from('video_tutorials')
      .select('views')
      .eq('id', id)
      .single();
    
    if (data) {
      await supabase
        .from('video_tutorials')
        .update({ views: (data.views || 0) + 1 })
        .eq('id', id);
    }
  }
};

// Public hook: Fetch published video tutorials
export const useVideoTutorials = () => {
  return useQuery({
    queryKey: ['video-tutorials'],
    queryFn: fetchVideoTutorials,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Admin hook: Fetch all video tutorials
export const useAllVideoTutorials = () => {
  return useQuery({
    queryKey: ['admin', 'video-tutorials'],
    queryFn: fetchAllVideoTutorials,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};

// Admin hook: Create video tutorial
export const useCreateVideoTutorial = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createVideoTutorial,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'video-tutorials'] });
      queryClient.invalidateQueries({ queryKey: ['video-tutorials'] });
      toast.success('Video tutorial created successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create video tutorial');
    },
  });
};

// Admin hook: Update video tutorial
export const useUpdateVideoTutorial = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateVideoTutorial,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'video-tutorials'] });
      queryClient.invalidateQueries({ queryKey: ['video-tutorials'] });
      toast.success('Video tutorial updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update video tutorial');
    },
  });
};

// Admin hook: Delete video tutorial
export const useDeleteVideoTutorial = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteVideoTutorial,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'video-tutorials'] });
      queryClient.invalidateQueries({ queryKey: ['video-tutorials'] });
      toast.success('Video tutorial deleted successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete video tutorial');
    },
  });
};

// Hook to increment views
export const useIncrementVideoViews = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: incrementViews,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['video-tutorials'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'video-tutorials'] });
    },
  });
};

