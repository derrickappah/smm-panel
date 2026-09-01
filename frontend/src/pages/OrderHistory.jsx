import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { checkOrdersStatusBatch } from '@/lib/orderStatusCheck';
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
  Layers
} from 'lucide-react';
import SEO from '@/components/SEO';
import PlatformIcon from '@/components/PlatformIcon';
import { toast } from 'sonner';

const OrderHistory = ({ user, onLogout }) => {
  const [orders, setOrders] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingStatus, setCheckingStatus] = useState({});

  // Search and filter states
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [ordersPage, setOrdersPage] = useState(1);
  const ordersPerPage = 20;

  const fetchData = useCallback(async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      // Query regular orders and combo builder orders
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

      const rawComboOrders = comboOrdersRes?.data || [];
      const rawRegularOrders = ordersRes.data || [];
      const flattenedOrders = [];

      // 1. Process regular orders from public.orders
      rawRegularOrders.forEach(order => {
        const components = order.component_provider_order_ids;
        const serviceName = order.promotion_packages?.name || order.services?.name || 'Service';
        const platform = order.promotion_packages?.platform || order.services?.platform || '';

        if (Array.isArray(components) && components.length > 1) {
          // Flatten combo/package into individual order rows
          components.forEach((comp, idx) => {
            flattenedOrders.push({
              id: `${order.id}-comp-${idx}`,
              parent_order_id: order.id,
              raw_order_id: order.id,
              service_id: order.service_id,
              promotion_package_id: order.promotion_package_id,
              service_name: comp.service_name 
                ? `${serviceName} • ${comp.service_name}` 
                : comp.service_type 
                  ? `${serviceName} • ${comp.service_type}` 
                  : `${serviceName} • ${comp.provider || `Item #${idx+1}`}`,
              platform: platform,
              order_number: comp.provider_order_id || 'Not placed',
              display_order_id: comp.provider_order_id || 'Not placed',
              link: order.link,
              quantity: comp.quantity || comp.fixed_quantity || Math.round(order.quantity / components.length),
              total_cost: parseFloat(comp.cost || (order.total_cost / components.length || 0)),
              status: comp.status || order.status,
              created_at: order.created_at,
              provider: comp.provider,
              provider_order_id: comp.provider_order_id,
              is_combo_item: true,
              is_builder_combo: false,
              is_reward: order.is_reward,
              services: {
                name: comp.service_name ? `${serviceName} • ${comp.service_name}` : `${serviceName} • ${comp.provider || `Item #${idx+1}`}`,
                platform: platform
              }
            });
          });
        } else {
          // Regular single order
          const isInternalUuid = order.smmgen_order_id === order.id;
          const displayId = order.apiowner_order_id && !String(order.apiowner_order_id).toLowerCase().includes('not placed')
            ? order.apiowner_order_id
            : order.oldsmm_order_id && !String(order.oldsmm_order_id).toLowerCase().includes('not placed')
              ? order.oldsmm_order_id
              : order.g1618_order_id && !String(order.g1618_order_id).toLowerCase().includes('not placed')
                ? order.g1618_order_id
                : order.worldofsmm_order_id && !String(order.worldofsmm_order_id).toLowerCase().includes('not placed')
                  ? order.worldofsmm_order_id
                  : order.smmcost_order_id && !String(order.smmcost_order_id).toLowerCase().includes('not placed')
                    ? order.smmcost_order_id
                    : order.jbsmmpanel_order_id && order.jbsmmpanel_order_id > 0
                      ? order.jbsmmpanel_order_id
                      : order.smmgen_order_id && !isInternalUuid && !String(order.smmgen_order_id).toLowerCase().includes('not placed')
                        ? order.smmgen_order_id
                        : order.id.slice(0, 8);

          flattenedOrders.push({
            id: order.id,
            parent_order_id: null,
            raw_order_id: order.id,
            service_id: order.service_id,
            promotion_package_id: order.promotion_package_id,
            service_name: serviceName,
            platform: platform,
            order_number: displayId,
            display_order_id: displayId,
            link: order.link,
            quantity: order.quantity,
            total_cost: parseFloat(order.total_cost || 0),
            status: order.status,
            created_at: order.created_at,
            smmgen_order_id: order.smmgen_order_id,
            smmcost_order_id: order.smmcost_order_id,
            jbsmmpanel_order_id: order.jbsmmpanel_order_id,
            worldofsmm_order_id: order.worldofsmm_order_id,
            g1618_order_id: order.g1618_order_id,
            oldsmm_order_id: order.oldsmm_order_id,
            apiowner_order_id: order.apiowner_order_id,
            is_reward: order.is_reward,
            is_combo_item: false,
            is_builder_combo: false,
            services: order.services,
            promotion_packages: order.promotion_packages
          });
        }
      });

      // 2. Process combo builder orders from combo_parent_orders (flatten each sub-order)
      rawComboOrders.forEach(cOrder => {
        const childs = cOrder.combo_child_orders || [];
        const baseComboName = cOrder.combo_service_name || 'Combo Package';
        const platform = cOrder.combo_services?.category || 'Combo';

        if (Array.isArray(childs) && childs.length > 0) {
          childs.forEach((child, idx) => {
            const childDisplayId = child.provider_order_id || `#${cOrder.order_number || ''}` || child.id.slice(0, 8);

            flattenedOrders.push({
              id: child.id,
              parent_order_id: cOrder.id,
              raw_order_id: cOrder.id,
              service_name: `${baseComboName} • ${child.service_type || `Item #${idx+1}`}`,
              platform: platform,
              order_number: childDisplayId,
              display_order_id: childDisplayId,
              link: cOrder.link,
              quantity: child.fixed_quantity || cOrder.quantity,
              total_cost: parseFloat(child.cost || (cOrder.selling_price / childs.length || 0)),
              status: child.status || 'pending',
              created_at: child.created_at || cOrder.created_at,
              provider: child.provider,
              provider_order_id: child.provider_order_id,
              is_combo_item: true,
              is_builder_combo: true,
              services: {
                name: `${baseComboName} • ${child.service_type || `Item #${idx+1}`}`,
                platform: platform
              }
            });
          });
        } else {
          // Fallback if no child orders exist yet
          flattenedOrders.push({
            id: cOrder.id,
            parent_order_id: cOrder.id,
            raw_order_id: cOrder.id,
            service_name: baseComboName,
            platform: platform,
            order_number: `#${cOrder.order_number || cOrder.id.slice(0, 8)}`,
            display_order_id: `#${cOrder.order_number || cOrder.id.slice(0, 8)}`,
            link: cOrder.link,
            quantity: cOrder.quantity || 1,
            total_cost: parseFloat(cOrder.selling_price || 0),
            status: cOrder.status || 'pending',
            created_at: cOrder.created_at,
            is_combo_item: true,
            is_builder_combo: true,
            services: {
              name: baseComboName,
              platform: platform
            }
          });
        }
      });

      // Sort all individual orders chronologically descending
      flattenedOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setOrders(flattenedOrders);
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

  // Check and update order status for any order item
  const checkOrderStatus = useCallback(async (order) => {
    if (checkingStatus[order.id]) return;

    setCheckingStatus(prev => ({ ...prev, [order.id]: true }));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (order.parent_order_id || order.is_combo_item) {
        // Combo order status check
        const targetId = order.parent_order_id || order.raw_order_id || order.id;
        const res = await fetch('/api/order/check-combo-status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token || ''}`
          },
          body: JSON.stringify({ parent_order_id: targetId, order_id: targetId })
        });

        const resData = await res.json();
        if (resData.success) {
          toast.success('Order status refreshed!');
          fetchData();
        } else {
          toast.error(resData.error || 'Failed to check order status');
        }
        return;
      }

      // Single regular order
      const result = await checkOrdersStatusBatch([order], {
        concurrency: 1,
        minIntervalMinutes: 0
      });

      if (result.errors.length > 0) {
        toast.error(`Error checking order: ${result.errors[0].error}`);
      } else {
        toast.success(`Order status checked: ${result.newStatus || order.status}`);
        fetchData();
      }

    } catch (error) {
      console.error(`Error checking status for order ${order.id}:`, error);
      toast.error(error.message || 'An error occurred while checking order status');
    } finally {
      setCheckingStatus(prev => ({ ...prev, [order.id]: false }));
    }
  }, [checkingStatus, fetchData]);

  // Periodic status checking (every 5 minutes)
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
      const serviceName = o.service_name || o.services?.name || '';
      const orderIdStr = String(o.display_order_id || o.order_number || o.id);

      const matchesSearch =
        !orderSearch ||
        serviceName.toLowerCase().includes(searchLower) ||
        (o.link && o.link.toLowerCase().includes(searchLower)) ||
        orderIdStr.toLowerCase().includes(searchLower);

      const matchesStatus = orderStatusFilter === 'all' || o.status === orderStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [orders, orderSearch, orderStatusFilter]);

  // Pagination
  const totalOrdersPages = Math.ceil(filteredOrders.length / ordersPerPage);
  const startOrderIndex = (ordersPage - 1) * ordersPerPage;
  const endOrderIndex = startOrderIndex + ordersPerPage;
  const paginatedOrders = filteredOrders.slice(startOrderIndex, endOrderIndex);

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
          <p className="text-sm sm:text-base text-gray-600">Track all your orders and live delivery statuses</p>
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
                  placeholder="Search by service, Order ID, or link..."
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
                      <div className="grid grid-cols-[2fr_1.2fr_1.5fr_1fr_1fr_1.2fr_1.2fr_1fr] gap-4 p-4 font-semibold text-xs sm:text-sm text-gray-700">
                        <div className="text-center">Service</div>
                        <div className="text-center">Order ID</div>
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
                        const serviceName = order.service_name || order.services?.name || 'Service';

                        return (
                          <div
                            key={order.id}
                            data-testid={`order-item-${order.id}`}
                            className="bg-white hover:bg-gray-50 transition-colors"
                          >
                            <div className="grid grid-cols-[2fr_1.2fr_1.5fr_1fr_1fr_1.2fr_1.2fr_1fr] gap-4 p-4 items-center">
                              {/* Service Name & Badges */}
                              <div className="text-center flex flex-col items-center">
                                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                  <PlatformIcon 
                                    platform={order.platform || order.services?.platform} 
                                    serviceName={serviceName} 
                                    className="w-4 h-4 object-contain shrink-0" 
                                  />
                                  <p className="font-medium text-gray-900 text-sm">{serviceName}</p>
                                  
                                  {order.is_combo_item && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-semibold rounded border border-indigo-200">
                                      <Layers className="w-2.5 h-2.5" />
                                      Bundle Item
                                    </span>
                                  )}

                                  {order.is_reward && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                                      <Gift className="w-3 h-3" />
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Order ID */}
                              <div className="text-center">
                                <span className="font-mono font-semibold text-gray-900 text-xs sm:text-sm bg-gray-50 border border-gray-200 px-2 py-1 rounded">
                                  {order.display_order_id || order.order_number || 'N/A'}
                                </span>
                              </div>

                              {/* Link */}
                              <div className="text-center">
                                <p className="text-xs sm:text-sm text-gray-700 break-all line-clamp-2" title={order.link}>
                                  {order.link}
                                </p>
                              </div>

                              {/* Quantity */}
                              <div className="text-center">
                                <p className="font-semibold text-gray-900 text-sm">+{Number(order.quantity || 0).toLocaleString()}</p>
                              </div>

                              {/* Cost */}
                              <div className="text-center">
                                <p className="font-semibold text-gray-900 text-sm">₵{(order.total_cost || 0).toFixed(2)}</p>
                              </div>

                              {/* Status */}
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
