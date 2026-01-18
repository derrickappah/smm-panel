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
  // Try with rate_unit first, fallback to without it if column doesn't exist
  let { data, error } = await supabase
    .from('services')
    .select('id, name, description, rate, rate_unit, platform, enabled, min_quantity, max_quantity, service_type, smmgen_service_id, smmcost_service_id, jbsmmpanel_service_id, display_order, created_at, is_combo, combo_service_ids, combo_smmgen_service_ids, seller_only')
    .eq('enabled', true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });
  
  // If rate_unit column doesn't exist, try without it
  if (error && (error.message?.includes('rate_unit') || error.code === '42703')) {
    console.warn('rate_unit column not found, fetching without it:', error.message);
    const fallbackResult = await supabase
      .from('services')
      .select('id, name, description, rate, platform, enabled, min_quantity, max_quantity, service_type, smmgen_service_id, smmcost_service_id, jbsmmpanel_service_id, display_order, created_at, is_combo, combo_service_ids, combo_smmgen_service_ids, seller_only')
      .eq('enabled', true)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });
    
    if (fallbackResult.error) {
      if (fallbackResult.error.code === 'PGRST301' || fallbackResult.error.message?.includes('500') || fallbackResult.error.message?.includes('Internal Server Error')) {
        console.warn('Services table may not exist or RLS policy issue:', fallbackResult.error.message);
        return [];
      }
      throw fallbackResult.error;
    }
    
    // Add default rate_unit for backward compatibility
    return (fallbackResult.data || []).map(service => ({ ...service, rate_unit: 1000 }));
  }
  
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

// Fetch all pending orders for the current user
const fetchAllPendingOrders = async () => {
  console.log('fetchAllPendingOrders called');
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) {
    console.log('No authenticated user, returning empty array');
    return [];
  }

  console.log('Fetching orders from database for user:', authUser.id);
  const { data, error } = await supabase
    .from('orders')
    .select('id, user_id, service_id, promotion_package_id, link, quantity, status, smmgen_order_id, smmcost_order_id, jbsmmpanel_order_id, created_at, completed_at, refund_status, total_cost, last_status_check, promotion_packages(name, platform, service_type)')
    .eq('user_id', authUser.id)
    .neq('status', 'completed')
    .neq('status', 'refunded')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching orders:', error);
    if (error.code === 'PGRST301' || error.message?.includes('500') || error.message?.includes('Internal Server Error')) {
      console.warn('Orders table may not exist or RLS policy issue:', error.message);
      return [];
    }
    throw error;
  }
  
  console.log('Raw orders from database:', {
    count: data?.length || 0,
    orders: (data || []).map(o => ({
      id: o.id,
      status: o.status,
      jbsmmpanel_order_id: o.jbsmmpanel_order_id,
      smmgen_order_id: o.smmgen_order_id,
      smmcost_order_id: o.smmcost_order_id
    }))
  });
  
  // Filter orders that have valid panel order IDs (including JB SMM Panel)
  const orders = (data || []).filter(order => {
    const isInternalUuid = order.smmgen_order_id === order.id;
    const hasSmmgenId = order.smmgen_order_id && 
                       order.smmgen_order_id !== "order not placed at smm gen" && 
                       !isInternalUuid;
    const hasSmmcostId = order.smmcost_order_id && 
                        String(order.smmcost_order_id).toLowerCase() !== "order not placed at smmcost";
    // JB SMM Panel validation: handle both string and number types, check for error strings
    const jbsmmpanelId = order.jbsmmpanel_order_id;
    const hasJbsmmpanelId = jbsmmpanelId && 
      String(jbsmmpanelId).toLowerCase() !== "order not placed at jbsmmpanel" &&
      Number(jbsmmpanelId) > 0;
    
    const shouldInclude = hasSmmgenId || hasSmmcostId || hasJbsmmpanelId;
    
    if (jbsmmpanelId) {
      console.log('Filtering JB SMM Panel order:', {
        orderId: order.id,
        jbsmmpanelId,
        jbsmmpanelIdType: typeof jbsmmpanelId,
        jbsmmpanelIdString: String(jbsmmpanelId),
        lowerCase: String(jbsmmpanelId).toLowerCase(),
        isErrorString: String(jbsmmpanelId).toLowerCase() === "order not placed at jbsmmpanel",
        numberValue: Number(jbsmmpanelId),
        hasJbsmmpanelId,
        shouldInclude
      });
    }
    
    return shouldInclude;
  });

  console.log('Filtered orders:', {
    count: orders.length,
    orders: orders.map(o => ({
      id: o.id,
      status: o.status,
      jbsmmpanel_order_id: o.jbsmmpanel_order_id,
      smmgen_order_id: o.smmgen_order_id,
      smmcost_order_id: o.smmcost_order_id
    }))
  });

  return orders;
};

