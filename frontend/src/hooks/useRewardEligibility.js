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
            // Get current session token
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();

            if (sessionError || !session) {
                throw new Error('Not authenticated');
            }

            const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';
            const response = await fetch(`${BACKEND_URL}/api/reward/check-reward-eligibility`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || 'Failed to check eligibility');
            }

            return response.json();
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: 1
    });
}
