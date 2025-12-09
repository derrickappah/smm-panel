import React, { memo, useState, useMemo, useCallback, useEffect } from 'react';
import { useAdminOrders, useUpdateOrder, useReorderToSMMGen } from '@/hooks/useAdminOrders';
import { useDebounce } from '@/hooks/useDebounce';
import VirtualizedList from '@/components/VirtualizedList';
import ResponsiveTable from '@/components/admin/ResponsiveTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, RefreshCw, Filter, AlertCircle, RotateCcw } from 'lucide-react';
import { processManualRefund } from '@/lib/refunds';
import { toast } from 'sonner';

const ITEMS_PER_PAGE = 50;
const VIRTUAL_SCROLL_THRESHOLD = 100;

const AdminOrders = memo(({ onRefresh, refreshing = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounce(searchTerm, 300);

  const { 
    data, 
    isLoading, 
    fetchNextPage, 
    hasNextPage,
    isFetchingNextPage,
    refetch
  } = useAdminOrders({ 
    enabled: true, 
    useInfinite: true,
    checkSMMGenStatus: true
  });

  const updateOrderMutation = useUpdateOrder();
  const reorderMutation = useReorderToSMMGen();

  const allOrders = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap(page => page.data || []);
  }, [data]);

  // Get total count from first page
  const totalCount = useMemo(() => {
    return data?.pages?.[0]?.total || allOrders.length;
  }, [data, allOrders.length]);

  // Load all pages when there are no filters (to show accurate total count)
  useEffect(() => {
    if (!isLoading && hasNextPage && !isFetchingNextPage && !debouncedSearch && statusFilter === 'all' && !dateFilter) {
      // Load all remaining pages to get accurate total count
      fetchNextPage();
    }
  }, [isLoading, hasNextPage, isFetchingNextPage, debouncedSearch, statusFilter, dateFilter, fetchNextPage]);

  // Load more pages when needed for pagination with filters
  useEffect(() => {
    if (!isLoading && hasNextPage && !isFetchingNextPage) {
      const currentPageData = allOrders.length;
      const neededData = page * ITEMS_PER_PAGE;
      
      // If we need more data than we have, fetch next page
      if (neededData > currentPageData) {
        fetchNextPage();
      }
    }
  }, [page, allOrders.length, hasNextPage, isFetchingNextPage, isLoading, fetchNextPage]);

  const filteredOrders = useMemo(() => {
    let filtered = [...allOrders];

    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase();
      filtered = filtered.filter(order => {
        const orderId = (order.id || '').toLowerCase();
        const userName = (order.profiles?.name || '').toLowerCase();
        const userEmail = (order.profiles?.email || '').toLowerCase();
        const userPhone = (order.profiles?.phone_number || '').toLowerCase();
        const serviceName = (order.services?.name || '').toLowerCase();
        return orderId.includes(searchLower) || 
               userName.includes(searchLower) || 
               userEmail.includes(searchLower) ||
               userPhone.includes(searchLower) ||
               serviceName.includes(searchLower);
      });
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(order => {
        if (statusFilter === 'refunded') {
          return order.refund_status === 'succeeded';
        }
        if (statusFilter === 'failed_to_smmgen') {
          // Show orders without SMMGen ID that are not completed or cancelled
          return !order.smmgen_order_id && 
                 order.status !== 'completed' && 
                 order.status !== 'cancelled' &&
                 order.status !== 'refunded';
        }
        return order.status === statusFilter;
      });
    }

    if (dateFilter) {
      const filterDate = new Date(dateFilter);
      filterDate.setHours(0, 0, 0, 0);
      const filterDateEnd = new Date(filterDate);
      filterDateEnd.setHours(23, 59, 59, 999);
      
      filtered = filtered.filter(order => {
        const orderDate = new Date(order.created_at);
        return orderDate >= filterDate && orderDate <= filterDateEnd;
      });
    }

    return filtered;
  }, [allOrders, debouncedSearch, statusFilter, dateFilter]);

  const paginatedOrders = useMemo(() => {
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    return filteredOrders.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredOrders, page]);

  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);
  const displayTotal = filteredOrders.length;

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
    
    try {
      // Validate order has required fields
      if (!order.user_id) {
        console.error('Order missing user_id:', order);
        toast.error('Order is missing user information. Cannot process refund.');
        return;
      }

      const result = await processManualRefund(order);
      if (result.success) {
        toast.success('Refund processed successfully');
        if (onRefresh) onRefresh();
      } else {
        toast.error(result.error || 'Failed to process refund');
      }
    } catch (error) {
      console.error('Refund error:', error);
      toast.error(error.message || 'Failed to process refund');
    }
  }, [onRefresh]);

  const handleReorderToSMMGen = useCallback(async (order) => {
    if (!order.services?.smmgen_service_id) {
      toast.error('Service does not have SMMGen service ID configured.');
      return;
    }

    if (!confirm(`Are you sure you want to send this order to SMMGen?\n\nService: ${order.services?.name || 'N/A'}\nLink: ${order.link}\nQuantity: ${order.quantity}`)) {
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
      <div className="col-span-1 min-w-[100px]">Order ID</div>
      <div className="col-span-1 min-w-[100px]">SMMGen ID</div>
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
          <span className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 w-fit ${
            order.status === 'completed' ? 'bg-green-100 text-green-700' :
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
          <p className="font-medium text-gray-900 text-sm">{order.id?.slice(0, 8)}...</p>
          <p className="text-xs text-gray-500">{order.id?.slice(8, 16)}...</p>
        </div>
        <div className="col-span-1">
          {order.smmgen_order_id ? (
            order.smmgen_order_id === "order not placed at smm gen" ? (
              <div className="flex items-center gap-1">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <p className="text-xs text-red-600 italic font-medium">Order not placed at SMMGen</p>
              </div>
            ) : (
              <p className="font-medium text-gray-900 text-sm">{order.smmgen_order_id}</p>
            )
          ) : (
            <div className="flex items-center gap-1">
              <AlertCircle className="w-4 h-4 text-orange-500" />
              <p className="text-xs text-orange-600 italic font-medium">Not sent</p>
            </div>
          )}
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
          <p className="text-sm font-medium text-gray-900">{order.services?.name || 'N/A'}</p>
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
            {!order.smmgen_order_id && 
             order.services?.smmgen_service_id && 
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
            {(order.status === 'canceled' || order.status === 'cancelled') && (
              <Button
                onClick={() => handleRefundOrder(order)}
                variant="outline"
                size="sm"
                className={`w-full min-h-[44px] ${
                  order.refund_status === 'failed' 
                    ? "text-orange-600 hover:text-orange-700 border-orange-300 text-xs"
                    : "text-red-600 hover:text-red-700 text-xs"
                }`}
              >
                {order.refund_status === 'failed' ? 'Manual Refund' : 'Refund'}
              </Button>
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
              <span className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                order.status === 'completed' ? 'bg-green-100 text-green-700' :
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
            <p className="font-semibold text-gray-900 text-base">Order: {order.id?.slice(0, 12)}...</p>
            {order.smmgen_order_id ? (
              order.smmgen_order_id === "order not placed at smm gen" ? (
                <div className="flex items-center gap-1 mt-1">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <p className="text-xs text-red-600 italic font-medium">Order not placed at SMMGen</p>
                </div>
              ) : (
                <p className="text-sm text-gray-600 mt-1">SMMGen: {order.smmgen_order_id}</p>
              )
            ) : (
              <div className="flex items-center gap-1 mt-1">
                <AlertCircle className="w-4 h-4 text-orange-500" />
                <p className="text-xs text-orange-600 italic font-medium">Not sent to SMMGen</p>
              </div>
            )}
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
            <p className="text-sm font-medium text-gray-900">{order.services?.name || 'N/A'}</p>
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
          {!order.smmgen_order_id && 
           order.services?.smmgen_service_id && 
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
          {(order.status === 'canceled' || order.status === 'cancelled') && (
            <Button
              onClick={() => handleRefundOrder(order)}
              variant="outline"
              size="sm"
              className={`w-full min-h-[44px] ${
                order.refund_status === 'failed' 
                  ? "text-orange-600 hover:text-orange-700 border-orange-300"
                  : "text-red-600 hover:text-red-700"
              }`}
            >
              {order.refund_status === 'failed' ? 'Manual Refund' : 'Refund'}
            </Button>
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

  const useVirtualScroll = filteredOrders.length > VIRTUAL_SCROLL_THRESHOLD;

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
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              placeholder="Search by order ID, username, email, phone, or service..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-11 h-12 text-base"
            />
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
            <Select value={statusFilter} onValueChange={setStatusFilter}>
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

      {filteredOrders.length === 0 ? (
        <p className="text-gray-600 text-center py-8">No orders found</p>
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
              {hasNextPage && !isFetchingNextPage && (
                <span className="ml-2 text-xs text-gray-500">(Loading more...)</span>
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


