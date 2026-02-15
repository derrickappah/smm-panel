import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Custom hook to check reward eligibility
 * @returns {Object} Query result with eligibility status
 */
export function useRewardEligibility() {
    return useQuery({
        queryKey: ['reward-eligibility'],
        queryFn: async () => {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !session) throw new Error('Not authenticated');

            const { data, error } = await supabase.rpc('get_user_reward_status');

            if (error) {
                console.error('RPC Error:', error);
                throw new Error(error.message || 'Failed to check eligibility');
            }

            return data;
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: 1
    });
}
