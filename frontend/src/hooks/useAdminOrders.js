import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getSMMGenOrderStatus, placeSMMGenOrder } from '@/lib/smmgen';
import { saveOrderStatusHistory } from '@/lib/orderStatusHistory';
import { checkOrdersStatusBatch, shouldCheckOrder } from '@/lib/orderStatusCheck';
import { useUserRole } from './useUserRole';
import { queryClient } from '@/lib/queryClient';
import { toast } from 'sonner';

const PAGE_SIZE = 1000;

// Background function to check SMMGen statuses (non-blocking)
// Now uses the optimized batch utility with last_status_check filtering
const checkSMMGenStatusesInBackground = async (ordersToCheck) => {
  console.log(`Checking SMMGen status for ${ordersToCheck.length} orders in background`);
  
  // Use the optimized batch utility
  const result = await checkOrdersStatusBatch(ordersToCheck, {
    concurrency: 10,
    minIntervalMinutes: 5,
    onStatusUpdate: (orderId, newStatus, oldStatus) => {
      // Invalidate queries to refresh UI with updated status
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
    }
  });
  
  console.log(`Completed background SMMGen status check: ${result.checked} checked, ${result.updated} updated, ${result.errors.length} errors`);
};

// Fetch orders with pagination
const fetchOrders = async ({ pageParam = 0, checkSMMGenStatus = false }) => {
  const from = pageParam * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await supabase
    .from('orders')
    .select('id, user_id, service_id, promotion_package_id, link, quantity, total_cost, status, smmgen_order_id, smmcost_order_id, created_at, completed_at, refund_status, last_status_check, services(name, platform, service_type, smmgen_service_id, smmcost_service_id), promotion_packages(name, platform, service_type, smmgen_service_id), profiles(name, email, phone_number)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('policy')) {
      toast.error('RLS Policy Error: Cannot view all orders. Please run database/fixes/FIX_ADMIN_RLS.sql in Supabase SQL Editor.');
    }
    throw error;
  }

  let finalOrders = data || [];

  // Check SMMGen status if requested (non-blocking - runs in background)
  if (checkSMMGenStatus && finalOrders.length > 0) {
    // Filter to only orders that need status checking using the utility function
    // This now includes last_status_check filtering
    const ordersToCheck = finalOrders.filter(order => shouldCheckOrder(order, 5));

    if (ordersToCheck.length > 0) {
      // Run SMMGen checks in background (non-blocking)
      // This allows the UI to render immediately with cached data
      checkSMMGenStatusesInBackground(ordersToCheck).catch(error => {
        console.warn('Background SMMGen status check failed:', error);
      });
    }
  }

  return {
    data: finalOrders,
    nextPage: finalOrders && finalOrders.length === PAGE_SIZE ? pageParam + 1 : undefined,
    total: count || 0,
  };
};

// Fetch all orders (for stats calculation) - Fetches ALL records efficiently using optimized pagination
// SMMGen status checks are disabled by default for performance
const fetchAllOrders = async (checkSMMGenStatus = false) => {
  const BATCH_SIZE = 1000; // Fetch in batches for optimal performance
  let allRecords = [];
  let from = 0;
  let hasMore = true;
  
  // First, get total count to optimize fetching
  const { count, error: countError } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true });
  
  if (countError) {
    throw countError;
  }

  // Fetch all batches - optimized sequential fetching for large datasets
  while (hasMore) {
    const to = from + BATCH_SIZE - 1;
    
    const { data, error } = await supabase
      .from('orders')
      .select('id, user_id, service_id, promotion_package_id, link, quantity, total_cost, status, smmgen_order_id, smmcost_order_id, created_at, completed_at, refund_status, last_status_check, services(name, platform, service_type, smmgen_service_id, smmcost_service_id), promotion_packages(name, platform, service_type, smmgen_service_id), profiles(name, email, phone_number)')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw error;
    }

    if (data && data.length > 0) {
      allRecords = allRecords.concat(data);
      hasMore = data.length === BATCH_SIZE && allRecords.length < (count || Infinity);
      from += BATCH_SIZE;
    } else {
      hasMore = false;
    }
  }

  // Only check SMMGen status if explicitly requested (non-blocking - runs in background)
  if (checkSMMGenStatus && allRecords.length > 0) {
    // Filter to only orders that need status checking using the utility function
    // This now includes last_status_check filtering
    const ordersToCheck = allRecords.filter(order => shouldCheckOrder(order, 5));

    if (ordersToCheck.length > 0) {
      // Run SMMGen checks in background (non-blocking)
      checkSMMGenStatusesInBackground(ordersToCheck).catch(error => {
        console.warn('Background SMMGen status check failed:', error);
      });
    }
  }

  return allRecords;
};

