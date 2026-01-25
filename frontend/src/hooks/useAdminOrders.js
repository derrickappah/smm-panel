import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getSMMGenOrderStatus, placeSMMGenOrder } from '@/lib/smmgen';
import { saveOrderStatusHistory } from '@/lib/orderStatusHistory';
import { checkOrdersStatusBatch, shouldCheckOrder } from '@/lib/orderStatusCheck';
import { useUserRole } from './useUserRole';
import { queryClient } from '@/lib/queryClient';
import { toast } from 'sonner';

const PAGE_SIZE = 50; // Reduced from 1000 to match ITEMS_PER_PAGE in component

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

// Fetch orders with pagination and server-side filtering
const fetchOrders = async ({
  pageParam = 0,
  checkSMMGenStatus = false,
  searchTerm = '',
  searchType = 'all',
  statusFilter = 'all',
  dateFilter = ''
}) => {
  const from = pageParam * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Build the base query
  let query = supabase
    .from('orders')
    .select('id, user_id, service_id, promotion_package_id, link, quantity, total_cost, status, smmgen_order_id, smmcost_order_id, jbsmmpanel_order_id, created_at, completed_at, refund_status, last_status_check, services(name, platform, service_type, smmgen_service_id, smmcost_service_id, jbsmmpanel_service_id), promotion_packages(name, platform, service_type, smmgen_service_id), profiles(name, email, phone_number)', { count: 'exact' })
    .order('created_at', { ascending: false });

  // Apply status filter
  if (statusFilter !== 'all') {
    if (statusFilter === 'refunded') {
      // Check both status='refunded' OR refund_status='succeeded' (for backward compatibility)
      query = query.or('status.eq.refunded,refund_status.eq.succeeded');
    } else if (statusFilter === 'canceled') {
      // Handle both spellings: canceled and cancelled (for backward compatibility)
      query = query.or('status.eq.canceled,status.eq.cancelled');
    } else if (statusFilter === 'failed_to_smmgen') {
      // Orders without any panel ID that are not completed or cancelled
      query = query.is('smmgen_order_id', null)
        .is('smmcost_order_id', null)
        .is('jbsmmpanel_order_id', null)
        .neq('status', 'completed')
        .neq('status', 'cancelled')
        .neq('status', 'canceled')
        .neq('status', 'refunded');
    } else {
      query = query.eq('status', statusFilter);
    }
  }

  // Apply date filter
  if (dateFilter) {
    // Use UTC dates to avoid timezone issues
    const filterDate = new Date(dateFilter + 'T00:00:00.000Z');
    const filterDateEnd = new Date(dateFilter + 'T23:59:59.999Z');

    query = query.gte('created_at', filterDate.toISOString())
      .lte('created_at', filterDateEnd.toISOString());
  }

  // Apply search filter based on search type
  if (searchTerm && searchTerm.trim()) {
    const trimmedSearch = searchTerm.trim();
    const searchPattern = `%${trimmedSearch}%`;

    if (searchType === 'service_name') {
      // Search by service name (partial match, case-insensitive)
      try {
        // Use database query for partial matching
        const { data: matchingServices, error: serviceError } = await supabase
          .from('services')
          .select('id')
          .ilike('name', searchPattern);

        if (serviceError) {
          console.warn('Service search error:', serviceError);
          // Log error but continue - don't return empty on error
        }

        const matchingServiceIds = matchingServices?.map(s => s.id) || [];

        if (matchingServiceIds.length > 0) {
          query = query.in('service_id', matchingServiceIds);
        } else {
          // No matching services found, return empty result
          return { data: [], nextPage: undefined, total: 0 };
        }
      } catch (serviceSearchError) {
        console.warn('Service search failed:', serviceSearchError);
        // Log error but don't return empty - let the query continue
        return { data: [], nextPage: undefined, total: 0 };
      }
    } else if (searchType === 'package_name') {
      // Search by package name (partial match, case-insensitive)
      try {
        // Use database query for partial matching
        const { data: matchingPackages, error: packageError } = await supabase
          .from('promotion_packages')
          .select('id')
          .ilike('name', searchPattern);

        if (packageError) {
          console.warn('Package search error:', packageError);
          // Log error but continue - don't return empty on error
        }

        const matchingPackageIds = matchingPackages?.map(p => p.id) || [];

        if (matchingPackageIds.length > 0) {
          query = query.in('promotion_package_id', matchingPackageIds);
        } else {
          // No matching packages found, return empty result
          return { data: [], nextPage: undefined, total: 0 };
        }
      } catch (packageSearchError) {
        console.warn('Package search failed:', packageSearchError);
        // Log error but don't return empty - let the query continue
        return { data: [], nextPage: undefined, total: 0 };
      }
    } else if (searchType === 'order_id') {
      // Search only by order ID and panel IDs
      // Supabase doesn't support ::text casting in OR conditions, so we use separate conditions
      // For UUID (id), Supabase handles conversion automatically
      // For TEXT fields (smmgen_order_id, smmcost_order_id), use ilike directly
      // For INTEGER (jbsmmpanel_order_id), try numeric match first, then text search
      const trimmedSearch = searchTerm.trim();

      // Build conditions for text fields (UUID and TEXT columns)
      const textFieldsSearch = `id.ilike.${searchPattern},smmgen_order_id.ilike.${searchPattern},smmcost_order_id.ilike.${searchPattern}`;

      // For numeric jbsmmpanel_order_id, check if search term is numeric
      const numericSearch = /^\d+$/.test(trimmedSearch);
      let numericCondition = '';
      if (numericSearch) {
        // If search term is numeric, also search jbsmmpanel_order_id as number
        numericCondition = `,jbsmmpanel_order_id.eq.${trimmedSearch}`;
      }

      // Combine text and numeric conditions
      const orderFieldsSearch = textFieldsSearch + numericCondition;
      query = query.or(orderFieldsSearch);
    } else if (searchType === 'user_name') {
      // Search only by user name (partial match, case-insensitive)
      try {
        const { data: matchingProfiles, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .ilike('name', searchPattern);

        if (profileError) {
          console.warn('User name search error:', profileError);
          // Log error but continue - don't return empty on error
        }

        const matchingUserIds = matchingProfiles?.map(p => p.id) || [];

        if (matchingUserIds.length > 0) {
          query = query.in('user_id', matchingUserIds);
        } else {
          // No matching users found, return empty result
          return { data: [], nextPage: undefined, total: 0 };
        }
      } catch (userNameSearchError) {
        console.warn('User name search failed:', userNameSearchError);
        // Log error but don't return empty - let the query continue
        return { data: [], nextPage: undefined, total: 0 };
      }
    } else if (searchType === 'user_info') {
      // Search only by user name, email, phone
      try {
        const { data: matchingProfiles, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .or(`name.ilike.${searchPattern},email.ilike.${searchPattern},phone_number.ilike.${searchPattern}`);

        if (profileError) {
          console.warn('Profile search error:', profileError);
          // Log error but continue - return empty result
          return { data: [], nextPage: undefined, total: 0 };
        }

        const matchingUserIds = matchingProfiles?.map(p => p.id) || [];

        if (matchingUserIds.length > 0) {
          query = query.in('user_id', matchingUserIds);
        } else {
          // No matching users found, return empty result
          return { data: [], nextPage: undefined, total: 0 };
        }
      } catch (profileSearchError) {
        console.warn('Profile search failed:', profileSearchError);
        // Log error and return empty result
        return { data: [], nextPage: undefined, total: 0 };
      }
    } else if (searchType === 'link') {
      // Search only by link
      query = query.ilike('link', searchPattern);
    } else {
      // "all" - Search all fields including service/package names
      // Supabase doesn't support ::text casting in OR conditions, so we use compatible syntax
      // For UUID (id), Supabase handles conversion automatically
      // For TEXT fields (smmgen_order_id, smmcost_order_id), use ilike directly
      // For INTEGER (jbsmmpanel_order_id), try numeric match if search term is numeric
      const trimmedSearch = searchTerm.trim();
      const numericSearch = /^\d+$/.test(trimmedSearch);

      // Build conditions for text fields (UUID and TEXT columns)
      let orderFieldsSearch = `id.ilike.${searchPattern},smmgen_order_id.ilike.${searchPattern},smmcost_order_id.ilike.${searchPattern},link.ilike.${searchPattern}`;

      // For numeric jbsmmpanel_order_id, add numeric condition if search term is numeric
      if (numericSearch) {
        orderFieldsSearch += `,jbsmmpanel_order_id.eq.${trimmedSearch}`;
      }

      // Search services and packages for matching names
      let matchingServiceIds = [];
      let matchingPackageIds = [];
      let matchingUserIds = [];

      // Search services - limit to 15 to prevent query from becoming too long
      try {
        const { data: matchingServices } = await supabase
          .from('services')
          .select('id')
          .ilike('name', searchPattern)
          .limit(15);
        matchingServiceIds = matchingServices?.map(s => s.id) || [];
      } catch (e) {
        console.warn('Service search in "all" mode failed:', e);
      }

      // Search packages - limit to 15 to prevent query from becoming too long
      try {
        const { data: matchingPackages } = await supabase
          .from('promotion_packages')
          .select('id')
          .ilike('name', searchPattern)
          .limit(15);
        matchingPackageIds = matchingPackages?.map(p => p.id) || [];
      } catch (e) {
        console.warn('Package search in "all" mode failed:', e);
      }

      // Search profiles (name, email, phone)
      // Limit to first 15 to prevent query from becoming too long
      try {
        const { data: matchingProfiles, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .or(`name.ilike.${searchPattern},email.ilike.${searchPattern},phone_number.ilike.${searchPattern}`)
          .limit(15);

        if (!profileError) {
          matchingUserIds = matchingProfiles?.map(p => p.id) || [];
        } else {
          console.warn('Profile search error in "all" mode:', profileError);
        }
      } catch (profileSearchError) {
        console.warn('Profile search failed in "all" mode:', profileSearchError);
      }

      // Limit the number of IDs to prevent query from becoming too long
      // Supabase has limits on query/URL length, so we cap at 15 per type (45 total + 5 order fields = 50 max)
      const MAX_IDS_PER_TYPE = 15;
      const limitedUserIds = matchingUserIds.slice(0, MAX_IDS_PER_TYPE);
      const limitedServiceIds = matchingServiceIds.slice(0, MAX_IDS_PER_TYPE);
      const limitedPackageIds = matchingPackageIds.slice(0, MAX_IDS_PER_TYPE);

      // Warn if we're truncating results
      if (matchingUserIds.length > MAX_IDS_PER_TYPE || matchingServiceIds.length > MAX_IDS_PER_TYPE || matchingPackageIds.length > MAX_IDS_PER_TYPE) {
        console.warn(`[useAdminOrders] Search term "${searchTerm}" matched too many results. Limiting to first ${MAX_IDS_PER_TYPE} per type.`, {
          users: matchingUserIds.length,
          services: matchingServiceIds.length,
          packages: matchingPackageIds.length
        });
      }

      // Build OR condition: order fields OR user_id OR service_id OR promotion_package_id
      const conditions = [orderFieldsSearch];

      if (limitedUserIds.length > 0) {
        conditions.push(...limitedUserIds.map(id => `user_id.eq.${id}`));
      }

      if (limitedServiceIds.length > 0) {
        conditions.push(...limitedServiceIds.map(id => `service_id.eq.${id}`));
      }

      if (limitedPackageIds.length > 0) {
        conditions.push(...limitedPackageIds.map(id => `promotion_package_id.eq.${id}`));
      }

      if (conditions.length > 0) {
        query = query.or(conditions.join(','));
      }
    }
  }

  // Apply pagination
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) {
    console.error('Error fetching orders:', error);
    if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('policy')) {
      toast.error('RLS Policy Error: Cannot view all orders. Please run database/fixes/FIX_ADMIN_RLS.sql in Supabase SQL Editor.');
    }
    throw error;
  }

  let finalOrders = data || [];

  // Debug logging
  console.log('fetchOrders result:', {
    pageParam,
    finalOrdersCount: finalOrders.length,
    totalCount: count,
    searchTerm,
    searchType,
    statusFilter,
    dateFilter
  });

  // Check SMMGen status if requested (non-blocking - runs in background)
  // Only check visible orders to reduce overhead
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
      .select('id, user_id, service_id, promotion_package_id, link, quantity, total_cost, status, smmgen_order_id, smmcost_order_id, jbsmmpanel_order_id, created_at, completed_at, refund_status, last_status_check, services(name, platform, service_type, smmgen_service_id, smmcost_service_id, jbsmmpanel_service_id), promotion_packages(name, platform, service_type, smmgen_service_id), profiles(name, email, phone_number)')
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
  const {
    enabled = true,
    useInfinite = false,
    checkSMMGenStatus = false,
    searchTerm = '',
    searchType = 'all',
    statusFilter = 'all',
    dateFilter = '',
    page = undefined // Default to undefined - if provided (even if 1), it's a display page request
  } = options;

  // Check role at hook level (cached)
  const { data: userRole, isLoading: roleLoading } = useUserRole();
  const isAdmin = userRole?.isAdmin ?? false;

  // Only enable queries if user is admin
  const queryEnabled = enabled && !roleLoading && isAdmin;

  if (useInfinite) {
    // For infinite query, still use pageParam but with filters
    return useInfiniteQuery({
      queryKey: ['admin', 'orders', 'infinite', { checkSMMGenStatus, searchTerm, searchType, statusFilter, dateFilter }],
      queryFn: ({ pageParam }) => fetchOrders({
        pageParam,
        checkSMMGenStatus,
        searchTerm,
        searchType,
        statusFilter,
        dateFilter
      }),
      getNextPageParam: (lastPage) => lastPage.nextPage,
      initialPageParam: 0,
      enabled: queryEnabled,
      staleTime: 1 * 60 * 1000, // 1 minute - orders change frequently
      gcTime: 3 * 60 * 1000, // 3 minutes
      placeholderData: (previousData) => previousData, // Show stale data while fetching
    });
  }

  // For stats (when no filters and useInfinite: false and no page param), use fetchAllOrders which returns array
  // For paginated queries (with filters or page specified), use fetchOrders which returns { data, total }
  // Check if this is a display page request (has page parameter) vs stats request (no page)
  const isDisplayPage = page !== undefined && page !== null;
  const hasFilters = searchTerm || searchType !== 'all' || statusFilter !== 'all' || dateFilter;

  if (!useInfinite && !hasFilters && !isDisplayPage) {
    // Stats case - no page parameter provided, return array directly
    return useQuery({
      queryKey: ['admin', 'orders', 'all', { checkSMMGenStatus }],
      queryFn: () => fetchAllOrders(checkSMMGenStatus),
      enabled: queryEnabled,
      staleTime: 2 * 60 * 1000, // 2 minutes - increased for better caching
      gcTime: 5 * 60 * 1000, // 5 minutes - keep in cache longer
      placeholderData: (previousData) => previousData, // Show stale data while fetching
    });
  }

  // For paginated queries (server-side filtering), fetch specific page
  return useQuery({
    queryKey: ['admin', 'orders', 'paginated', { checkSMMGenStatus, searchTerm, searchType, statusFilter, dateFilter, page: page || 1 }],
    queryFn: async () => {
      const result = await fetchOrders({
        pageParam: (page || 1) - 1, // Convert 1-based page to 0-based pageParam, default to page 1 if not provided
        checkSMMGenStatus,
        searchTerm,
        searchType,
        statusFilter,
        dateFilter
      });
      // Return the result directly - it already has { data, total } structure
      return result;
    },
    enabled: queryEnabled,
    staleTime: 1 * 60 * 1000, // 1 minute - orders change frequently
    gcTime: 3 * 60 * 1000, // 3 minutes
    placeholderData: (previousData) => previousData, // Show stale data while fetching
  });
};

export const useUpdateOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orderId, updates }) => {
      // Get current order to find previous status
      const { data: currentOrder } = await supabase
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single();

      // Get current user ID for status history
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || null;

      // Update the order
      const { data, error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;

      // Save status history if status is being updated
      if (updates.status && currentOrder?.status && updates.status !== currentOrder.status) {
        await saveOrderStatusHistory(
          orderId,
          updates.status,
          'manual',
          null,
          currentOrder.status,
          userId
        ).catch(err => {
          // Don't fail the update if history save fails
          console.warn('Failed to save order status history:', err);
        });
      }

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

        // Handle paginated query structure: { data: [...], total: ... }
        if (oldData.data && Array.isArray(oldData.data)) {
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
    onSuccess: (data, variables) => {
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

export const useSafeRetryOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch('/api/admin/retry-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ order_id: orderId })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || result.error || 'Failed to retry order');
      }

      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      toast.success(data.message || 'Order successfully retried!');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to retry order');
    },
  });
};


