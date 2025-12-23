import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { checkOrdersStatusBatch } from '@/lib/orderStatusCheck';
import { toast } from 'sonner';

// Fetch services query function
const fetchServices = async () => {
  // Get current user role to filter services
  const { data: { user: authUser } } = await supabase.auth.getUser();
  let userRole = 'user';
  
  if (authUser) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authUser.id)
      .single();
    
    if (profile) {
      userRole = profile.role || 'user';
    }
  }
  
  // Fetch services from Supabase
  const { data, error } = await supabase
    .from('services')
    .select('id, name, description, rate, platform, enabled, min_quantity, max_quantity, service_type, smmgen_service_id, smmcost_service_id, display_order, created_at')
    .eq('enabled', true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });
  
  if (error) {
    if (error.code === 'PGRST301' || error.message?.includes('500') || error.message?.includes('Internal Server Error')) {
      console.warn('Services table may not exist or RLS policy issue:', error.message);
      return [];
    }
    throw error;
  }
  
  return data || [];
};

// Fetch recent orders query function
const fetchRecentOrders = async () => {
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return [];

  const { data, error } = await supabase
    .from('orders')
    .select('id, user_id, service_id, promotion_package_id, link, quantity, status, smmgen_order_id, smmcost_order_id, created_at, completed_at, refund_status, total_cost, last_status_check, promotion_packages(name, platform, service_type)')
    .eq('user_id', authUser.id)
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (error) {
    if (error.code === 'PGRST301' || error.message?.includes('500') || error.message?.includes('Internal Server Error')) {
      console.warn('Orders table may not exist or RLS policy issue:', error.message);
      return [];
    }
    throw error;
  }
  
  const orders = data || [];
  
  // Check SMMGen status for orders using optimized batch utility
  if (orders.length > 0) {
    await checkOrdersStatusBatch(orders, {
      concurrency: 3, // Lower concurrency for dashboard (only 5 orders)
      minIntervalMinutes: 5
    });
    
    // Fetch updated orders to return latest status
    const { data: updatedData } = await supabase
      .from('orders')
      .select('id, user_id, service_id, promotion_package_id, link, quantity, status, smmgen_order_id, smmcost_order_id, created_at, completed_at, refund_status, total_cost, last_status_check, promotion_packages(name, platform, service_type)')
      .eq('user_id', authUser.id)
      .in('id', orders.map(o => o.id))
      .order('created_at', { ascending: false });
    
    return updatedData || orders;
  }

  return orders;
};

export const useDashboardData = () => {
  const queryClient = useQueryClient();

  // Services query with React Query
  const {
    data: services = [],
    isLoading: servicesLoading,
    error: servicesError,
    refetch: refetchServices
  } = useQuery({
    queryKey: ['services'],
    queryFn: fetchServices,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
    onError: (error) => {
      if (!error.message?.includes('500') && !error.message?.includes('Internal Server Error')) {
        toast.error('Failed to load services');
      }
    }
  });

  // Recent orders query with React Query
  const {
    data: recentOrders = [],
    isLoading: ordersLoading,
    error: ordersError,
    refetch: refetchRecentOrders
  } = useQuery({
    queryKey: ['recentOrders'],
    queryFn: fetchRecentOrders,
    staleTime: 2 * 60 * 1000, // 2 minutes - orders change more frequently
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
    enabled: !!supabase.auth.getUser(), // Only fetch if user is authenticated
  });

  return {
    services,
    recentOrders,
    servicesLoading,
    ordersLoading,
    servicesError,
    ordersError,
    fetchServices: refetchServices,
    fetchRecentOrders: refetchRecentOrders,
  };
};

