import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getSMMGenOrderStatus } from '@/lib/smmgen';
import { saveOrderStatusHistory } from '@/lib/orderStatusHistory';
import { toast } from 'sonner';

const PAGE_SIZE = 50;

// Map SMMGen status to our status format
const mapSMMGenStatus = (smmgenStatus) => {
  if (!smmgenStatus) return null;
  
  const statusString = String(smmgenStatus).trim();
  const statusLower = statusString.toLowerCase();
  
  if (statusLower === 'pending' || statusLower.includes('pending')) return 'pending';
  if (statusLower === 'in progress' || statusLower.includes('in progress')) return 'in progress';
  if (statusLower === 'completed' || statusLower.includes('completed')) return 'completed';
  if (statusLower === 'partial' || statusLower.includes('partial')) return 'partial';
  if (statusLower === 'processing' || statusLower.includes('processing')) return 'processing';
  if (statusLower === 'canceled' || statusLower === 'cancelled' || statusLower.includes('cancel')) return 'canceled';
  if (statusLower === 'refunds' || statusLower.includes('refund')) return 'refunds';
  
  return null;
};

// Fetch orders with pagination
const fetchOrders = async ({ pageParam = 0, checkSMMGenStatus = false }) => {
  const { data: currentUser } = await supabase.auth.getUser();
  if (!currentUser?.user) {
    throw new Error('Not authenticated');
  }

  const { data: userProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', currentUser.user.id)
    .single();

  if (userProfile?.role !== 'admin') {
    throw new Error('Access denied. Admin role required.');
  }

  const from = pageParam * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await supabase
    .from('orders')
    .select('*, services(name, platform, service_type), profiles(name, email, phone_number)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('policy')) {
      toast.error('RLS Policy Error: Cannot view all orders. Please run database/fixes/FIX_ADMIN_RLS.sql in Supabase SQL Editor.');
    }
    throw error;
  }

  let finalOrders = data || [];

  // Check SMMGen status if requested
  if (checkSMMGenStatus && finalOrders.length > 0) {
    finalOrders = await Promise.all(
      finalOrders.map(async (order) => {
        if (order.smmgen_order_id && order.status !== 'completed' && order.status !== 'refunded') {
          try {
            const statusData = await getSMMGenOrderStatus(order.smmgen_order_id);
            const smmgenStatus = statusData.status || statusData.Status;
            const mappedStatus = mapSMMGenStatus(smmgenStatus);

            if (mappedStatus && mappedStatus !== order.status) {
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
  }

  return {
    data: finalOrders,
    nextPage: finalOrders && finalOrders.length === PAGE_SIZE ? pageParam + 1 : undefined,
    total: count || 0,
  };
};

// Fetch all orders (for stats calculation)
const fetchAllOrders = async (checkSMMGenStatus = false) => {
  const { data: currentUser } = await supabase.auth.getUser();
  if (!currentUser?.user) {
    throw new Error('Not authenticated');
  }

  const { data: userProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', currentUser.user.id)
    .single();

  if (userProfile?.role !== 'admin') {
    throw new Error('Access denied. Admin role required.');
  }

  let allRecords = [];
  let from = 0;
  let hasMore = true;
  const batchSize = 1000;

  while (hasMore) {
    const to = from + batchSize - 1;
    const { data, error } = await supabase
      .from('orders')
      .select('*, services(name, platform, service_type), profiles(name, email, phone_number)')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    if (data && data.length > 0) {
      allRecords = [...allRecords, ...data];
      hasMore = data.length === batchSize;
      from = to + 1;
    } else {
      hasMore = false;
    }
  }

  // Check SMMGen status if requested
  if (checkSMMGenStatus && allRecords.length > 0) {
    allRecords = await Promise.all(
      allRecords.map(async (order) => {
        if (order.smmgen_order_id && order.status !== 'completed' && order.status !== 'refunded') {
          try {
            const statusData = await getSMMGenOrderStatus(order.smmgen_order_id);
            const smmgenStatus = statusData.status || statusData.Status;
            const mappedStatus = mapSMMGenStatus(smmgenStatus);

            if (mappedStatus && mappedStatus !== order.status) {
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
  }

  return allRecords;
};

export const useAdminOrders = (options = {}) => {
  const { enabled = true, useInfinite = false, checkSMMGenStatus = false } = options;

  if (useInfinite) {
    return useInfiniteQuery({
      queryKey: ['admin', 'orders', { checkSMMGenStatus }],
      queryFn: ({ pageParam }) => fetchOrders({ pageParam, checkSMMGenStatus }),
      getNextPageParam: (lastPage) => lastPage.nextPage,
      initialPageParam: 0,
      enabled,
      staleTime: 1 * 60 * 1000, // 1 minute - orders change frequently
      gcTime: 3 * 60 * 1000, // 3 minutes
    });
  }

  return useQuery({
    queryKey: ['admin', 'orders', 'all', { checkSMMGenStatus }],
    queryFn: () => fetchAllOrders(checkSMMGenStatus),
    enabled,
    staleTime: 1 * 60 * 1000,
    gcTime: 3 * 60 * 1000,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.success('Order updated successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update order');
    },
  });
};


