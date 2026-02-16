import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getSMMGenOrderStatus } from '@/lib/smmgen';
import { saveOrderStatusHistory } from '@/lib/orderStatusHistory';
import { checkOrdersStatusBatch, shouldCheckOrder } from '@/lib/orderStatusCheck';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Clock, CheckCircle, XCircle, Loader, RefreshCw, Search, Filter, ChevronLeft, ChevronRight, Tag, Gift } from 'lucide-react';
import SEO from '@/components/SEO';

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
          .select('id, user_id, service_id, promotion_package_id, link, quantity, status, smmgen_order_id, smmcost_order_id, jbsmmpanel_order_id, worldofsmm_order_id, g1618_order_id, created_at, completed_at, refund_status, total_cost, last_status_check, is_reward, promotion_packages(name, platform, service_type), services(id, name, smmgen_service_id, smmcost_service_id, jbsmmpanel_service_id, worldofsmm_service_id, g1618_service_id)')
          .eq('user_id', authUser.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('services')
          .select('id, name, description, rate, platform, min_quantity, max_quantity, service_type')
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
      case 'refunded':
      case 'refunds':
        return <XCircle className="w-5 h-5 text-purple-600" />;
      case 'submission_failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'pending':
      default:
        return <Clock className="w-5 h-5 text-yellow-600" />;
    }
  };

  const getStatusColor = (status) => {
    const statusLower = String(status || '').toLowerCase();
    switch (statusLower) {
      case 'completed':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'canceled':
      case 'cancelled':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'processing':
      case 'in progress':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'partial':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'refunded':
      case 'refunds':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'submission_failed':
        return 'bg-red-50 text-red-600 border-red-100';
      case 'pending':
      default:
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
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

  // Check and update a single order's status (for manual check button)
  const checkOrderStatus = useCallback(async (order) => {
    // Check if order has any valid panel order ID
    const isInternalUuid = order.smmgen_order_id === order.id;
    const hasSmmgenId = order.smmgen_order_id &&
      order.smmgen_order_id !== "order not placed at smm gen" &&
      !isInternalUuid;
    const hasSmmcostId = order.smmcost_order_id && String(order.smmcost_order_id).toLowerCase() !== "order not placed at smmcost";
    const hasJbsmmpanelId = order.jbsmmpanel_order_id && order.jbsmmpanel_order_id > 0;
    const hasWorldofsmmId = order.worldofsmm_order_id && order.worldofsmm_order_id !== "order not placed at worldofsmm";
    const hasG1618Id = order.g1618_order_id && order.g1618_order_id !== "order not placed at g1618";

    if (!hasSmmgenId && !hasSmmcostId && !hasJbsmmpanelId && !hasWorldofsmmId && !hasG1618Id) {
      console.log(`Skipping status check for order ${order.id} - no valid panel order ID`);
      return;
    }

    if (order.status === 'refunded') {
      console.log(`Skipping status check for order ${order.id} - order is refunded`);
      return;
    }

    const orderId = hasG1618Id ? order.g1618_order_id : (hasWorldofsmmId ? order.worldofsmm_order_id : (hasSmmcostId ? order.smmcost_order_id : (hasJbsmmpanelId ? order.jbsmmpanel_order_id : order.smmgen_order_id)));
    console.log(`Manually checking status for order ${order.id} with panel order ID: ${orderId}`);
    setCheckingStatus(prev => ({ ...prev, [order.id]: true }));

    try {
      // Use the batch utility for single order (it handles everything)
      const result = await checkOrdersStatusBatch([order], {
        concurrency: 1,
        minIntervalMinutes: 0, // Force check even if recently checked
        onStatusUpdate: (orderId, newStatus, oldStatus) => {
          // Refresh the order from database to get latest data
          supabase
            .from('orders')
            .select('*')
            .eq('id', orderId)
            .single()
            .then(({ data: updatedOrder }) => {
              if (updatedOrder) {
                setOrders(prevOrders =>
                  prevOrders.map(o =>
                    o.id === orderId ? { ...o, ...updatedOrder } : o
                  )
                );
              }
            });
        }
      });

      if (result.errors.length > 0) {
        console.error(`Error checking order ${order.id}:`, result.errors[0].error);
      }
    } catch (error) {
      console.error(`Error checking order status for order ${order.id}:`, {
        error: error.message,
        orderId: order.id,
        smmgenOrderId: order.smmgen_order_id
      });
    } finally {
      setCheckingStatus(prev => ({ ...prev, [order.id]: false }));
    }
  }, []);

  const handleRetry = useCallback(async (order) => {
    if (checkingStatus[order.id]) return;

    setCheckingStatus(prev => ({ ...prev, [order.id]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Please log in again to retry your order.');
      }

      const response = await fetch('/api/order/retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ order_id: order.id })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || result.error || 'Failed to retry order');
      }

      // Success
      const { toast } = await import('sonner');
      toast.success(result.message || 'Order successfully retried!');

      // Refresh orders
      fetchData();
    } catch (error) {
      console.error('Retry error:', error);
      const { toast } = await import('sonner');
      toast.error(error.message || 'An error occurred during retry.');
    } finally {
      setCheckingStatus(prev => ({ ...prev, [order.id]: false }));
    }
  }, [fetchData]);

  // Auto-check status for orders with SMMGen IDs on load (only once)
  useEffect(() => {
    if (!loading && orders.length > 0 && !hasCheckedStatus.current) {
      hasCheckedStatus.current = true;
      const checkAllSMMGenOrders = async () => {
        // Use batch utility for parallel checking with filtering
        const result = await checkOrdersStatusBatch(orders, {
          concurrency: 5,
          minIntervalMinutes: 5,
          onStatusUpdate: (orderId, newStatus, oldStatus) => {
            // Refresh orders from database to get latest data
            fetchData();
          }
        });

        if (result.updated > 0) {
          // Refresh orders if any were updated
          fetchData();
        }
      };

      checkAllSMMGenOrders();
    }
  }, [loading, orders.length]);

  // Periodic status checking for orders (every 5 minutes)
  useEffect(() => {
    if (loading) return;

    const interval = setInterval(() => {
      console.log('Periodic order status check in OrderHistory...');
      // Fetch fresh orders and check their status
      fetchData().then(() => {
        // After fetchData completes, orders state will be updated
        // We'll check statuses in the next render cycle
        setTimeout(async () => {
          // Get fresh orders from state (will be updated after fetchData)
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (!authUser) return;

          const { data: currentOrders } = await supabase
            .from('orders')
            .select('id, user_id, service_id, promotion_package_id, link, quantity, status, smmgen_order_id, smmcost_order_id, jbsmmpanel_order_id, worldofsmm_order_id, g1618_order_id, created_at, completed_at, refund_status, total_cost, last_status_check, promotion_packages(name, platform, service_type), services(id, name, smmgen_service_id, smmcost_service_id, jbsmmpanel_service_id, worldofsmm_service_id, g1618_service_id)')
            .eq('user_id', authUser.id)
            .order('created_at', { ascending: false });

          if (currentOrders && currentOrders.length > 0) {
            const result = await checkOrdersStatusBatch(currentOrders, {
              concurrency: 5,
              minIntervalMinutes: 5,
              onStatusUpdate: (orderId, newStatus, oldStatus) => {
                // Status update handled by utility
              }
            });

            if (result.updated > 0) {
              // Refresh orders if any were updated
              fetchData();
            }
          }
        }, 500);
      });
    }, 300000); // Check every 5 minutes (increased from 2 minutes)

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
    <div className="min-h-screen bg-gray-50">
      <SEO
        title="Order History"
        description="View and manage your BoostUp GH orders"
        canonical="/orders"
        noindex={true}
      />
      <Navbar user={user} onLogout={onLogout} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 md:pt-6 pb-6 sm:pb-8">
        <div className="mb-6 sm:mb-8 animate-fadeIn">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">Order History</h1>
          <p className="text-sm sm:text-base text-gray-600">Track all your orders and their status</p>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-indigo-600 mx-auto"></div>
            <p className="text-sm text-gray-600 mt-4">Loading orders...</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm animate-slideUp">
            {/* Search and Filter Section */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                <Input
                  placeholder="Search by service, link, or order ID..."
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  className="pl-10 h-11 rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
                <SelectTrigger className="w-full sm:w-48 h-11 rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
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
                  <SelectItem value="submission_failed">Placement Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-600 text-base sm:text-lg mb-2">
                  {orders.length === 0 ? 'No orders yet' : 'No orders match your filters'}
                </p>
                <p className="text-gray-500 text-sm">
                  {orders.length === 0 ? 'Your order history will appear here' : 'Try adjusting your search or filters'}
                </p>
              </div>
            ) : (
              <>
                {/* Orders Table */}
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <div className="min-w-[1100px]">
                    {/* Fixed Header */}
                    <div className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                      <div className="grid grid-cols-[2fr_1fr_1.5fr_1fr_1fr_1.5fr_1.5fr_1fr] gap-4 p-4 font-semibold text-xs sm:text-sm text-gray-700">
                        <div className="text-center">Service</div>
                        <div className="text-center">Order No</div>
                        <div className="text-center">Link</div>
                        <div className="text-center">Quantity</div>
                        <div className="text-center">Cost</div>
                        <div className="text-center">Status</div>
                        <div className="text-center">Date</div>
                        <div className="text-center">Actions</div>
                      </div>
                    </div>

                    {/* Orders List */}
                    <div className="divide-y divide-gray-200">
                      {paginatedOrders.map((order) => {
                        const service = services.find(s => s.id === order.service_id);
                        const isPackageOrder = !!order.promotion_package_id;
                        const serviceName = isPackageOrder
                          ? order.promotion_packages?.name || 'Package'
                          : service?.name || 'Unknown Service';

                        return (
                          <div
                            key={order.id}
                            data-testid={`order-item-${order.id}`}
                            className="bg-white hover:bg-gray-50 transition-colors"
                          >
                            <div className="grid grid-cols-[2fr_1fr_1.5fr_1fr_1fr_1.5fr_1.5fr_1fr] gap-4 p-4 items-center">
                              {/* Service */}
                              <div className="text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <p className="font-medium text-gray-900 text-sm">{serviceName}</p>
                                  {isPackageOrder && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                                      <Tag className="w-3 h-3" />
                                    </span>
                                  )}
                                  {order.is_reward && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                                      <Gift className="w-3 h-3" />
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">ID: {order.id.slice(0, 8)}...</p>
                              </div>
                              {/* Order No */}
                              <div className="text-center">
                                {(() => {
                                  // Get service info (from order.services or from services array)
                                  const orderService = order.services || service;
                                  const serviceHasSmmcost = orderService?.smmcost_service_id && orderService.smmcost_service_id > 0;
                                  const serviceHasSmmgen = orderService?.smmgen_service_id;
                                  const serviceHasJbsmmpanel = orderService?.jbsmmpanel_service_id && orderService.jbsmmpanel_service_id > 0;
                                  const serviceHasWorldofsmm = orderService?.worldofsmm_service_id;
                                  const serviceHasG1618 = orderService?.g1618_service_id;

                                  // Prioritize: G1618 > World of SMM > SMMCost > JB SMM Panel > SMMGen
                                  // Check if smmgen_order_id is the internal UUID (set by trigger) - if so, ignore it
                                  const isInternalUuid = order.smmgen_order_id === order.id;
                                  const hasG1618 = order.g1618_order_id && order.g1618_order_id !== "order not placed at g1618";
                                  const hasSmmcost = order.smmcost_order_id && String(order.smmcost_order_id).toLowerCase() !== "order not placed at smmcost";
                                  const hasJbsmmpanel = order.jbsmmpanel_order_id && order.jbsmmpanel_order_id > 0; // JB SMM Panel uses numeric IDs
                                  const hasSmmgen = order.smmgen_order_id &&
                                    order.smmgen_order_id !== "order not placed at smm gen" &&
                                    !isInternalUuid; // Ignore if it's just the internal UUID
                                  const hasWorldofsmm = order.worldofsmm_order_id && order.worldofsmm_order_id !== "order not placed at worldofsmm";

                                  if (hasG1618) {
                                    // G1618 order ID exists and is valid
                                    return <p className="font-medium text-gray-900 text-sm">{order.g1618_order_id}</p>;
                                  } else if (hasWorldofsmm) {
                                    // World of SMM order ID exists and is valid
                                    return <p className="font-medium text-gray-900 text-sm">{order.worldofsmm_order_id}</p>;
                                  } else if (hasSmmcost) {

                                    // SMMCost order ID exists and is valid
                                    return <p className="font-medium text-gray-900 text-sm">{order.smmcost_order_id}</p>;
                                  } else if (hasJbsmmpanel) {
                                    // JB SMM Panel order ID exists and is valid
                                    return <p className="font-medium text-gray-900 text-sm">{order.jbsmmpanel_order_id}</p>;
                                  } else if (hasSmmgen) {
                                    // SMMGen order ID exists and is valid (and not the internal UUID)
                                    return <p className="font-medium text-gray-900 text-sm">{order.smmgen_order_id}</p>;
                                  } else if (order.smmcost_order_id === "order not placed at smmcost" || String(order.smmcost_order_id || '').toLowerCase() === "order not placed at smmcost") {
                                    // Order failed at SMMCost
                                    return <p className="text-xs text-red-600 italic font-medium">Order not placed</p>;
                                  } else if (order.smmgen_order_id === "order not placed at smm gen") {
                                    return <p className="text-xs text-red-600 italic font-medium">Order not placed</p>;
                                  } else if (order.worldofsmm_order_id === "order not placed at worldofsmm") {
                                    // Order failed at World of SMM
                                    return <p className="text-xs text-red-600 italic font-medium">Order not placed</p>;
                                  } else if (order.g1618_order_id === "order not placed at g1618") {
                                    // Order failed at G1618
                                    return <p className="text-xs text-red-600 italic font-medium">Order not placed</p>;
                                  } else if (serviceHasG1618 && !hasG1618) {
                                    // Service has G1618 ID but order doesn't - order failed at G1618
                                    return <p className="text-xs text-red-600 italic font-medium">Order not placed</p>;
                                  } else if (serviceHasWorldofsmm && !hasWorldofsmm) {
                                    // Service has World of SMM ID but order doesn't - order failed at World of SMM
                                    return <p className="text-xs text-red-600 italic font-medium">Order not placed</p>;
                                  } else if (serviceHasJbsmmpanel && !hasJbsmmpanel) {
                                    // Service has JB SMM Panel ID but order doesn't - order failed at JB SMM Panel
                                    return <p className="text-xs text-red-600 italic font-medium">Order not placed</p>;
                                  } else if (serviceHasSmmcost && !hasSmmcost) {
                                    // Service has SMMCost ID but order doesn't - order failed at SMMCost
                                    return <p className="text-xs text-red-600 italic font-medium">Order not placed</p>;
                                  } else if (order.smmcost_order_id === null && order.smmgen_order_id === null && order.jbsmmpanel_order_id === null && order.worldofsmm_order_id === null && order.g1618_order_id === null) {
                                    // No order IDs at all (shouldn't happen, but handle gracefully)
                                    return <p className="text-xs text-gray-400 italic">N/A</p>;
                                  } else {
                                    // Fallback - shouldn't reach here
                                    return <p className="text-xs text-red-600 italic font-medium">Order not placed</p>;
                                  }
                                })()}
                              </div>
                              {/* Link */}
                              <div className="text-center">
                                <p className="text-xs sm:text-sm text-gray-700 break-all line-clamp-2" title={order.link}>
                                  {order.link}
                                </p>
                              </div>
                              {/* Quantity */}
                              <div className="text-center">
                                <p className="font-semibold text-gray-900 text-sm">{order.quantity.toLocaleString()}</p>
                              </div>
                              {/* Cost */}
                              <div className="text-center">
                                <p className="font-semibold text-gray-900 text-sm">₵{(order.total_cost || 0).toFixed(2)}</p>
                              </div>
                              {/* Status */}
                              <div className="flex justify-center">
                                <div className="flex items-center gap-1.5">
                                  {getStatusIcon(order.status)}
                                  <span className={`text-xs px-2.5 py-1 rounded border font-medium whitespace-nowrap ${getStatusColor(order.status)}`}>
                                    {order.status}
                                  </span>
                                </div>
                              </div>
                              {/* Date */}
                              <div className="text-center">
                                <p className="text-xs sm:text-sm text-gray-700">{new Date(order.created_at).toLocaleDateString()}</p>
                                <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                              </div>
                              {/* Actions */}
                              <div className="flex justify-center">
                                {(() => {
                                  // Show check button if order has valid SMMCost, JB SMM Panel, or SMMGen ID
                                  const hasSmmcost = order.smmcost_order_id && order.smmcost_order_id !== "order not placed at smmcost";
                                  const hasJbsmmpanel = order.jbsmmpanel_order_id && order.jbsmmpanel_order_id > 0;
                                  const hasSmmgen = order.smmgen_order_id && order.smmgen_order_id !== "order not placed at smm gen";
                                  const hasWorldofsmm = order.worldofsmm_order_id && order.worldofsmm_order_id !== "order not placed at worldofsmm";
                                  const hasG1618 = order.g1618_order_id && order.g1618_order_id !== "order not placed at g1618";

                                  if (hasSmmcost || hasJbsmmpanel || hasSmmgen || hasWorldofsmm || hasG1618) {
                                    return (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => checkOrderStatus(order)}
                                        disabled={checkingStatus[order.id]}
                                        className="text-xs h-8 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
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
                                    );
                                  }

                                  if (order.status === 'submission_failed') {
                                    return (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleRetry(order)}
                                        disabled={checkingStatus[order.id]}
                                        className="text-xs h-8 px-3 border-red-200 text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                                      >
                                        {checkingStatus[order.id] ? (
                                          <>
                                            <Loader className="w-3 h-3 mr-1 animate-spin" />
                                            Retrying...
                                          </>
                                        ) : (
                                          <>
                                            <RefreshCw className="w-3 h-3 mr-1" />
                                            Retry
                                          </>
                                        )}
                                      </Button>
                                    );
                                  }
                                  return null;
                                })()}
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
                    <p className="text-xs sm:text-sm text-gray-600">
                      Showing {startOrderIndex + 1} to {Math.min(endOrderIndex, filteredOrders.length)} of {filteredOrders.length} orders
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setOrdersPage(prev => Math.max(1, prev - 1))}
                        disabled={ordersPage === 1}
                        className="h-9 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
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
                              className={`w-9 h-9 p-0 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${ordersPage === pageNum ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : ''
                                }`}
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
                        className="h-9 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
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
