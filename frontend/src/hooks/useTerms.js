import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// Fetch terms and conditions from app_settings
export const useTerms = () => {
  return useQuery({
    queryKey: ['terms'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value, updated_at')
        .eq('key', 'terms_and_conditions')
        .single();

      if (error) {
        // If not found, return null - no fallback
        if (error.code === 'PGRST116') {
          return {
            content: null,
            updated_at: null
          };
        }
        throw error;
      }

      return {
        content: data?.value || null,
        updated_at: data?.updated_at || null
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

// Update terms and conditions (admin only)
export const useUpdateTerms = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (content) => {
      const { data, error } = await supabase
        .from('app_settings')
        .upsert({
          key: 'terms_and_conditions',
          value: content,
          description: 'Terms and Conditions content that users must accept during signup'
        }, {
          onConflict: 'key'
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terms'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'terms'] });
    },
  });
};