export const useAdminOrders = (options = {}) => {
  const { enabled = true, useInfinite = false, checkSMMGenStatus = false } = options;
  
  // Check role at hook level (cached)
  const { data: userRole, isLoading: roleLoading } = useUserRole();
  const isAdmin = userRole?.isAdmin ?? false;
  
  // Only enable queries if user is admin
  const queryEnabled = enabled && !roleLoading && isAdmin;

  if (useInfinite) {
    return useInfiniteQuery({
      queryKey: ['admin', 'orders', { checkSMMGenStatus }],
      queryFn: ({ pageParam }) => fetchOrders({ pageParam, checkSMMGenStatus }),
      getNextPageParam: (lastPage) => lastPage.nextPage,
      initialPageParam: 0,
      enabled: queryEnabled,
      staleTime: 1 * 60 * 1000, // 1 minute - orders change frequently
      gcTime: 3 * 60 * 1000, // 3 minutes
    });
  }

  return useQuery({
    queryKey: ['admin', 'orders', 'all', { checkSMMGenStatus }],
    queryFn: () => fetchAllOrders(checkSMMGenStatus),
    enabled: queryEnabled,
    staleTime: 2 * 60 * 1000, // 2 minutes - increased for better caching
    gcTime: 5 * 60 * 1000, // 5 minutes - keep in cache longer
  });
};

export const useUpdateOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, updates }) => {
      const { data, error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async ({ orderId, updates }) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['admin', 'orders'] });

      // Snapshot the previous value for rollback
      const previousQueries = queryClient.getQueriesData({ queryKey: ['admin', 'orders'] });
      const previousData = new Map(previousQueries);

      // Optimistically update all order queries
      queryClient.setQueriesData({ queryKey: ['admin', 'orders'] }, (oldData) => {
        if (!oldData) return oldData;

        // Handle infinite query structure (has pages)
        if (oldData.pages) {
          return {
            ...oldData,
            pages: oldData.pages.map((page) => {
              if (!page || !page.data) return page;
              
              const updatedData = page.data.map((order) => {
                if (order.id === orderId) {
                  return { ...order, ...updates };
                }
                return order;
              });

              return {
                ...page,
                data: updatedData,
              };
            }),
          };
        }

        // Handle regular query structure (array of orders)
        if (Array.isArray(oldData)) {
          return oldData.map((order) => {
            if (order.id === orderId) {
              return { ...order, ...updates };
            }
            return order;
          });
        }

        // Handle query with data property
        if (oldData.data) {
          if (Array.isArray(oldData.data)) {
            return {
              ...oldData,
              data: oldData.data.map((order) => {
                if (order.id === orderId) {
                  return { ...order, ...updates };
                }
                return order;
              }),
            };
          }
        }

        return oldData;
      });

      // Return context with previous data for rollback
      return { previousData };
    },
    onError: (error, variables, context) => {
      // Rollback optimistic update on error
      if (context?.previousData) {
        context.previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error(error.message || 'Failed to update order');
    },
    onSuccess: () => {
      // Invalidate queries to ensure data consistency (refetch in background)
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.success('Order updated successfully');
    },
  });
};

export const useReorderToSMMGen = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId) => {
      // Fetch the order with its service or package data
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('*, services(smmgen_service_id), promotion_packages(smmgen_service_id)')
        .eq('id', orderId)
        .single();

      if (orderError) {
        throw new Error(`Failed to fetch order: ${orderError.message}`);
      }

      if (!order) {
        throw new Error('Order not found');
      }

      // Check if order already has SMMGen ID
      if (order.smmgen_order_id) {
        throw new Error('Order already has SMMGen ID. Cannot reorder.');
      }

      // Check if service or package has SMMGen service ID
      const smmgenServiceId = order.promotion_package_id 
        ? order.promotion_packages?.smmgen_service_id 
        : order.services?.smmgen_service_id;
      
      if (!smmgenServiceId) {
        throw new Error(order.promotion_package_id 
          ? 'Promotion package does not have SMMGen service ID configured.'
          : 'Service does not have SMMGen service ID configured.');
      }

      // Check if order status allows reordering
      if (order.status === 'completed' || order.status === 'cancelled' || order.status === 'refunded') {
        throw new Error(`Cannot reorder order with status: ${order.status}`);
      }

      // Place order via SMMGen API
      const smmgenResponse = await placeSMMGenOrder(
        smmgenServiceId,
        order.link,
        order.quantity
      );

      if (!smmgenResponse) {
        throw new Error('Failed to place order with SMMGen. API returned no response.');
      }

      // Extract SMMGen order ID from response
      const smmgenOrderId = smmgenResponse.order || 
                           smmgenResponse.order_id || 
                           smmgenResponse.orderId || 
                           smmgenResponse.id || 
                           null;

      if (!smmgenOrderId) {
        throw new Error('SMMGen API did not return an order ID.');
      }

      // Update order with SMMGen order ID and status
      const updates = {
        smmgen_order_id: smmgenOrderId,
      };

      // Update status to processing if it was pending
      if (order.status === 'pending') {
        updates.status = 'processing';
      }

      const { data: updatedOrder, error: updateError } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', orderId)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to update order: ${updateError.message}`);
      }

      return updatedOrder;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.success(`Order successfully sent to SMMGen. Order ID: ${data.smmgen_order_id}`);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to reorder to SMMGen');
    },
  });
};


