import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUserRole } from './useUserRole';

/**
 * useAdminStats - Fetches pre-aggregated dashboard stats from a single database RPC.
 * 
 * This replaces the old approach of fetching ALL orders (134K+), deposits (50K+),
 * users (36K+), and transactions (201K+) to the browser and computing stats client-side.
 * The new RPC returns a single JSON object with all stats pre-computed in ~100ms.
 */
export const useAdminStats = (options = {}) => {
  const { dateRangeStart, dateRangeEnd, enabled = true } = options;

  // Check role at hook level (cached)
  const { data: userRole, isLoading: roleLoading } = useUserRole();
  const isAdmin = userRole?.isAdmin ?? false;

  const queryEnabled = enabled && !roleLoading && isAdmin;

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'stats', 'dashboard', dateRangeStart, dateRangeEnd],
    queryFn: async () => {
      // Build RPC params
      const params = {};
      if (dateRangeStart) {
        const start = new Date(dateRangeStart);
        start.setHours(0, 0, 0, 0);
        params.p_date_range_start = start.toISOString();
      }
      if (dateRangeEnd) {
        const end = new Date(dateRangeEnd);
        end.setHours(23, 59, 59, 999);
        params.p_date_range_end = end.toISOString();
      }

      const { data, error } = await supabase.rpc('get_admin_dashboard_stats', params);

      if (error) {
        console.error('[useAdminStats] RPC error:', error);
        throw error;
      }

      return data;
    },
    enabled: queryEnabled,
    staleTime: 30 * 1000, // 30 seconds - stats don't need to be real-time
    gcTime: 60 * 1000,    // 1 minute cache
    refetchInterval: 60 * 1000, // Auto-refresh every 60 seconds
  });

  // Extract stats and sub-data from the RPC result
  const stats = data || {};

  return {
    data: stats,
    isLoading: isLoading && !data,
    error,
    // Expose recent data and top customers for AdminStats component
    recentOrders: stats.recent_orders || [],
    recentDeposits: stats.recent_deposits || [],
    topCustomers: stats.top_customers || [],
  };
};
