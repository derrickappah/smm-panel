import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

// Fetch published FAQs for public display
const fetchFAQs = async () => {
  const { data, error } = await supabase
    .from('faqs')
    .select('id, question, answer, "order"')
    .eq('published', true)
    .order('order', { ascending: true });

  if (error) {
    if (error.code === '42P01') {
      console.warn('FAQs table may not exist. Run CREATE_FAQS_TABLE.sql migration.');
      return [];
    }
    throw error;
  }

  return data || [];
};

// Fetch all FAQs (admin only)
const fetchAllFAQs = async () => {
  const { data, error } = await supabase
    .from('faqs')
    .select('*')
    .order('order', { ascending: true });

  if (error) {
    if (error.code === '42P01') {
      console.warn('FAQs table may not exist. Run CREATE_FAQS_TABLE.sql migration.');
      return [];
    }
    throw error;
  }

  return data || [];
};

// Create FAQ
const createFAQ = async (faqData) => {
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('faqs')
    .insert({
      ...faqData,
      created_by: user?.id
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Update FAQ
const updateFAQ = async ({ id, ...updates }) => {
  const { data, error } = await supabase
    .from('faqs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Delete FAQ
const deleteFAQ = async (id) => {
  const { error } = await supabase
    .from('faqs')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// Public hook: Fetch published FAQs
export const useFAQ = () => {
  return useQuery({
    queryKey: ['faqs'],
    queryFn: fetchFAQs,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Admin hook: Fetch all FAQs
export const useAllFAQs = () => {
  return useQuery({
    queryKey: ['admin', 'faqs'],
    queryFn: fetchAllFAQs,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};

// Admin hook: Create FAQ
export const useCreateFAQ = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createFAQ,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'faqs'] });
      queryClient.invalidateQueries({ queryKey: ['faqs'] });
      toast.success('FAQ created successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create FAQ');
    },
  });
};

// Admin hook: Update FAQ
export const useUpdateFAQ = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateFAQ,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'faqs'] });
      queryClient.invalidateQueries({ queryKey: ['faqs'] });
      toast.success('FAQ updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update FAQ');
    },
  });
};

// Admin hook: Delete FAQ
export const useDeleteFAQ = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteFAQ,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'faqs'] });
      queryClient.invalidateQueries({ queryKey: ['faqs'] });
      toast.success('FAQ deleted successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete FAQ');
    },
  });
};

