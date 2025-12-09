import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getSMMGenOrderStatus } from '@/lib/smmgen';
import { saveOrderStatusHistory } from '@/lib/orderStatusHistory';
import { toast } from 'sonner';

// Map SMMGen status to our status format
const mapSMMGenStatus = (smmgenStatus) => {
  if (!smmgenStatus) return null;
  
  const statusString = String(smmgenStatus).trim();
  const statusLower = statusString.toLowerCase();
  
  // Map to exact SMMGen statuses (normalized to lowercase)
  if (statusLower === 'pending' || statusLower.includes('pending')) {
    return 'pending';
  }
  if (statusLower === 'in progress' || statusLower.includes('in progress')) {
    return 'in progress';
  }
  if (statusLower === 'completed' || statusLower.includes('completed')) {
    return 'completed';
  }
  if (statusLower === 'partial' || statusLower.includes('partial')) {
    return 'partial';
  }
  if (statusLower === 'processing' || statusLower.includes('processing')) {
    return 'processing';
  }
  if (statusLower === 'canceled' || statusLower === 'cancelled' || statusLower.includes('cancel')) {
    return 'canceled';
  }
  if (statusLower === 'refunds' || statusLower.includes('refund')) {
    return 'refunds';
  }
  
  return null;
};

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
    .select('id, name, description, rate, platform, enabled, min_quantity, max_quantity, service_type, smmgen_service_id, created_at')
    .eq('enabled', true)
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
    .select('id, user_id, service_id, link, quantity, status, smmgen_order_id, created_at, completed_at, refund_status')
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
  
  // Check SMMGen status for orders with SMMGen IDs
  const updatedOrders = await Promise.all(
    (data || []).map(async (order) => {
      if (order.smmgen_order_id && order.status !== 'completed' && order.status !== 'refunded') {
        try {
          const statusData = await getSMMGenOrderStatus(order.smmgen_order_id);
          const smmgenStatus = statusData.status || statusData.Status;
          const mappedStatus = mapSMMGenStatus(smmgenStatus);

          if (mappedStatus && mappedStatus !== order.status && order.status !== 'refunded') {
            await saveOrderStatusHistory(
              order.id,
              mappedStatus,
              'smmgen',
              statusData,
              order.status
            );

            await supabase
              .from('orders')
              .update({ 
                status: mappedStatus,
                completed_at: mappedStatus === 'completed' ? new Date().toISOString() : order.completed_at
              })
              .eq('id', order.id);
            
            return { ...order, status: mappedStatus };
          }
        } catch (error) {
          console.warn('Failed to check SMMGen status for order:', order.id, error);
        }
      }
      
      return order;
    })
  );

  return updatedOrders;
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