// Check all pending orders status in the background
const checkAllPendingOrdersStatus = useCallback(async (queryClient) => {
  console.log('checkAllPendingOrdersStatus called', { hasQueryClient: !!queryClient });
  try {
    let maxIterations = 10; // Prevent infinite loops
    let iteration = 0;
    let hasUpdates = true;

    console.log('Starting status check loop...');

    // Keep checking until there are no pending orders or no updates
    while (hasUpdates && iteration < maxIterations) {
      iteration++;
      console.log(`Status check iteration ${iteration}`);
      
      // Fetch all pending orders for the current user
      console.log('Fetching all pending orders...');
      const pendingOrders = await fetchAllPendingOrders();
      console.log('Fetched pending orders:', {
        count: pendingOrders.length,
        orders: pendingOrders.map(o => ({
          id: o.id,
          status: o.status,
          jbsmmpanel_order_id: o.jbsmmpanel_order_id,
          smmgen_order_id: o.smmgen_order_id,
          smmcost_order_id: o.smmcost_order_id
        }))
      });
      
      if (pendingOrders.length === 0) {
        console.log('No pending orders to check');
        break;
      }

      console.log(`Checking status for ${pendingOrders.length} pending orders in background (iteration ${iteration})`);
      
      // Check orders status using batch utility
      // Use minIntervalMinutes: 0 to bypass interval check and check all pending orders
      console.log('Calling checkOrdersStatusBatch...');
      const result = await checkOrdersStatusBatch(pendingOrders, {
        concurrency: 5, // Moderate concurrency for background checks
        minIntervalMinutes: 0 // Bypass interval check to check all pending orders on dashboard load
      });

      console.log(`Background status check complete: ${result.checked} checked, ${result.updated} updated, ${result.errors.length} errors`);

      // Invalidate recent orders query to trigger refetch and update UI
      if (result.updated > 0) {
        queryClient.invalidateQueries({ queryKey: ['recentOrders'] });
      }

      // If no orders were updated, stop checking
      // Also stop if no orders were checked (all were filtered out)
      if (result.updated === 0 || result.checked === 0) {
        hasUpdates = false;
      } else {
        // Small delay before next iteration to allow database updates to propagate
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (iteration >= maxIterations) {
      console.log(`Reached maximum iterations (${maxIterations}) for status checking`);
    }
  } catch (error) {
    // Silent error handling - only log to console
    console.error('Error checking pending orders status:', error);
  }
}, [queryClient]);

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

  // Function to check all pending orders status (wrapped with queryClient)
  const checkAllPendingOrdersStatusWrapper = () => {
    return checkAllPendingOrdersStatus(queryClient);
  };

  return {
    services,
    recentOrders,
    servicesLoading,
    ordersLoading,
    servicesError,
    ordersError,
    fetchServices: refetchServices,
    fetchRecentOrders: refetchRecentOrders,
    checkAllPendingOrdersStatus: checkAllPendingOrdersStatusWrapper,
  };
};

