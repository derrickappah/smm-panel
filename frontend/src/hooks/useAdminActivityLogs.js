import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUserRole } from './useUserRole';

const PAGE_SIZE = 1000;

// Fetch activity logs with filters and pagination
const fetchActivityLogs = async ({ pageParam = 0, filters = {} }) => {
  const from = pageParam * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('activity_logs')
    .select(`
      id,
      user_id,
      action_type,
      entity_type,
      entity_id,
      description,
      metadata,
      severity,
      ip_address,
      user_agent,
      created_at,
      profiles (
        id,
        email,
        name
      )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  // Apply filters
  if (filters.user_id) {
    query = query.eq('user_id', filters.user_id);
  }
  if (filters.action_type) {
    query = query.eq('action_type', filters.action_type);
  }
  if (filters.entity_type) {
    query = query.eq('entity_type', filters.entity_type);
  }
  if (filters.severity) {
    query = query.eq('severity', filters.severity);
  }
  if (filters.start_date) {
    query = query.gte('created_at', filters.start_date);
  }
  if (filters.end_date) {
    query = query.lte('created_at', filters.end_date);
  }
  if (filters.search) {
    query = query.or(`description.ilike.%${filters.search}%,action_type.ilike.%${filters.search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('policy')) {
      console.error('RLS Policy Error:', error);
      // Return empty result instead of throwing to prevent UI crash
      return {
        data: [],
        nextPage: undefined,
        total: 0,
      };
    }
    if (error.code === '42P01') {
      // Table doesn't exist - migrations not run
      console.error('Table does not exist. Please run database migrations.');
      return {
        data: [],
        nextPage: undefined,
        total: 0,
      };
    }
    console.error('Error fetching activity logs:', error);
    throw error;
  }

  return {
    data: data || [],
    nextPage: data && data.length === PAGE_SIZE ? pageParam + 1 : undefined,
    total: count || 0,
  };
};

// Fetch activity statistics
const fetchActivityStatistics = async (days = 30) => {
  const { data, error } = await supabase.rpc('get_activity_statistics', {
    p_days: days
  });

  if (error) {
    throw error;
  }

  return data?.[0] || {
    total_activities: 0,
    activities_by_type: {},
    activities_by_severity: {},
    security_events_count: 0,
    most_active_users: [],
    recent_activities: []
  };
};

// Fetch security events
const fetchSecurityEvents = async (days = 7) => {
  const { data, error } = await supabase.rpc('get_security_events', {
    p_days: days
  });

  if (error) {
    throw error;
  }

  return data || [];
};

// Export activity logs with filters
const exportActivityLogs = async (filters = {}) => {
  const { data, error } = await supabase.rpc('export_activity_logs', {
    p_user_id: filters.user_id || null,
    p_action_type: filters.action_type || null,
    p_entity_type: filters.entity_type || null,
    p_severity: filters.severity || null,
    p_start_date: filters.start_date || null,
    p_end_date: filters.end_date || null,
    p_limit: filters.limit || 10000
  });

  if (error) {
    throw error;
  }

  return data || [];
};

export const useAdminActivityLogs = (options = {}) => {
  const { 
    enabled = true, 
    useInfinite = true,
    filters = {}
  } = options;
  
  // Check role at hook level (cached)
  const { data: userRole, isLoading: roleLoading } = useUserRole();
  const isAdmin = userRole?.isAdmin ?? false;
  
  // Only enable queries if user is admin
  const queryEnabled = enabled && !roleLoading && isAdmin;

  if (useInfinite) {
    return useInfiniteQuery({
      queryKey: ['admin', 'activity-logs', filters],
      queryFn: ({ pageParam }) => fetchActivityLogs({ pageParam, filters }),
      getNextPageParam: (lastPage) => lastPage.nextPage,
      initialPageParam: 0,
      enabled: queryEnabled,
      staleTime: 30 * 1000, // 30 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes
    });
  }

  return useQuery({
    queryKey: ['admin', 'activity-logs', filters],
    queryFn: () => fetchActivityLogs({ pageParam: 0, filters }),
    enabled: queryEnabled,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
};

export const useActivityStatistics = (days = 30) => {
  const { data: userRole, isLoading: roleLoading } = useUserRole();
  const isAdmin = userRole?.isAdmin ?? false;
  const queryEnabled = !roleLoading && isAdmin;

  return useQuery({
    queryKey: ['admin', 'activity-statistics', days],
    queryFn: () => fetchActivityStatistics(days),
    enabled: queryEnabled,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000,
  });
};

export const useSecurityEvents = (days = 7) => {
  const { data: userRole, isLoading: roleLoading } = useUserRole();
  const isAdmin = userRole?.isAdmin ?? false;
  const queryEnabled = !roleLoading && isAdmin;

  return useQuery({
    queryKey: ['admin', 'security-events', days],
    queryFn: () => fetchSecurityEvents(days),
    enabled: queryEnabled,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
};

// Export function for use in components
export { exportActivityLogs };
