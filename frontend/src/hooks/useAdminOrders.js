import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getSMMGenOrderStatus, placeSMMGenOrder } from '@/lib/smmgen';
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
    .select('*, services(name, platform, service_type, smmgen_service_id), profiles(name, email, phone_number)', { count: 'exact' })
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
    console.log(`Checking SMMGen status for ${finalOrders.length} orders`);
    finalOrders = await Promise.all(
      finalOrders.map(async (order) => {
        if (order.smmgen_order_id && 
            order.smmgen_order_id !== "order not placed at smm gen" &&
            order.status !== 'completed' && 
            order.status !== 'refunded') {
          try {
            console.log(`Checking status for order ${order.id} with SMMGen ID: ${order.smmgen_order_id}`);
            const statusData = await getSMMGenOrderStatus(order.smmgen_order_id);
            const smmgenStatus = statusData.status || statusData.Status;
            const mappedStatus = mapSMMGenStatus(smmgenStatus);

            console.log(`Order ${order.id} status check result:`, {
              smmgenStatus,
              mappedStatus,
              currentStatus: order.status,
              willUpdate: mappedStatus && mappedStatus !== order.status
            });

            if (mappedStatus && mappedStatus !== order.status) {
              console.log(`Updating order ${order.id} status from ${order.status} to ${mappedStatus}`);
              
              await saveOrderStatusHistory(
                order.id,
                mappedStatus,
                'smmgen',
                statusData,
                order.status
              );

              const { error: updateError } = await supabase
                .from('orders')
                .update({ 
                  status: mappedStatus,
                  completed_at: mappedStatus === 'completed' ? new Date().toISOString() : order.completed_at
                })
                .eq('id', order.id);

              if (updateError) {
                console.error(`Failed to update order ${order.id} status:`, updateError);
                throw updateError;
              }

              console.log(`Successfully updated order ${order.id} status to ${mappedStatus}`);
              return { ...order, status: mappedStatus };
            } else {
              console.log(`Order ${order.id} status unchanged (${order.status})`);
            }
          } catch (error) {
            console.error(`Failed to check SMMGen status for order ${order.id}:`, {
              error: error.message,
              orderId: order.id,
              smmgenOrderId: order.smmgen_order_id,
              stack: error.stack
            });
          }
        } else {
          if (order.smmgen_order_id === "order not placed at smm gen") {
            console.log(`Skipping status check for order ${order.id} - order not placed at SMMGen`);
          } else if (!order.smmgen_order_id) {
            console.log(`Skipping status check for order ${order.id} - no SMMGen order ID`);
          } else {
            console.log(`Skipping status check for order ${order.id} - status is ${order.status}`);
          }
        }
        
        return order;
      })
    );
    console.log(`Completed SMMGen status check for ${finalOrders.length} orders`);
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
  const maxIterations = 10000; // Safety limit to prevent infinite loops
  let iterations = 0;

  while (hasMore && iterations < maxIterations) {
    iterations++;
    const to = from + batchSize - 1;
    
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, services(name, platform, service_type, smmgen_service_id), profiles(name, email, phone_number)')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error(`Error fetching orders batch (from ${from} to ${to}):`, error);
        throw error;
      }

      if (data && data.length > 0) {
        allRecords = [...allRecords, ...data];
        // Continue if we got a full batch, stop if we got less
        hasMore = data.length === batchSize;
        from = to + 1;
      } else {
        // No more data
        hasMore = false;
      }
    } catch (error) {
      console.error('Error in fetchAllOrders batch:', error);
      // If we have some records, return them rather than failing completely
      if (allRecords.length > 0) {
        console.warn(`Returning partial order data (${allRecords.length} records) due to error`);
        // Still check SMMGen status for partial data if requested
        if (checkSMMGenStatus) {
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
      }
      throw error;
    }
  }

  if (iterations >= maxIterations) {
    console.warn(`fetchAllOrders reached max iterations (${maxIterations}), returning ${allRecords.length} records`);
  }

  // Check SMMGen status if requested
  if (checkSMMGenStatus && allRecords.length > 0) {
    console.log(`Checking SMMGen status for ${allRecords.length} orders (fetchAllOrders)`);
    allRecords = await Promise.all(
      allRecords.map(async (order) => {
        if (order.smmgen_order_id && 
            order.smmgen_order_id !== "order not placed at smm gen" &&
            order.status !== 'completed' && 
            order.status !== 'refunded') {
          try {
            console.log(`Checking status for order ${order.id} with SMMGen ID: ${order.smmgen_order_id}`);
            const statusData = await getSMMGenOrderStatus(order.smmgen_order_id);
            const smmgenStatus = statusData.status || statusData.Status;
            const mappedStatus = mapSMMGenStatus(smmgenStatus);

            console.log(`Order ${order.id} status check result:`, {
              smmgenStatus,
              mappedStatus,
              currentStatus: order.status,
              willUpdate: mappedStatus && mappedStatus !== order.status
            });

            if (mappedStatus && mappedStatus !== order.status) {
              console.log(`Updating order ${order.id} status from ${order.status} to ${mappedStatus}`);
              
              await saveOrderStatusHistory(
                order.id,
                mappedStatus,
                'smmgen',
                statusData,
                order.status
              );

              const { error: updateError } = await supabase
                .from('orders')
                .update({ 
                  status: mappedStatus,
                  completed_at: mappedStatus === 'completed' ? new Date().toISOString() : order.completed_at
                })
                .eq('id', order.id);

              if (updateError) {
                console.error(`Failed to update order ${order.id} status:`, updateError);
                throw updateError;
              }

              console.log(`Successfully updated order ${order.id} status to ${mappedStatus}`);
              return { ...order, status: mappedStatus };
            } else {
              console.log(`Order ${order.id} status unchanged (${order.status})`);
            }
          } catch (error) {
            console.error(`Failed to check SMMGen status for order ${order.id}:`, {
              error: error.message,
              orderId: order.id,
              smmgenOrderId: order.smmgen_order_id,
              stack: error.stack
            });
          }
        } else {
          if (order.smmgen_order_id === "order not placed at smm gen") {
            console.log(`Skipping status check for order ${order.id} - order not placed at SMMGen`);
          } else if (!order.smmgen_order_id) {
            console.log(`Skipping status check for order ${order.id} - no SMMGen order ID`);
          } else {
            console.log(`Skipping status check for order ${order.id} - status is ${order.status}`);
          }
        }
        
        return order;
      })
    );
    console.log(`Completed SMMGen status check for ${allRecords.length} orders (fetchAllOrders)`);
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
      // Fetch the order with its service data
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('*, services(smmgen_service_id)')
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

      // Check if service has SMMGen service ID
      if (!order.services?.smmgen_service_id) {
        throw new Error('Service does not have SMMGen service ID configured.');
      }

      // Check if order status allows reordering
      if (order.status === 'completed' || order.status === 'cancelled' || order.status === 'refunded') {
        throw new Error(`Cannot reorder order with status: ${order.status}`);
      }

      // Place order via SMMGen API
      const smmgenResponse = await placeSMMGenOrder(
        order.services.smmgen_service_id,
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


