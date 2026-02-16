import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Custom hook for admin reward management
 */

// Fetch all reward claims with optional filters
export function useAdminRewardClaims(filters = {}) {
    return useQuery({
        queryKey: ['admin', 'reward-claims', filters],
        queryFn: async () => {
            let query = supabase
                .from('daily_reward_claims')
                .select(`
          id,
          user_id,
          deposit_total,
          link,
          claim_date,
          reward_type,
          reward_amount,
          created_at,
          status,
          order_id,
          service_id,
          profiles!inner(email, name)
        `)
                .order('created_at', { ascending: false });

            // Apply filters
            if (filters.startDate) {
                query = query.gte('claim_date', filters.startDate);
            }
            if (filters.endDate) {
                query = query.lte('claim_date', filters.endDate);
            }
            if (filters.userId) {
                query = query.eq('user_id', filters.userId);
            }

            const { data, error } = await query;

            if (error) throw error;
            return data;
        },
        staleTime: 2 * 60 * 1000, // 2 minutes
    });
}

// Fetch reward settings
export function useRewardSettings() {
    return useQuery({
        queryKey: ['admin', 'reward-settings'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('reward_settings')
                .select('*')
                .single();

            if (error) throw error;
            return data;
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

// Fetch reward setting audit logs
export function useRewardSettingLogs(limit = 20) {
    return useQuery({
        queryKey: ['admin', 'reward-setting-logs', limit],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('reward_setting_logs')
                .select(`
          id,
          admin_id,
          old_value,
          new_value,
          created_at,
          profiles!inner(email, name)
        `)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return data;
        },
        staleTime: 2 * 60 * 1000, // 2 minutes
    });
}

// Fetch all reward tiers
export function useRewardTiers() {
    return useQuery({
        queryKey: ['admin', 'reward-tiers'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('reward_tiers')
                .select('*')
                .order('position', { ascending: true });

            if (error) throw error;
            return data;
        },
        staleTime: 5 * 60 * 1000,
    });
}

// Upsert reward tier (Add or Update)
export function useUpsertRewardTier() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (tier) => {
            const { data, error } = await supabase.rpc('admin_upsert_reward_tier', {
                id_param: tier.id || null,
                name_param: tier.name,
                required_amount_param: tier.required_amount,
                reward_likes_param: tier.reward_likes,
                reward_views_param: tier.reward_views,
                position_param: tier.position
            });

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'reward-tiers'] });
        }
    });
}

// Delete reward tier
export function useDeleteRewardTier() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id) => {
            const { data, error } = await supabase.rpc('admin_delete_reward_tier', {
                tier_id_param: id
            });

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'reward-tiers'] });
        }
    });
}

// Fetch reward statistics
export function useRewardStats() {
    return useQuery({
        queryKey: ['admin', 'reward-stats'],
        queryFn: async () => {
            const today = new Date().toISOString().split('T')[0];
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            // Claims today
            const { data: todayClaims, error: todayError } = await supabase
                .from('daily_reward_claims')
                .select('id', { count: 'exact', head: true })
                .eq('claim_date', today);

            if (todayError) throw todayError;

            // Claims this week
            const { data: weekClaims, error: weekError } = await supabase
                .from('daily_reward_claims')
                .select('id', { count: 'exact', head: true })
                .gte('claim_date', weekAgo);

            if (weekError) throw weekError;

            // Unique users
            const { data: uniqueUsers, error: usersError } = await supabase
                .from('daily_reward_claims')
                .select('user_id');

            if (usersError) throw usersError;

            const uniqueUserCount = new Set(uniqueUsers?.map(u => u.user_id)).size;

            // Average deposit
            const { data: avgDeposit, error: avgError } = await supabase
                .from('daily_reward_claims')
                .select('deposit_total');

            if (avgError) throw avgError;

            const averageDeposit = avgDeposit?.length > 0
                ? avgDeposit.reduce((sum, c) => sum + parseFloat(c.deposit_total), 0) / avgDeposit.length
                : 0;

            return {
                claimsToday: todayClaims?.length || 0,
                claimsThisWeek: weekClaims?.length || 0,
                uniqueUsers: uniqueUserCount,
                averageDeposit: averageDeposit
            };
        },
        staleTime: 1 * 60 * 1000, // 1 minute
    });
}

// Create reward order (Process Claim)
export function useProcessRewardOrder() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ claimId, serviceId, quantity }) => {
            const { data, error } = await supabase.rpc('admin_create_reward_order', {
                claim_id_param: claimId,
                service_id_param: serviceId,
                quantity_param: quantity
            });

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'reward-claims'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'reward-stats'] });
        }
    });
}
