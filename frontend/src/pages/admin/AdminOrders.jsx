import React, { memo, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAdminOrders, useUpdateOrder, useReorderToSMMGen } from '@/hooks/useAdminOrders';
import { useDebounce } from '@/hooks/useDebounce';
import VirtualizedList from '@/components/VirtualizedList';
import ResponsiveTable from '@/components/admin/ResponsiveTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, RefreshCw, Filter, AlertCircle, RotateCcw, Tag, CheckCircle2 } from 'lucide-react';
import { processManualRefund } from '@/lib/refunds';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { checkOrdersStatusBatch } from '@/lib/orderStatusCheck';

const ITEMS_PER_PAGE = 50;
const VIRTUAL_SCROLL_THRESHOLD = 100;

const AdminOrders = memo(({ onRefresh, refreshing = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchType, setSearchType] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [hasAutoChecked, setHasAutoChecked] = useState(false);
  const autoCheckTimerRef = useRef(null);

  const debouncedSearch = useDebounce(searchTerm, 300);

  const queryClient = useQueryClient();

  // Reset page to 1 when filters change (but not on initial render)
  useEffect(() => {
    // Only reset if we're not on page 1 already to avoid unnecessary re-renders
    if (page !== 1) {
      setPage(1);
    }
  }, [debouncedSearch, searchType, statusFilter, dateFilter]);

  // Reset searchType to 'all' when search input is cleared
  // Use a ref to track if this is the initial render
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (!searchTerm.trim() && searchType !== 'all') {
      setSearchType('all');
    }
  }, [searchTerm, searchType]);

  const {
    data,
    isLoading,
    isFetching,
    refetch
  } = useAdminOrders({
    enabled: true,
    useInfinite: false, // Use regular query for server-side pagination
    checkSMMGenStatus: false, // Disable by default for better performance - can be enabled later if needed
    searchTerm: debouncedSearch,
    searchType: searchType,
    statusFilter: statusFilter,
    dateFilter: dateFilter,
    page: page // Pass current page
  });

  const updateOrderMutation = useUpdateOrder();
  const reorderMutation = useReorderToSMMGen();

  // Fetch all pending/processing/in-progress orders from database
  const fetchPendingOrders = useCallback(async () => {
    try {
      console.log('[AdminOrders] Fetching pending orders for status check...');
      const { data, error } = await supabase
        .from('orders')
        .select('id, user_id, service_id, promotion_package_id, link, quantity, total_cost, status, smmgen_order_id, smmcost_order_id, jbsmmpanel_order_id, created_at, completed_at, refund_status, last_status_check, services(name, platform, service_type, smmgen_service_id, smmcost_service_id, jbsmmpanel_service_id), promotion_packages(name, platform, service_type, smmgen_service_id), profiles(name, email, phone_number)')
        .in('status', ['pending', 'processing', 'in progress'])
        .not('status', 'eq', 'completed')
        .not('status', 'eq', 'refunded')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[AdminOrders] Error fetching pending orders:', error);
        throw error;
      }

      const orders = data || [];
      const jbsmmpanelOrders = orders.filter(o => o.jbsmmpanel_order_id);

      console.log('[AdminOrders] Fetched pending orders:', {
        total: orders.length,
        jbsmmpanelOrders: jbsmmpanelOrders.length,
        jbsmmpanelOrderDetails: jbsmmpanelOrders.map(o => ({
          id: o.id,
          jbsmmpanel_order_id: o.jbsmmpanel_order_id,
          status: o.status,
          last_status_check: o.last_status_check
        }))
      });

      return orders;
    } catch (error) {
      console.error('[AdminOrders] Failed to fetch pending orders:', error);
      return [];
    }
  }, []);

  // Handle checking pending orders status from panels
  const handleCheckPendingOrders = useCallback(async () => {
    console.log('[AdminOrders] ===== handleCheckPendingOrders CALLED =====', {
      isCheckingStatus,
      timestamp: new Date().toISOString()
    });

    if (isCheckingStatus) {
      console.log('[AdminOrders] Status check already in progress, skipping');
      return; // Prevent multiple simultaneous checks
    }

    console.log('[AdminOrders] Setting isCheckingStatus to true...');
    setIsCheckingStatus(true);
    console.log('[AdminOrders] Starting status check...');

    try {
      // Fetch all pending/processing/in-progress orders
      const pendingOrders = await fetchPendingOrders();
      console.log('[AdminOrders] Fetched pending orders:', pendingOrders.length);

      if (pendingOrders.length === 0) {
        console.log('[AdminOrders] No pending orders to check');
        toast.info('No pending orders to check');
        setIsCheckingStatus(false);
        return;
      }

      // Debounce query invalidations to avoid too frequent updates
      let invalidationTimeout = null;
      const debouncedInvalidation = () => {
        if (invalidationTimeout) {
          clearTimeout(invalidationTimeout);
        }
        invalidationTimeout = setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
        }, 500); // Debounce to 500ms
      };

      // Check orders status with high concurrency and bypassed interval
      console.log('[AdminOrders] Calling checkOrdersStatusBatch with:', {
        orderCount: pendingOrders.length,
        jbsmmpanelOrders: pendingOrders.filter(o => o.jbsmmpanel_order_id).length,
        orderIds: pendingOrders.map(o => o.id),
        jbsmmpanelOrderIds: pendingOrders.filter(o => o.jbsmmpanel_order_id).map(o => ({
          orderId: o.id,
          jbsmmpanel_order_id: o.jbsmmpanel_order_id,
          status: o.status
        }))
      });

      const result = await checkOrdersStatusBatch(pendingOrders, {
        concurrency: 12, // High concurrency (10-15 range)
        minIntervalMinutes: 0, // Bypass interval check for manual/admin checks
        useServerSideBulkCheck: true, // Use more reliable server-side checks
        onStatusUpdate: (orderId, newStatus, oldStatus) => {
          console.log('[AdminOrders] Status updated:', { orderId, newStatus, oldStatus });
          // Real-time UI updates via debounced query invalidation
          debouncedInvalidation();
        },
        onProgress: (checked, total) => {
          // Progress callback if needed in future
          console.log(`[AdminOrders] Status check progress: ${checked}/${total}`);
        }
      });

      console.log('[AdminOrders] Status check result:', result);

      // Clear any pending invalidation and do final refresh
      if (invalidationTimeout) {
        clearTimeout(invalidationTimeout);
      }
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });

      // Show summary toast notification
      const errorCount = result.errors?.length || 0;
      if (errorCount > 0) {
        toast.warning(
          `Status check complete: Checked ${result.checked} orders, updated ${result.updated}, ${errorCount} errors`,
          { duration: 5000 }
        );
      } else {
        toast.success(
          `Status check complete: Checked ${result.checked} orders, updated ${result.updated}`,
          { duration: 4000 }
        );
      }

      // Refresh parent component if callback provided
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('[AdminOrders] ===== ERROR checking pending orders =====', {
        error,
        errorMessage: error.message,
        errorStack: error.stack,
        errorName: error.name
      });
      toast.error('Failed to check pending orders: ' + (error.message || 'Unknown error'));
    } finally {
      console.log('[AdminOrders] Status check complete, setting isCheckingStatus to false');
      setIsCheckingStatus(false);
    }
  }, [isCheckingStatus, fetchPendingOrders, queryClient, onRefresh]);

  // Auto-trigger status check on component mount (only once)
  useEffect(() => {
    console.log('[AdminOrders] Auto-check effect:', { hasAutoChecked, isLoading, timerExists: !!autoCheckTimerRef.current });

    // Only set up timer if we haven't checked yet and data is loaded
    if (!hasAutoChecked && !isLoading && !autoCheckTimerRef.current) {
      console.log('[AdminOrders] Auto-triggering status check...');

      // Run in background after a short delay to let page load
      autoCheckTimerRef.current = setTimeout(() => {
        console.log('[AdminOrders] ===== TIMER FIRED =====');
        console.log('[AdminOrders] handleCheckPendingOrders type:', typeof handleCheckPendingOrders);

        // Mark as checked BEFORE calling to prevent re-triggering
        setHasAutoChecked(true);
        autoCheckTimerRef.current = null;

        if (typeof handleCheckPendingOrders === 'function') {
          console.log('[AdminOrders] Calling handleCheckPendingOrders...');
          try {
            const result = handleCheckPendingOrders();
            console.log('[AdminOrders] handleCheckPendingOrders returned:', result);
            if (result && typeof result.then === 'function') {
              result.then(
                (res) => console.log('[AdminOrders] handleCheckPendingOrders promise resolved:', res),
                (err) => console.error('[AdminOrders] handleCheckPendingOrders promise rejected:', err)
              );
            }
          } catch (error) {
            console.error('[AdminOrders] Error calling handleCheckPendingOrders from timer:', error);
          }
        } else {
          console.error('[AdminOrders] handleCheckPendingOrders is not a function!');
        }
      }, 500); // Reduced from 1000ms to 500ms

      console.log('[AdminOrders] Timer set with ID:', autoCheckTimerRef.current, 'will fire in 500ms');
    }

    // Cleanup: only clear timer if component unmounts
    return () => {
      if (autoCheckTimerRef.current) {
        console.log('[AdminOrders] Cleaning up auto-check timer on unmount:', autoCheckTimerRef.current);
        clearTimeout(autoCheckTimerRef.current);
        autoCheckTimerRef.current = null;
      }
    };
  }, [hasAutoChecked, isLoading, handleCheckPendingOrders]);

  // Get orders from current page (regular query returns { data: [...], total: ... })
  const paginatedOrders = useMemo(() => {
    return data?.data || [];
  }, [data]);

  // Get total count from server response
  const totalCount = useMemo(() => {
    return data?.total || 0;
  }, [data]);

  // Calculate total pages from server-provided total count
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
  const displayTotal = totalCount;

  const handleOrderStatusUpdate = useCallback(async (orderId, newStatus) => {
    try {
      await updateOrderMutation.mutateAsync({
        orderId,
        updates: { status: newStatus }
      });
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to update order:', error);
    }
  }, [updateOrderMutation, onRefresh]);

  const handleRefundOrder = useCallback(async (order) => {
    if (!confirm('Are you sure you want to refund this order?')) return;

    // Validate order has required fields
    if (!order.user_id) {
      console.error('Order missing user_id:', order);
      toast.error('Order is missing user information. Cannot process refund.');
      return;
    }

    // Cancel any outgoing refetches to avoid overwriting optimistic update
    await queryClient.cancelQueries({ queryKey: ['admin', 'orders'] });

    // Snapshot the previous value for rollback
    const previousQueries = queryClient.getQueriesData({ queryKey: ['admin', 'orders'] });
    const previousData = new Map(previousQueries);

    // Optimistically update the order in cache immediately
    queryClient.setQueriesData({ queryKey: ['admin', 'orders'] }, (oldData) => {
      if (!oldData) return oldData;

      // Handle infinite query structure (has pages)
      if (oldData.pages) {
        return {
          ...oldData,
          pages: oldData.pages.map((page) => {
            if (!page || !page.data) return page;

            const updatedData = page.data.map((o) => {
              if (o.id === order.id) {
                return {
                  ...o,
                  status: 'refunded',
                  refund_status: 'succeeded'
                };
              }
              return o;
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
        return oldData.map((o) => {
          if (o.id === order.id) {
            return {
              ...o,
              status: 'refunded',
              refund_status: 'succeeded'
            };
          }
          return o;
        });
      }

      // Handle query with data property
      if (oldData.data) {
        if (Array.isArray(oldData.data)) {
          return {
            ...oldData,
            data: oldData.data.map((o) => {
              if (o.id === order.id) {
                return {
                  ...o,
                  status: 'refunded',
                  refund_status: 'succeeded'
                };
              }
              return o;
            }),
          };
        }
      }

      return oldData;
    });

    try {
      // Process the refund
      const result = await processManualRefund(order);

      if (result.success) {
        toast.success('Refund processed successfully');
        // Invalidate queries to ensure data consistency (refetch in background)
        queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
        queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
        // Refetch to ensure UI is updated with latest data
        await refetch();
        if (onRefresh) onRefresh();
      } else {
        // Rollback optimistic update on error
        previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
        toast.error(result.error || 'Failed to process refund');
      }
    } catch (error) {
      // Rollback optimistic update on error
      previousData.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
      console.error('Refund error:', error);
      toast.error(error.message || 'Failed to process refund');
    }
  }, [onRefresh, queryClient, refetch]);

  const handleReorderToSMMGen = useCallback(async (order) => {
    if (!order.services?.smmgen_service_id) {
      toast.error('Service does not have SMMGen service ID configured.');
      return;
    }

    const serviceName = order.promotion_package_id
      ? order.promotion_packages?.name || 'Package'
      : order.services?.name || 'N/A';
    if (!confirm(`Are you sure you want to send this order to SMMGen?\n\nService: ${serviceName}\nLink: ${order.link}\nQuantity: ${order.quantity}`)) {
      return;
    }

    try {
      await reorderMutation.mutateAsync(order.id);
      if (onRefresh) onRefresh();
    } catch (error) {
      // Error is already handled by the mutation's onError
      console.error('Failed to reorder to SMMGen:', error);
    }
  }, [reorderMutation, onRefresh]);

  const renderTableHeader = useCallback(() => (
    <div className="grid grid-cols-12 gap-4 p-4 font-semibold text-sm min-w-[1500px]">
      <div className="col-span-1.5 min-w-[120px]">Status</div>
      <div className="col-span-1 min-w-[100px]">Order No</div>
      <div className="col-span-1 min-w-[100px]">Panel ID</div>
      <div className="col-span-1 min-w-[80px]">Quantity</div>
      <div className="col-span-1.5 min-w-[130px]">Time</div>
      <div className="col-span-2 min-w-[180px]">User</div>
      <div className="col-span-1.5 min-w-[150px]">Service</div>
      <div className="col-span-1 min-w-[80px]">Cost</div>
      <div className="col-span-2 min-w-[200px]">Link</div>
      <div className="col-span-1 min-w-[120px]">Actions</div>
    </div>
  ), []);

  const renderTableRow = useCallback((order, index) => {
    return (
      <div className="grid grid-cols-12 gap-4 p-4 items-start bg-white hover:bg-gray-50 transition-colors min-h-[100px]">
        <div className="col-span-1.5 flex flex-col gap-1">
          <span className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 w-fit ${order.status === 'completed' ? 'bg-green-100 text-green-700' :
              order.status === 'processing' || order.status === 'in progress' ? 'bg-blue-100 text-blue-700' :
                order.status === 'partial' ? 'bg-orange-100 text-orange-700' :
                  order.status === 'canceled' || order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                    order.status === 'refunds' ? 'bg-purple-100 text-purple-700' :
                      order.status === 'refunded' ? 'bg-gray-100 text-gray-700' :
                        'bg-yellow-100 text-yellow-700'
            }`}>
            {order.status === 'refunded' ? 'already refunded' : (order.status || 'pending')}
          </span>
          {order.refund_status && (
            <p className="text-xs text-gray-500 mt-1">Refund: {order.refund_status}</p>
          )}
        </div>
        <div className="col-span-1">
          {(() => {
            // Get service info to check if it has panel IDs
            const serviceHasSmmcost = order.services?.smmcost_service_id && order.services.smmcost_service_id > 0;
            const serviceHasSmmgen = order.services?.smmgen_service_id;
            const serviceHasJbsmmpanel = order.services?.jbsmmpanel_service_id && order.services.jbsmmpanel_service_id > 0;

            // Prioritize: SMMCost > JB SMM Panel > SMMGen
            const hasSmmcost = order.smmcost_order_id && order.smmcost_order_id > 0;
            const hasJbsmmpanel = order.jbsmmpanel_order_id && String(order.jbsmmpanel_order_id).toLowerCase() !== "order not placed at jbsmmpanel";
            const hasSmmgen = order.smmgen_order_id && order.smmgen_order_id !== "order not placed at smm gen";

            if (hasSmmcost) {
              // SMMCost order ID exists and is valid
              return <p className="font-medium text-gray-900 text-sm">{order.smmcost_order_id}</p>;
            } else if (hasJbsmmpanel) {
              // JB SMM Panel order ID exists and is valid
              return <p className="font-medium text-gray-900 text-sm">{order.jbsmmpanel_order_id}</p>;
            } else if (hasSmmgen) {
              // SMMGen order ID exists and is valid
              return <p className="font-medium text-gray-900 text-sm">{order.smmgen_order_id}</p>;
            } else if (order.smmgen_order_id === "order not placed at smm gen") {
              // Order failed at SMMGen
              return (
                <div className="flex items-center gap-1">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <p className="text-xs text-red-600 italic font-medium">Order not placed at SMMGen</p>
                </div>
              );
            } else if (String(order.jbsmmpanel_order_id || '').toLowerCase() === "order not placed at jbsmmpanel") {
              // Order failed at JB SMM Panel
              return (
                <div className="flex items-center gap-1">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <p className="text-xs text-red-600 italic font-medium">Order not placed at JBSMMPanel</p>
                </div>
              );
            } else if (serviceHasSmmcost && !hasSmmcost) {
              // Service has SMMCost ID but order doesn't - order failed at SMMCost
              return (
                <div className="flex items-center gap-1">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <p className="text-xs text-red-600 italic font-medium">Order not placed at SMMCost</p>
                </div>
              );
            } else if (order.smmcost_order_id === null && order.jbsmmpanel_order_id === null && order.smmgen_order_id === null) {
              // No order IDs at all
              return (
                <div className="flex items-center gap-1">
                  <AlertCircle className="w-4 h-4 text-orange-500" />
                  <p className="text-xs text-orange-600 italic font-medium">Not sent</p>
                </div>
              );
            } else {
              // Fallback - shouldn't reach here
              return (
                <div className="flex items-center gap-1">
                  <AlertCircle className="w-4 h-4 text-orange-500" />
                  <p className="text-xs text-orange-600 italic font-medium">Not sent</p>
                </div>
              );
            }
          })()}
        </div>
        <div className="col-span-1">
          {(() => {
            // Show which panel(s) have IDs
            const hasSmmcost = order.smmcost_order_id && order.smmcost_order_id > 0;
            const hasJbsmmpanel = order.jbsmmpanel_order_id && String(order.jbsmmpanel_order_id).toLowerCase() !== "order not placed at jbsmmpanel";
            const hasSmmgen = order.smmgen_order_id && order.smmgen_order_id !== "order not placed at smm gen";

            const panelIds = [];
            if (hasSmmcost) panelIds.push(`SMMCost: ${order.smmcost_order_id}`);
            if (hasJbsmmpanel) panelIds.push(`JBSMMPanel: ${order.jbsmmpanel_order_id}`);
            if (hasSmmgen) panelIds.push(`SMMGen: ${order.smmgen_order_id}`);

            if (panelIds.length > 1) {
              return (
                <div className="text-xs">
                  {panelIds.map((id, index) => (
                    <p key={index} className={index === 0 ? "text-gray-900" : "text-gray-600 mt-0.5"}>
                      {id}
                    </p>
                  ))}
                </div>
              );
            } else if (panelIds.length === 1) {
              return <p className="text-xs text-gray-600">{panelIds[0]}</p>;
            } else {
              return <p className="text-xs text-gray-400 italic">None</p>;
            }
          })()}
        </div>
        <div className="col-span-1">
          <p className="font-semibold text-gray-900 text-base">{order.quantity}</p>
          <p className="text-xs text-gray-500">units</p>
        </div>
        <div className="col-span-1.5">
          <p className="text-sm text-gray-700">{new Date(order.created_at).toLocaleDateString()}</p>
          <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleTimeString()}</p>
        </div>
        <div className="col-span-2">
          <p className="font-medium text-gray-900 text-sm">{order.profiles?.name || 'Unknown'}</p>
          <p className="text-xs text-gray-600">{order.profiles?.email || order.user_id?.slice(0, 8)}</p>
          {order.profiles?.phone_number && (
            <p className="text-xs text-gray-500">📱 {order.profiles.phone_number}</p>
          )}
        </div>
        <div className="col-span-1.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-900">
              {order.promotion_package_id
                ? order.promotion_packages?.name || 'Package'
                : order.services?.name || 'N/A'}
            </p>
            {order.promotion_package_id && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                <Tag className="w-3 h-3" />
              </span>
            )}
          </div>
        </div>
        <div className="col-span-1">
          <p className="text-sm font-semibold text-gray-900">₵{order.total_cost?.toFixed(2) || '0.00'}</p>
        </div>
        <div className="col-span-2">
          <a href={order.link} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline break-all">
            {order.link}
          </a>
        </div>
        <div className="col-span-1">
          <div className="flex flex-col gap-2 w-full">
            <Select
              value={order.status || 'pending'}
              onValueChange={(value) => handleOrderStatusUpdate(order.id, value)}
            >
              <SelectTrigger className="w-full text-xs min-h-[44px]">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in progress">In Progress</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="canceled">Canceled</SelectItem>
                <SelectItem value="refunds">Refunds</SelectItem>
                <SelectItem value="refunded">Already Refunded</SelectItem>
              </SelectContent>
            </Select>
            {!order.smmgen_order_id && !order.smmcost_order_id &&
              !order.smmcost_order_id &&
              (order.services?.smmgen_service_id || order.services?.smmcost_service_id) &&
              order.status !== 'completed' &&
              order.status !== 'cancelled' &&
              order.status !== 'refunded' && (
                <Button
                  onClick={() => handleReorderToSMMGen(order)}
                  disabled={reorderMutation.isPending}
                  variant="outline"
                  size="sm"
                  className="w-full min-h-[44px] text-xs text-indigo-600 hover:text-indigo-700 border-indigo-300 hover:bg-indigo-50"
                  title="Send this order to SMMGen"
                >
                  <RotateCcw className={`w-3 h-3 mr-1 ${reorderMutation.isPending ? 'animate-spin' : ''}`} />
                  {reorderMutation.isPending ? 'Sending...' : 'Reorder'}
                </Button>
              )}
            {(order.status === 'canceled' || order.status === 'cancelled') &&
              order.refund_status !== 'succeeded' &&
              order.status !== 'refunded' && (
                <Button
                  onClick={() => handleRefundOrder(order)}
                  variant="outline"
                  size="sm"
                  disabled={order.refund_status === 'pending'}
                  className={`w-full min-h-[44px] ${order.refund_status === 'failed'
                      ? "text-orange-600 hover:text-orange-700 border-orange-300 text-xs"
                      : order.refund_status === 'pending'
                        ? "text-gray-400 border-gray-300 text-xs cursor-not-allowed"
                        : "text-red-600 hover:text-red-700 text-xs"
                    }`}
                  title={order.refund_status === 'pending' ? 'Refund in progress...' : undefined}
                >
                  {order.refund_status === 'failed'
                    ? 'Manual Refund'
                    : order.refund_status === 'pending'
                      ? 'Refund Pending...'
                      : 'Refund'}
                </Button>
              )}
            {(order.status === 'canceled' || order.status === 'cancelled') &&
              (order.refund_status === 'succeeded' || order.status === 'refunded') && (
                <div className="w-full min-h-[44px] flex items-center justify-center text-xs text-gray-500 italic">
                  Already Refunded
                </div>
              )}
          </div>
        </div>
      </div>
    );
  }, [handleOrderStatusUpdate, handleRefundOrder, handleReorderToSMMGen, reorderMutation.isPending]);

  const renderMobileCard = useCallback((order, index) => {
    return (
      <div className="bg-white p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-3 py-1.5 rounded-full text-xs font-medium ${order.status === 'completed' ? 'bg-green-100 text-green-700' :
                  order.status === 'processing' || order.status === 'in progress' ? 'bg-blue-100 text-blue-700' :
                    order.status === 'partial' ? 'bg-orange-100 text-orange-700' :
                      order.status === 'canceled' || order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                        order.status === 'refunds' ? 'bg-purple-100 text-purple-700' :
                          order.status === 'refunded' ? 'bg-gray-100 text-gray-700' :
                            'bg-yellow-100 text-yellow-700'
                }`}>
                {order.status === 'refunded' ? 'already refunded' : (order.status || 'pending')}
              </span>
              {order.refund_status && (
                <span className="text-xs text-gray-500">Refund: {order.refund_status}</span>
              )}
            </div>
            {(() => {
              // Get service info to check if it has panel IDs
              const serviceHasSmmcost = order.services?.smmcost_service_id && order.services.smmcost_service_id > 0;
              const serviceHasSmmgen = order.services?.smmgen_service_id;
              const serviceHasJbsmmpanel = order.services?.jbsmmpanel_service_id && order.services.jbsmmpanel_service_id > 0;

              // Prioritize: SMMCost > JB SMM Panel > SMMGen
              const hasSmmcost = order.smmcost_order_id && order.smmcost_order_id > 0;
              const hasJbsmmpanel = order.jbsmmpanel_order_id && String(order.jbsmmpanel_order_id).toLowerCase() !== "order not placed at jbsmmpanel";
              const hasSmmgen = order.smmgen_order_id && order.smmgen_order_id !== "order not placed at smm gen";

              if (hasSmmcost) {
                return <p className="font-semibold text-gray-900 text-base">Order No: {order.smmcost_order_id}</p>;
              } else if (hasJbsmmpanel) {
                return <p className="font-semibold text-gray-900 text-base">Order No: {order.jbsmmpanel_order_id}</p>;
              } else if (hasSmmgen) {
                return <p className="font-semibold text-gray-900 text-base">Order No: {order.smmgen_order_id}</p>;
              } else if (order.smmgen_order_id === "order not placed at smm gen") {
                return (
                  <div className="flex items-center gap-1 mt-1">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <p className="text-xs text-red-600 italic font-medium">Order not placed at SMMGen</p>
                  </div>
                );
              } else if (String(order.jbsmmpanel_order_id || '').toLowerCase() === "order not placed at jbsmmpanel") {
                // Order failed at JB SMM Panel
                return (
                  <div className="flex items-center gap-1 mt-1">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <p className="text-xs text-red-600 italic font-medium">Order not placed at JBSMMPanel</p>
                  </div>
                );
              } else if (serviceHasSmmcost && !hasSmmcost) {
                // Service has SMMCost ID but order doesn't - order failed at SMMCost
                return (
                  <div className="flex items-center gap-1 mt-1">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <p className="text-xs text-red-600 italic font-medium">Order not placed at SMMCost</p>
                  </div>
                );
              } else if (order.smmcost_order_id === null && order.jbsmmpanel_order_id === null && order.smmgen_order_id === null) {
                return (
                  <div className="flex items-center gap-1 mt-1">
                    <AlertCircle className="w-4 h-4 text-orange-500" />
                    <p className="text-xs text-orange-600 italic font-medium">Not sent</p>
                  </div>
                );
              } else {
                return (
                  <div className="flex items-center gap-1 mt-1">
                    <AlertCircle className="w-4 h-4 text-orange-500" />
                    <p className="text-xs text-orange-600 italic font-medium">Not sent</p>
                  </div>
                );
              }
            })()}
            {(() => {
              // Show which panel(s) have IDs
              const hasSmmcost = order.smmcost_order_id && order.smmcost_order_id > 0;
              const hasJbsmmpanel = order.jbsmmpanel_order_id && String(order.jbsmmpanel_order_id).toLowerCase() !== "order not placed at jbsmmpanel";
              const hasSmmgen = order.smmgen_order_id && order.smmgen_order_id !== "order not placed at smm gen";

              const panelIds = [];
              if (hasSmmcost) panelIds.push(`SMMCost: ${order.smmcost_order_id}`);
              if (hasJbsmmpanel) panelIds.push(`JBSMMPanel: ${order.jbsmmpanel_order_id}`);
              if (hasSmmgen) panelIds.push(`SMMGen: ${order.smmgen_order_id}`);

              if (panelIds.length > 0) {
                return (
                  <div className="text-xs text-gray-600 mt-1">
                    {panelIds.map((id, index) => (
                      <p key={index}>{id}</p>
                    ))}
                  </div>
                );
              }
              return null;
            })()}
          </div>
          <div className="text-right">
            <p className="font-semibold text-gray-900 text-lg">₵{order.total_cost?.toFixed(2) || '0.00'}</p>
            <p className="text-xs text-gray-500">{order.quantity} units</p>
          </div>
        </div>
        <div className="pt-2 border-t border-gray-200 space-y-2">
          <div>
            <p className="text-xs text-gray-500">User</p>
            <p className="font-medium text-gray-900 text-sm">{order.profiles?.name || 'Unknown'}</p>
            <p className="text-xs text-gray-600">{order.profiles?.email || order.user_id?.slice(0, 8)}</p>
            {order.profiles?.phone_number && (
              <p className="text-xs text-gray-500">📱 {order.profiles.phone_number}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-500">Service</p>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-gray-900">
                {order.promotion_package_id
                  ? order.promotion_packages?.name || 'Package'
                  : order.services?.name || 'N/A'}
              </p>
              {order.promotion_package_id && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                  <Tag className="w-3 h-3" />
                </span>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500">Link</p>
            <a href={order.link} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline break-all">
              {order.link}
            </a>
          </div>
          <div>
            <p className="text-xs text-gray-500">Created</p>
            <p className="text-sm text-gray-700">{new Date(order.created_at).toLocaleDateString()} {new Date(order.created_at).toLocaleTimeString()}</p>
          </div>
        </div>
        <div className="pt-3 border-t border-gray-200 space-y-2">
          <Select
            value={order.status || 'pending'}
            onValueChange={(value) => handleOrderStatusUpdate(order.id, value)}
          >
            <SelectTrigger className="w-full min-h-[44px]">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in progress">In Progress</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="canceled">Canceled</SelectItem>
              <SelectItem value="refunds">Refunds</SelectItem>
              <SelectItem value="refunded">Already Refunded</SelectItem>
            </SelectContent>
          </Select>
          {!order.smmgen_order_id && !order.smmcost_order_id &&
            (order.services?.smmgen_service_id || order.services?.smmcost_service_id) &&
            order.status !== 'completed' &&
            order.status !== 'cancelled' &&
            order.status !== 'refunded' && (
              <Button
                onClick={() => handleReorderToSMMGen(order)}
                disabled={reorderMutation.isPending}
                variant="outline"
                size="sm"
                className="w-full min-h-[44px] text-indigo-600 hover:text-indigo-700 border-indigo-300 hover:bg-indigo-50"
                title="Send this order to SMMGen"
              >
                <RotateCcw className={`w-3 h-3 mr-1 ${reorderMutation.isPending ? 'animate-spin' : ''}`} />
                {reorderMutation.isPending ? 'Sending...' : 'Reorder to SMMGen'}
              </Button>
            )}
          {(order.status === 'canceled' || order.status === 'cancelled') &&
            order.refund_status !== 'succeeded' &&
            order.status !== 'refunded' && (
              <Button
                onClick={() => handleRefundOrder(order)}
                variant="outline"
                size="sm"
                disabled={order.refund_status === 'pending'}
                className={`w-full min-h-[44px] ${order.refund_status === 'failed'
                    ? "text-orange-600 hover:text-orange-700 border-orange-300"
                    : order.refund_status === 'pending'
                      ? "text-gray-400 border-gray-300 cursor-not-allowed"
                      : "text-red-600 hover:text-red-700"
                  }`}
                title={order.refund_status === 'pending' ? 'Refund in progress...' : undefined}
              >
                {order.refund_status === 'failed'
                  ? 'Manual Refund'
                  : order.refund_status === 'pending'
                    ? 'Refund Pending...'
                    : 'Refund'}
              </Button>
            )}
          {(order.status === 'canceled' || order.status === 'cancelled') &&
            (order.refund_status === 'succeeded' || order.status === 'refunded') && (
              <div className="w-full min-h-[44px] flex items-center justify-center text-xs text-gray-500 italic">
                Already Refunded
              </div>
            )}
        </div>
      </div>
    );
  }, [handleOrderStatusUpdate, handleRefundOrder, handleReorderToSMMGen, reorderMutation.isPending]);

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
        <div className="space-y-4">
          <div className="h-8 bg-gray-200 rounded animate-pulse w-1/3"></div>
          <div className="h-12 bg-gray-200 rounded animate-pulse"></div>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded animate-pulse"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const useVirtualScroll = paginatedOrders.length > VIRTUAL_SCROLL_THRESHOLD;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm w-full max-w-full overflow-hidden">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Orders</h2>
            <Button
              onClick={() => {
                refetch();
                if (onRefresh) onRefresh();
              }}
              disabled={refreshing}
              variant="outline"
              size="sm"
              className="flex items-center gap-2 min-h-[44px]"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              onClick={handleCheckPendingOrders}
              disabled={isCheckingStatus || refreshing}
              variant="outline"
              size="sm"
              className="flex items-center gap-2 min-h-[44px]"
            >
              <CheckCircle2 className={`w-4 h-4 ${isCheckingStatus ? 'animate-spin' : ''}`} />
              {isCheckingStatus ? 'Checking...' : 'Check Pending Orders'}
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Select
              value={searchType}
              onValueChange={(value) => {
                setSearchType(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-48 min-h-[44px]">
                <SelectValue placeholder="Search type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="service_name">Service Name</SelectItem>
                <SelectItem value="package_name">Package Name</SelectItem>
                <SelectItem value="order_id">Order ID</SelectItem>
                <SelectItem value="user_name">User Name</SelectItem>
                <SelectItem value="user_info">User Info</SelectItem>
                <SelectItem value="link">Link</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                placeholder="Search by order ID, username, email, phone, service name, package name, or link..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-11 h-12 text-base"
              />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                type="date"
                placeholder="Filter by date"
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full h-12 text-base"
              />
            </div>
            <Select value={statusFilter} onValueChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}>
              <SelectTrigger className="w-full sm:w-48 min-h-[44px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="failed_to_smmgen">⚠️ Failed to SMMGen</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in progress">In Progress</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="canceled">Canceled</SelectItem>
                <SelectItem value="refunds">Refunds</SelectItem>
                <SelectItem value="refunded">Already Refunded</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {isLoading && paginatedOrders.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 bg-gray-200 rounded animate-pulse"></div>
          ))}
        </div>
      ) : paginatedOrders.length === 0 ? (
        <p className="text-gray-600 text-center py-8">
          {searchType === 'service_name' && searchTerm
            ? `No orders found for service: ${searchTerm}`
            : searchType === 'package_name' && searchTerm
              ? `No orders found for package: ${searchTerm}`
              : searchType === 'user_name' && searchTerm
                ? `No orders found for user: ${searchTerm}`
                : 'No orders found'}
        </p>
      ) : (
        <>
          <ResponsiveTable
            items={paginatedOrders}
            renderTableHeader={renderTableHeader}
            renderTableRow={renderTableRow}
            renderCard={renderMobileCard}
            useVirtualScroll={useVirtualScroll}
            emptyMessage="No orders found"
            minTableWidth="1500px"
            itemHeight={100}
          />

          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-gray-600">
              Showing {(page - 1) * ITEMS_PER_PAGE + 1} to {Math.min(page * ITEMS_PER_PAGE, displayTotal)} of {displayTotal} orders
              {isFetching && (
                <span className="ml-2 text-xs text-gray-500">(Loading...)</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                disabled={page === 1}
                variant="outline"
                size="sm"
              >
                Previous
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      variant={page === pageNum ? "default" : "outline"}
                      size="sm"
                      className={page === pageNum ? "bg-indigo-600 hover:bg-indigo-700 text-white" : ""}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                disabled={page === totalPages}
                variant="outline"
                size="sm"
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

AdminOrders.displayName = 'AdminOrders';

export default AdminOrders;


