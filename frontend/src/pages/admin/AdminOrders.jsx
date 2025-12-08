import React, { memo, useState, useMemo, useCallback, useEffect } from 'react';
import { useAdminOrders, useUpdateOrder } from '@/hooks/useAdminOrders';
import { useDebounce } from '@/hooks/useDebounce';
import VirtualizedList from '@/components/VirtualizedList';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, RefreshCw, Filter } from 'lucide-react';
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
    checkSMMGenStatus: false
  });

  const updateOrderMutation = useUpdateOrder();

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
      await processManualRefund(order.id);
      toast.success('Refund processed successfully');
      if (onRefresh) onRefresh();
    } catch (error) {
      toast.error(error.message || 'Failed to process refund');
    }
  }, [onRefresh]);

  const renderOrderRow = useCallback((order) => {
    return (
      <div className="grid grid-cols-12 gap-4 p-4 items-center bg-white hover:bg-gray-50 transition-colors border-b border-gray-200">
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
            <>
              <p className="font-medium text-gray-900 text-sm">{order.smmgen_order_id}</p>
            </>
          ) : (
            <p className="text-xs text-gray-400 italic">N/A</p>
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
          <div className="flex flex-col gap-2">
            <Select 
              value={order.status || 'pending'} 
              onValueChange={(value) => handleOrderStatusUpdate(order.id, value)}
            >
              <SelectTrigger className="w-full text-xs">
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
            {(order.status === 'canceled' || order.status === 'cancelled') && (
              <Button
                onClick={() => handleRefundOrder(order)}
                variant="outline"
                size="sm"
                className={
                  order.refund_status === 'failed' 
                    ? "text-orange-600 hover:text-orange-700 border-orange-300 text-xs"
                    : "text-red-600 hover:text-red-700 text-xs"
                }
              >
                {order.refund_status === 'failed' ? 'Manual Refund' : 'Refund'}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }, [handleOrderStatusUpdate, handleRefundOrder]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-600"></div>
      </div>
    );
  }

  const useVirtualScroll = filteredOrders.length > VIRTUAL_SCROLL_THRESHOLD;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
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
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40 h-11">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search by order ID, username, email, phone, or service..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div>
            <Input
              type="date"
              placeholder="Filter by date"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setPage(1);
              }}
              className="w-full"
            />
          </div>
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <p className="text-gray-600 text-center py-8">No orders found</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-200">
            {useVirtualScroll ? (
              <div className="min-w-[1500px]">
                <div className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                  <div className="grid grid-cols-12 gap-4 p-4 font-semibold text-sm">
                    <div className="col-span-1.5">Status</div>
                    <div className="col-span-1">Order ID</div>
                    <div className="col-span-1">SMMGen ID</div>
                    <div className="col-span-1">Quantity</div>
                    <div className="col-span-1.5">Time</div>
                    <div className="col-span-2">User</div>
                    <div className="col-span-1.5">Service</div>
                    <div className="col-span-1">Cost</div>
                    <div className="col-span-2">Link</div>
                    <div className="col-span-1">Actions</div>
                  </div>
                </div>
                <VirtualizedList
                  items={paginatedOrders}
                  renderItem={renderOrderRow}
                  itemHeight={100}
                  height={600}
                />
              </div>
            ) : (
              <div className="max-h-[600px] overflow-y-auto overflow-x-auto">
                <div className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10 min-w-[1500px]">
                  <div className="grid grid-cols-12 gap-4 p-4 font-semibold text-sm">
                    <div className="col-span-1.5">Status</div>
                    <div className="col-span-1">Order ID</div>
                    <div className="col-span-1">SMMGen ID</div>
                    <div className="col-span-1">Quantity</div>
                    <div className="col-span-1.5">Time</div>
                    <div className="col-span-2">User</div>
                    <div className="col-span-1.5">Service</div>
                    <div className="col-span-1">Cost</div>
                    <div className="col-span-2">Link</div>
                    <div className="col-span-1">Actions</div>
                  </div>
                </div>
                <div className="divide-y divide-gray-200/50 min-w-[1500px]">
                  {paginatedOrders.map((order) => (
                    <div key={order.id}>
                      {renderOrderRow(order)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

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


