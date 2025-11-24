import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getSMMGenOrderStatus } from '@/lib/smmgen';
import { saveOrderStatusHistory } from '@/lib/orderStatusHistory';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, CheckCircle, XCircle, Loader, RefreshCw, Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const OrderHistory = ({ user, onLogout }) => {
  const [orders, setOrders] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingStatus, setCheckingStatus] = useState({});
  const hasCheckedStatus = useRef(false);
  
  // Search and filter states
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [ordersPage, setOrdersPage] = useState(1);
  const ordersPerPage = 20;

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const [ordersRes, servicesRes] = await Promise.all([
        supabase
          .from('orders')
          .select('*')
          .eq('user_id', authUser.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('services')
          .select('*')
      ]);

      if (ordersRes.error) throw ordersRes.error;
      if (servicesRes.error) throw servicesRes.error;

      const fetchedOrders = ordersRes.data || [];
      setOrders(fetchedOrders);
      setServices(servicesRes.data || []);

      // Automatic refunds disabled - admins must process refunds manually
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    const statusLower = String(status || '').toLowerCase();
    switch (statusLower) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'canceled':
      case 'cancelled':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'processing':
      case 'in progress':
        return <Loader className="w-5 h-5 text-blue-600 animate-spin" />;
      case 'partial':
        return <Loader className="w-5 h-5 text-orange-600 animate-spin" />;
      case 'refunds':
        return <XCircle className="w-5 h-5 text-purple-600" />;
      case 'pending':
      default:
        return <Clock className="w-5 h-5 text-yellow-600" />;
    }
  };

  const getStatusColor = (status) => {
    const statusLower = String(status || '').toLowerCase();
    switch (statusLower) {
      case 'completed':
        return 'bg-green-100 text-green-700';
      case 'canceled':
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      case 'processing':
      case 'in progress':
        return 'bg-blue-100 text-blue-700';
      case 'partial':
        return 'bg-orange-100 text-orange-700';
      case 'refunds':
        return 'bg-purple-100 text-purple-700';
      case 'pending':
      default:
        return 'bg-yellow-100 text-yellow-700';
    }
  };

  // Map SMMGen status to exact SMMGen status format (normalized to lowercase)
  const mapSMMGenStatus = useCallback((smmgenStatus) => {
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
    
    return null; // Unknown status, don't update
  }, []);

  // Check and update order status from SMMGen
  const checkOrderStatus = useCallback(async (order) => {
    if (!order.smmgen_order_id) {
      toast.info('This order does not have a SMMGen order ID');
      return;
    }

    setCheckingStatus(prev => ({ ...prev, [order.id]: true }));

    try {
      // Get status from SMMGen
      const statusData = await getSMMGenOrderStatus(order.smmgen_order_id);
      
      // SMMGen API typically returns: { status: 'Completed', charge: '0.50', start_count: 100, remains: 0, currency: 'USD' }
      const smmgenStatus = statusData.status || statusData.Status;
      const mappedStatus = mapSMMGenStatus(smmgenStatus);

      if (mappedStatus && mappedStatus !== order.status) {
        // Save status to history first
        await saveOrderStatusHistory(
          order.id,
          mappedStatus,
          'smmgen',
          statusData, // Full SMMGen response
          order.status // Previous status
        );

        // Update order status in Supabase
        const { error: updateError } = await supabase
          .from('orders')
          .update({ 
            status: mappedStatus,
            completed_at: mappedStatus === 'completed' ? new Date().toISOString() : order.completed_at
          })
          .eq('id', order.id);

        if (updateError) {
          throw updateError;
        }

        // Get updated order with refund_status
        const { data: updatedOrder } = await supabase
          .from('orders')
          .select('*')
          .eq('id', order.id)
          .single();

        // Update local state
        setOrders(prevOrders =>
          prevOrders.map(o =>
            o.id === order.id
              ? { ...o, ...updatedOrder, status: mappedStatus, completed_at: mappedStatus === 'completed' ? new Date().toISOString() : o.completed_at }
              : o
          )
        );

        // Automatic refunds disabled - admins must process refunds manually
        if (mappedStatus === 'canceled' || mappedStatus === 'cancelled') {
          toast.warning('Order cancelled. Please contact support for a refund.');
        } else {
          toast.success(`Order status updated to ${mappedStatus}`);
        }
      } else if (mappedStatus === order.status) {
        toast.info('Order status is already up to date');
      } else {
        toast.info('Status check completed (no update needed)');
      }
    } catch (error) {
      console.error('Error checking order status:', error);
      toast.error(`Failed to check order status: ${error.message || 'Unknown error'}`);
    } finally {
      setCheckingStatus(prev => ({ ...prev, [order.id]: false }));
    }
  }, [mapSMMGenStatus]);

  // Auto-check status for orders with SMMGen IDs on load (only once)
  useEffect(() => {
    if (!loading && orders.length > 0 && !hasCheckedStatus.current) {
      hasCheckedStatus.current = true;
      const checkAllSMMGenOrders = async () => {
        // Check all non-completed orders (to catch cancellations)
        const ordersWithSMMGen = orders.filter(o => o.smmgen_order_id && o.status !== 'completed');
        
        // Check status for each order (with delay to avoid rate limiting)
        for (let i = 0; i < ordersWithSMMGen.length; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000 * i)); // 1 second delay between checks
          await checkOrderStatus(ordersWithSMMGen[i]);
        }
      };

      checkAllSMMGenOrders();
    }
  }, [loading, orders.length, checkOrderStatus]);

  // Periodic status checking for orders (every 2 minutes)
  useEffect(() => {
    if (loading) return;

    const interval = setInterval(() => {
      console.log('Periodic order status check in OrderHistory...');
      // Fetch fresh orders and check their status
      fetchData();
    }, 120000); // Check every 2 minutes

    return () => clearInterval(interval);
  }, [loading]);

  // Filter orders based on search and status
  const filteredOrders = orders.filter(o => {
    const searchLower = orderSearch.toLowerCase();
    const service = services.find(s => s.id === o.service_id);
    const serviceName = service?.name || '';
    const matchesSearch = 
      !orderSearch ||
      serviceName.toLowerCase().includes(searchLower) ||
      o.link.toLowerCase().includes(searchLower) ||
      o.id.toLowerCase().includes(searchLower);
    
    const matchesStatus = orderStatusFilter === 'all' || o.status === orderStatusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Pagination
  const totalOrdersPages = Math.ceil(filteredOrders.length / ordersPerPage);
  const startOrderIndex = (ordersPage - 1) * ordersPerPage;
  const endOrderIndex = startOrderIndex + ordersPerPage;
  const paginatedOrders = filteredOrders.slice(startOrderIndex, endOrderIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setOrdersPage(1);
  }, [orderStatusFilter, orderSearch]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <Navbar user={user} onLogout={onLogout} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6 animate-fadeIn">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Order History</h1>
          <p className="text-gray-600">Track all your orders and their status</p>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-indigo-600 mx-auto"></div>
          </div>
        ) : (
          <div className="glass p-4 sm:p-6 rounded-3xl animate-slideUp">
            {/* Search and Filter Section */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search by service, link, or order ID..."
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
                <SelectTrigger className="w-full sm:w-48">
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
                  </SelectContent>
              </Select>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-600 text-lg mb-2">
                  {orders.length === 0 ? 'No orders yet' : 'No orders match your filters'}
                </p>
                <p className="text-gray-500 text-sm">
                  {orders.length === 0 ? 'Your order history will appear here' : 'Try adjusting your search or filters'}
                </p>
              </div>
            ) : (
              <>
                {/* Orders Table */}
                <div className="overflow-x-auto">
                  <div className="min-w-[1000px]">
                    {/* Fixed Header */}
                    <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white sticky top-0 z-10">
                      <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1.5fr_1.5fr_1fr] gap-4 p-4 font-semibold text-sm text-center">
                        <div>Service</div>
                        <div>Link</div>
                        <div>Quantity</div>
                        <div>Cost</div>
                        <div>Status</div>
                        <div>Date</div>
                        <div>Actions</div>
                      </div>
                    </div>

                    {/* Orders List */}
                    <div className="divide-y divide-gray-200">
                      {paginatedOrders.map((order) => {
                        const service = services.find(s => s.id === order.service_id);
                        return (
                          <div
                            key={order.id}
                            data-testid={`order-item-${order.id}`}
                            className="bg-white/50 hover:bg-white/70 transition-colors"
                          >
                            <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1.5fr_1.5fr_1fr] gap-4 p-4 items-center">
                              {/* Service */}
                              <div className="text-center">
                                <p className="font-medium text-gray-900 text-sm">{service?.name || 'Unknown Service'}</p>
                                <p className="text-xs text-gray-500 mt-1">ID: {order.id.slice(0, 8)}...</p>
                              </div>
                              {/* Link */}
                              <div className="text-center">
                                <p className="text-sm text-gray-700 break-all line-clamp-2" title={order.link}>
                                  {order.link}
                                </p>
                              </div>
                              {/* Quantity */}
                              <div className="text-center">
                                <p className="font-semibold text-gray-900">{order.quantity}</p>
                              </div>
                              {/* Cost */}
                              <div className="text-center">
                                <p className="font-semibold text-gray-900">₵{order.total_cost.toFixed(2)}</p>
                              </div>
                              {/* Status */}
                              <div className="flex justify-center">
                                <div className="flex items-center gap-2">
                                  {getStatusIcon(order.status)}
                                  <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${getStatusColor(order.status)}`}>
                                    {order.status}
                                  </span>
                                </div>
                              </div>
                              {/* Date */}
                              <div className="text-center">
                                <p className="text-sm text-gray-700">{new Date(order.created_at).toLocaleDateString()}</p>
                                <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleTimeString()}</p>
                              </div>
                              {/* Actions */}
                              <div className="flex justify-center">
                                {order.smmgen_order_id && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => checkOrderStatus(order)}
                                    disabled={checkingStatus[order.id]}
                                    className="text-xs"
                                  >
                                    {checkingStatus[order.id] ? (
                                      <>
                                        <Loader className="w-3 h-3 mr-1 animate-spin" />
                                        Checking...
                                      </>
                                    ) : (
                                      <>
                                        <RefreshCw className="w-3 h-3 mr-1" />
                                        Check
                                      </>
                                    )}
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Pagination */}
                {totalOrdersPages > 1 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-gray-200">
                    <p className="text-sm text-gray-600">
                      Showing {startOrderIndex + 1} to {Math.min(endOrderIndex, filteredOrders.length)} of {filteredOrders.length} orders
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setOrdersPage(prev => Math.max(1, prev - 1))}
                        disabled={ordersPage === 1}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalOrdersPages) }, (_, i) => {
                          let pageNum;
                          if (totalOrdersPages <= 5) {
                            pageNum = i + 1;
                          } else if (ordersPage >= totalOrdersPages - 2) {
                            pageNum = totalOrdersPages - 4 + i;
                          } else if (ordersPage <= 3) {
                            pageNum = i + 1;
                          } else {
                            pageNum = ordersPage - 2 + i;
                          }
                          return (
                            <Button
                              key={pageNum}
                              variant={ordersPage === pageNum ? "default" : "outline"}
                              size="sm"
                              onClick={() => setOrdersPage(pageNum)}
                              className="w-8 h-8 p-0"
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setOrdersPage(prev => Math.min(totalOrdersPages, prev + 1))}
                        disabled={ordersPage === totalOrdersPages}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderHistory;
