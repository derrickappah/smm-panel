import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUserRole } from './useUserRole';
import { toast } from 'sonner';

// Fetch all canned responses (admin only)
const fetchCannedResponses = async (searchTerm = '', category = '') => {
  let query = supabase
    .from('canned_responses')
    .select('id, title, content, category, tags, usage_count, created_at, updated_at')
    .order('usage_count', { ascending: false });

  if (searchTerm) {
    query = query.or(`title.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%`);
  }

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) {
    if (error.code === '42P01') {
      console.warn('Canned responses table may not exist. Run CREATE_CANNED_RESPONSES.sql migration.');
      return [];
    }
    throw error;
  }

  return data || [];
};

// Create canned response
const createCannedResponse = async (responseData) => {
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('canned_responses')
    .insert({
      ...responseData,
      created_by: user?.id
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Update canned response
const updateCannedResponse = async ({ id, ...updates }) => {
  const { data, error } = await supabase
    .from('canned_responses')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Delete canned response
const deleteCannedResponse = async (id) => {
  const { error } = await supabase
    .from('canned_responses')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// Increment usage count
const incrementUsage = async (responseId) => {
  const { error } = await supabase.rpc('increment_canned_response_usage', {
    response_id: responseId
  });

  if (error) throw error;
};

export const useCannedResponses = (searchTerm = '', category = '') => {
  const { data: userRole } = useUserRole();
  const isAdmin = userRole?.isAdmin ?? false;

  return useQuery({
    queryKey: ['canned_responses', searchTerm, category],
    queryFn: () => fetchCannedResponses(searchTerm, category),
    enabled: isAdmin,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000,
  });
};

export const useCreateCannedResponse = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCannedResponse,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canned_responses'] });
      toast.success('Canned response created successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create canned response');
    },
  });
};

export const useUpdateCannedResponse = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateCannedResponse,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canned_responses'] });
      toast.success('Canned response updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update canned response');
    },
  });
};

export const useDeleteCannedResponse = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCannedResponse,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canned_responses'] });
      toast.success('Canned response deleted successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete canned response');
    },
  });
};

export const useIncrementCannedResponseUsage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: incrementUsage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canned_responses'] });
    },
  });
};



