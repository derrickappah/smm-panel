import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { getSMMGenOrderStatus } from '@/lib/smmgen';
import { saveOrderStatusHistory } from '@/lib/orderStatusHistory';
import { checkOrdersStatusBatch, shouldCheckOrder } from '@/lib/orderStatusCheck';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  Loader, 
  RefreshCw, 
  Search, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  Tag, 
  Gift, 
  Layers, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle,
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import SEO from '@/components/SEO';
import PlatformIcon from '@/components/PlatformIcon';
import { toast } from 'sonner';

const OrderHistory = ({ user, onLogout }) => {
  const [orders, setOrders] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingStatus, setCheckingStatus] = useState({});
  const [expandedOrders, setExpandedOrders] = useState({});
  const hasCheckedStatus = useRef(false);

  // Search and filter states
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [ordersPage, setOrdersPage] = useState(1);
  const ordersPerPage = 20;

  const toggleOrderExpand = (orderId) => {
    setExpandedOrders(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }));
  };

  const fetchData = useCallback(async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      // Query both regular orders and combo builder parent orders
      const [ordersRes, comboOrdersRes, servicesRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, user_id, service_id, promotion_package_id, link, quantity, status, smmgen_order_id, smmcost_order_id, jbsmmpanel_order_id, worldofsmm_order_id, g1618_order_id, oldsmm_order_id, apiowner_order_id, component_provider_order_ids, created_at, completed_at, refund_status, total_cost, last_status_check, is_reward, promotion_packages(name, platform, service_type, is_combo), services(id, name, platform, smmgen_service_id, smmcost_service_id, jbsmmpanel_service_id, worldofsmm_service_id, g1618_service_id, oldsmm_service_id, apiowner_service_id, is_combo)')
          .eq('user_id', authUser.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('combo_parent_orders')
          .select('*, combo_child_orders(*), combo_services(name, category)')
          .eq('user_id', authUser.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('services')
          .select('id, name, description, rate, platform, min_quantity, max_quantity, service_type, is_combo')
      ]);

      if (ordersRes.error) throw ordersRes.error;
      // Note: If combo_parent_orders table query returns error (e.g. empty or schema), fallback gracefully
      const rawComboOrders = comboOrdersRes?.data || [];
      const rawRegularOrders = ordersRes.data || [];

      // Normalize regular orders
      const normalizedRegularOrders = rawRegularOrders.map(order => {
        const hasComponents = Array.isArray(order.component_provider_order_ids) && order.component_provider_order_ids.length > 1;
        const isCombo = !!(order.services?.is_combo || order.promotion_packages?.is_combo || hasComponents);

        return {
          ...order,
          is_combo: isCombo,
          is_builder_combo: false,
          child_orders: hasComponents ? order.component_provider_order_ids : []
        };
      });

      // Normalize combo builder orders
      const normalizedComboOrders = rawComboOrders.map(cOrder => ({
        id: cOrder.id,
        user_id: cOrder.user_id,
        order_number: cOrder.order_number,
        link: cOrder.link,
        quantity: cOrder.quantity || 1,
        total_cost: parseFloat(cOrder.selling_price || 0),
        status: cOrder.status || 'pending',
        created_at: cOrder.created_at,
        is_combo: true,
        is_builder_combo: true,
        child_orders: cOrder.combo_child_orders || [],
        services: {
          name: cOrder.combo_service_name,
          platform: cOrder.combo_services?.category || 'Combo',
          service_type: 'Combo Package'
        }
      }));

      // Combine & sort chronologically descending
      const allOrders = [...normalizedRegularOrders, ...normalizedComboOrders].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setOrders(allOrders);
      setServices(servicesRes.data || []);
    } catch (error) {
      console.error('Error fetching orders data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getStatusIcon = (status) => {
    const statusLower = String(status || '').toLowerCase();
    switch (statusLower) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'canceled':
      case 'cancelled':
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'processing':
      case 'in progress':
        return <Loader className="w-4 h-4 text-blue-600 animate-spin" />;
      case 'partial':
        return <Loader className="w-4 h-4 text-orange-600 animate-spin" />;
      case 'refunded':
      case 'refunds':
        return <XCircle className="w-4 h-4 text-purple-600" />;
      case 'submission_failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'pending':
      default:
        return <Clock className="w-4 h-4 text-yellow-600" />;
    }
  };

  const getStatusColor = (status) => {
    const statusLower = String(status || '').toLowerCase();
    switch (statusLower) {
      case 'completed':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'canceled':
      case 'cancelled':
      case 'failed':
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

  // Check and update order status (supports both single & combo orders)
  const checkOrderStatus = useCallback(async (order) => {
    if (checkingStatus[order.id]) return;

    setCheckingStatus(prev => ({ ...prev, [order.id]: true }));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      // Handle Combo Orders (Builder or Legacy/Package)
      if (order.is_builder_combo || (order.is_combo && order.child_orders && order.child_orders.length > 0)) {
        console.log(`Checking live status for combo order ${order.id}...`);

        const res = await fetch('/api/order/check-combo-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token || ''}`
          },
          body: JSON.stringify({ parent_order_id: order.id, order_id: order.id })
        });

        const resData = await res.json();
        if (resData.success) {
          const updatedChilds = resData.child_orders || [];
          const updatedParentStatus = resData.order?.status || order.status;

          setOrders(prevOrders =>
            prevOrders.map(o => {
              if (o.id === order.id) {
                return {
                  ...o,
                  status: updatedParentStatus,
                  child_orders: updatedChilds.length > 0 ? updatedChilds : o.child_orders,
                  ...(order.is_builder_combo ? {} : { component_provider_order_ids: updatedChilds })
                };
              }
              return o;
            })
          );

          toast.success(`Combo order updated: status is ${updatedParentStatus}`);
        } else {
          toast.error(resData.error || 'Failed to check combo order status');
        }

        return;
      }

      // Handle Single Regular Orders
      const isInternalUuid = order.smmgen_order_id === order.id;
      const hasSmmgenId = order.smmgen_order_id &&
        order.smmgen_order_id !== "order not placed at smm gen" &&
        !isInternalUuid;
      const hasSmmcostId = order.smmcost_order_id && String(order.smmcost_order_id).toLowerCase() !== "order not placed at smmcost";
      const hasJbsmmpanelId = order.jbsmmpanel_order_id && order.jbsmmpanel_order_id > 0;
      const hasWorldofsmmId = order.worldofsmm_order_id && order.worldofsmm_order_id !== "order not placed at worldofsmm";
      const hasG1618Id = order.g1618_order_id && order.g1618_order_id !== "order not placed at g1618";
      const hasOldSmmId = order.oldsmm_order_id && order.oldsmm_order_id !== "order not placed at oldsmm";
      const hasApiOwnerId = order.apiowner_order_id && order.apiowner_order_id !== "order not placed at apiowner";

      if (!hasSmmgenId && !hasSmmcostId && !hasJbsmmpanelId && !hasWorldofsmmId && !hasG1618Id && !hasOldSmmId && !hasApiOwnerId) {
        toast.info('No external provider tracking ID found for this order.');
        return;
      }

      const result = await checkOrdersStatusBatch([order], {
        concurrency: 1,
        minIntervalMinutes: 0,
        onStatusUpdate: (orderId, newStatus) => {
          setOrders(prevOrders =>
            prevOrders.map(o => o.id === orderId ? { ...o, status: newStatus } : o)
          );
        }
      });

      if (result.errors.length > 0) {
        toast.error(`Error checking order: ${result.errors[0].error}`);
      } else {
        toast.success(`Order status checked: ${result.newStatus || order.status}`);
      }

    } catch (error) {
      console.error(`Error checking status for order ${order.id}:`, error);
      toast.error(error.message || 'An error occurred while checking order status');
    } finally {
      setCheckingStatus(prev => ({ ...prev, [order.id]: false }));
    }
  }, [checkingStatus]);

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

      toast.success(result.message || 'Order successfully retried!');
      fetchData();
    } catch (error) {
      console.error('Retry error:', error);
      toast.error(error.message || 'An error occurred during retry.');
    } finally {
      setCheckingStatus(prev => ({ ...prev, [order.id]: false }));
    }
  }, [checkingStatus, fetchData]);

  // Periodic status checking for orders (every 5 minutes)
  useEffect(() => {
    if (loading) return;

    const interval = setInterval(() => {
      fetchData();
    }, 300000);

    return () => clearInterval(interval);
  }, [loading, fetchData]);

  // Filter orders based on search and status
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const searchLower = orderSearch.toLowerCase();
      const service = services.find(s => s.id === o.service_id) || o.services;
      const serviceName = service?.name || o.combo_service_name || '';
      
      const childNamesMatch = Array.isArray(o.child_orders) && o.child_orders.some(c => 
        (c.service_type || c.provider || '').toLowerCase().includes(searchLower)
      );

      const matchesSearch =
        !orderSearch ||
        serviceName.toLowerCase().includes(searchLower) ||
        (o.link && o.link.toLowerCase().includes(searchLower)) ||
        o.id.toLowerCase().includes(searchLower) ||
        (o.order_number && String(o.order_number).includes(searchLower)) ||
        childNamesMatch;

      const matchesStatus = orderStatusFilter === 'all' || o.status === orderStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [orders, services, orderSearch, orderStatusFilter]);

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
          <p className="text-sm sm:text-base text-gray-600">Track all your single and combo orders with detailed sub-order statuses</p>
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
                  placeholder="Search by service, combo item, link, or order ID..."
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
                    {/* Header */}
                    <div className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                      <div className="grid grid-cols-[2fr_1fr_1.5fr_1fr_1fr_1.5fr_1.5fr_1fr] gap-4 p-4 font-semibold text-xs sm:text-sm text-gray-700">
                        <div className="text-center">Service</div>
                        <div className="text-center">Order No</div>
                        <div className="text-center">Link</div>
                        <div className="text-center">Quantity</div>
                        <div className="text-center">Cost</div>
                        <div className="text-center">Overall Status</div>
                        <div className="text-center">Date</div>
                        <div className="text-center">Actions</div>
                      </div>
                    </div>

                    {/* Orders List */}
                    <div className="divide-y divide-gray-200">
                      {paginatedOrders.map((order) => {
                        const service = services.find(s => s.id === order.service_id) || order.services;
                        const isPackageOrder = !!order.promotion_package_id;
                        const isCombo = order.is_combo || (order.child_orders && order.child_orders.length > 0);
                        const childOrders = order.child_orders || [];
                        const isExpanded = !!expandedOrders[order.id];

                        const serviceName = order.is_builder_combo
                          ? order.combo_service_name || order.services?.name || 'Combo Service'
                          : isPackageOrder
                            ? order.promotion_packages?.name || 'Package'
                            : service?.name || 'Unknown Service';

                        const completedChildCount = childOrders.filter(c => 
                          String(c.status || '').toLowerCase() === 'completed'
                        ).length;

                        return (
                          <div
                            key={order.id}
                            data-testid={`order-item-${order.id}`}
                            className={`bg-white transition-colors ${isExpanded ? 'bg-indigo-50/20' : 'hover:bg-gray-50'}`}
                          >
                            {/* Main Order Row */}
                            <div className="grid grid-cols-[2fr_1fr_1.5fr_1fr_1fr_1.5fr_1.5fr_1fr] gap-4 p-4 items-center">
                              {/* Service Name & Combo Badges */}
                              <div className="text-center flex flex-col items-center">
                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                  <PlatformIcon 
                                    platform={order.services?.platform || order.promotion_packages?.platform} 
                                    serviceName={serviceName} 
                                    className="w-4 h-4 object-contain shrink-0" 
                                  />
                                  <p className="font-medium text-gray-900 text-sm">{serviceName}</p>
                                  
                                  {isCombo && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[11px] font-semibold rounded border border-indigo-200">
                                      <Layers className="w-3 h-3" />
                                      Combo ({childOrders.length || 'Bundle'})
                                    </span>
                                  )}

                                  {isPackageOrder && !isCombo && (
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

                                {/* Expand Accordion Button for Combo */}
                                {isCombo && childOrders.length > 0 && (
                                  <button
                                    onClick={() => toggleOrderExpand(order.id)}
                                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-full transition-colors"
                                  >
                                    <span>{isExpanded ? 'Hide' : 'View'} {childOrders.length} Sub-Orders</span>
                                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                  </button>
                                )}

                                <p className="text-[11px] text-gray-400 mt-0.5 font-mono">
                                  ID: {order.id.slice(0, 8)}...
                                </p>
                              </div>

                              {/* Order Number */}
                              <div className="text-center">
                                {order.order_number ? (
                                  <span className="font-semibold font-mono text-gray-800 text-xs bg-gray-100 px-2 py-1 rounded">
                                    #{order.order_number}
                                  </span>
                                ) : (
                                  (() => {
                                    const hasApiowner = order.apiowner_order_id && String(order.apiowner_order_id).toLowerCase() !== "order not placed at apiowner";
                                    const hasOldsmm = order.oldsmm_order_id && order.oldsmm_order_id !== "order not placed at oldsmm";
                                    const hasG1618 = order.g1618_order_id && order.g1618_order_id !== "order not placed at g1618";
                                    const hasSmmcost = order.smmcost_order_id && String(order.smmcost_order_id).toLowerCase() !== "order not placed at smmcost";
                                    const hasJbsmmpanel = order.jbsmmpanel_order_id && order.jbsmmpanel_order_id > 0;
                                    const hasSmmgen = order.smmgen_order_id && order.smmgen_order_id !== "order not placed at smm gen" && order.smmgen_order_id !== order.id;
                                    const hasWorldofsmm = order.worldofsmm_order_id && order.worldofsmm_order_id !== "order not placed at worldofsmm";

                                    if (hasApiowner) return <p className="font-medium text-gray-900 text-sm">{order.apiowner_order_id}</p>;
                                    if (hasOldsmm) return <p className="font-medium text-gray-900 text-sm">{order.oldsmm_order_id}</p>;
                                    if (hasG1618) return <p className="font-medium text-gray-900 text-sm">{order.g1618_order_id}</p>;
                                    if (hasWorldofsmm) return <p className="font-medium text-gray-900 text-sm">{order.worldofsmm_order_id}</p>;
                                    if (hasSmmcost) return <p className="font-medium text-gray-900 text-sm">{order.smmcost_order_id}</p>;
                                    if (hasJbsmmpanel) return <p className="font-medium text-gray-900 text-sm">{order.jbsmmpanel_order_id}</p>;
                                    if (hasSmmgen) return <p className="font-medium text-gray-900 text-sm">{order.smmgen_order_id}</p>;
                                    
                                    if (isCombo) return <span className="text-xs text-indigo-600 font-medium font-mono">Bundle</span>;
                                    return <p className="text-xs text-gray-400 italic">N/A</p>;
                                  })()
                                )}
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

                              {/* Overall Status */}
                              <div className="flex justify-center">
                                <div className="flex items-center gap-1.5">
                                  {getStatusIcon(order.status)}
                                  <span className={`text-xs px-2.5 py-1 rounded border font-medium capitalize whitespace-nowrap ${getStatusColor(order.status)}`}>
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
                                {order.status === 'submission_failed' ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleRetry(order)}
                                    disabled={checkingStatus[order.id]}
                                    className="text-xs h-8 px-3 border-red-200 text-red-600 hover:bg-red-50"
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
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => checkOrderStatus(order)}
                                    disabled={checkingStatus[order.id]}
                                    className="text-xs h-8 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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

                            {/* Sub-Orders Breakdown Accordion */}
                            {isCombo && childOrders.length > 0 && isExpanded && (
                              <div className="border-t border-indigo-100 bg-gradient-to-b from-indigo-50/40 to-white px-6 py-4 animate-fadeIn">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
                                  <div className="flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-indigo-600" />
                                    <h4 className="text-xs sm:text-sm font-bold text-gray-900 uppercase tracking-wide">
                                      Combo Sub-Orders Status Breakdown
                                    </h4>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-600 font-medium">
                                      Progress: <span className="font-bold text-indigo-700">{completedChildCount} of {childOrders.length}</span> Delivered
                                    </span>
                                    <div className="w-20 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                      <div 
                                        className="bg-green-600 h-1.5 rounded-full transition-all duration-500"
                                        style={{ width: `${(completedChildCount / childOrders.length) * 100}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {childOrders.map((child, idx) => {
                                    const childStatus = child.status || 'pending';
                                    const childName = child.service_type || child.service_name || `Sub-Service #${idx + 1}`;
                                    const childQty = child.fixed_quantity || child.quantity || (order.quantity / childOrders.length) || order.quantity;

                                    return (
                                      <div
                                        key={child.id || idx}
                                        className="bg-white border border-gray-200/90 rounded-lg p-3 shadow-xs hover:border-indigo-200 transition-colors flex items-center justify-between gap-2"
                                      >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                          <div className="w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-xs shrink-0">
                                            {idx + 1}
                                          </div>
                                          <div className="min-w-0">
                                            <p className="text-xs font-semibold text-gray-900 truncate">
                                              {childName}
                                            </p>
                                            <p className="text-[11px] text-gray-500">
                                              Quantity: <span className="font-medium text-gray-700">+{Number(childQty).toLocaleString()}</span>
                                            </p>
                                          </div>
                                        </div>

                                        <div className="shrink-0 flex items-center gap-1.5">
                                          <span className={`text-[11px] px-2 py-0.5 rounded border font-medium capitalize whitespace-nowrap flex items-center gap-1 ${getStatusColor(childStatus)}`}>
                                            {getStatusIcon(childStatus)}
                                            {childStatus}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
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
                        className="h-9 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
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
                              variant={ordersPage === pageNum ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setOrdersPage(pageNum)}
                              className={`h-9 w-9 p-0 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                                ordersPage === pageNum
                                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                  : 'text-gray-700 hover:bg-gray-100'
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
                        className="h-9 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
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
