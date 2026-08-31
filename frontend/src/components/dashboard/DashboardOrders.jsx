import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tag, Gift, Layers, ChevronDown, ChevronUp, CheckCircle, Clock, XCircle, Loader } from 'lucide-react';
import PlatformIcon from '@/components/PlatformIcon';

const DashboardOrders = React.memo(({ orders, services }) => {
  const navigate = useNavigate();
  const [expandedOrders, setExpandedOrders] = useState({});

  const toggleExpand = (orderId, e) => {
    e.stopPropagation();
    setExpandedOrders(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }));
  };

  const getStatusStyles = useMemo(() => {
    return (status) => {
      const statusLower = String(status || '').toLowerCase();
      if (statusLower === 'completed') {
        return 'bg-green-100 text-green-700 border-green-200';
      } else if (statusLower === 'processing' || statusLower.includes('in progress')) {
        return 'bg-blue-100 text-blue-700 border-blue-200';
      } else if (statusLower === 'partial') {
        return 'bg-orange-100 text-orange-700 border-orange-200';
      } else if (statusLower === 'canceled' || statusLower === 'cancelled' || statusLower.includes('cancel') || statusLower === 'failed') {
        return 'bg-red-100 text-red-700 border-red-200';
      } else if (statusLower === 'refunds' || statusLower.includes('refund')) {
        return 'bg-purple-100 text-purple-700 border-purple-200';
      } else if (statusLower === 'submission_failed') {
        return 'bg-red-50 text-red-600 border-red-100';
      } else {
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      }
    };
  }, []);

  const getStatusIcon = (status) => {
    const statusLower = String(status || '').toLowerCase();
    switch (statusLower) {
      case 'completed':
        return <CheckCircle className="w-3 h-3 text-green-600" />;
      case 'canceled':
      case 'cancelled':
      case 'failed':
        return <XCircle className="w-3 h-3 text-red-600" />;
      case 'processing':
      case 'in progress':
        return <Loader className="w-3 h-3 text-blue-600 animate-spin" />;
      case 'partial':
        return <Loader className="w-3 h-3 text-orange-600 animate-spin" />;
      case 'refunded':
      case 'refunds':
        return <XCircle className="w-3 h-3 text-purple-600" />;
      case 'submission_failed':
        return <XCircle className="w-3 h-3 text-red-500" />;
      case 'pending':
      default:
        return <Clock className="w-3 h-3 text-yellow-600" />;
    }
  };

  if (!orders || orders.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 sm:mt-8 bg-white border-2 border-gray-300 rounded-lg p-4 sm:p-6 shadow-xl animate-slideUp">
      <div className="flex items-center justify-between mb-4 gap-4">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">Recent Orders</h2>
        <Button
          data-testid="view-all-orders-btn"
          variant="ghost"
          onClick={() => navigate('/orders')}
          className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-lg whitespace-nowrap h-8 px-3 text-sm"
        >
          View All
        </Button>
      </div>
      <div className="space-y-2">
        {orders.map((order) => {
          const service = services?.find(s => s.id === order.service_id) || order.services;
          const isPackageOrder = !!order.promotion_package_id;
          const isCombo = order.is_combo || (order.child_orders && order.child_orders.length > 0);
          const childOrders = order.child_orders || [];
          const isExpanded = !!expandedOrders[order.id];

          const platformName = order.services?.platform || service?.platform || order.promotion_packages?.platform || '';
          const serviceName = order.is_builder_combo
            ? order.combo_service_name || 'Combo Service'
            : isPackageOrder
              ? order.promotion_packages?.name || 'Package'
              : service?.name || 'Service';

          return (
            <div 
              key={order.id} 
              className={`bg-gray-50 border ${isCombo ? 'border-indigo-200' : isPackageOrder ? 'border-purple-200' : 'border-gray-200'} rounded-lg hover:border-gray-300 transition-colors overflow-hidden`}
            >
              <div className="px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                  <PlatformIcon platform={platformName} serviceName={serviceName} className="w-4 h-4 object-contain shrink-0" />
                  <p className="text-sm font-medium text-gray-900 truncate max-w-[150px] sm:max-w-none">{serviceName}</p>
                  <span className="text-[10px] sm:text-xs text-gray-500 whitespace-nowrap shrink-0">({order.quantity?.toLocaleString() || '0'})</span>
                  
                  {isCombo && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-semibold rounded border border-indigo-200">
                      <Layers className="w-2.5 h-2.5" />
                      Combo ({childOrders.length || 'Bundle'})
                    </span>
                  )}

                  {isPackageOrder && !isCombo && (
                    <span className="hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-medium rounded flex-shrink-0">
                      <Tag className="w-2.5 h-2.5" />
                      Package
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                  <p className="text-sm font-semibold text-gray-900 whitespace-nowrap">₵{order.total_cost?.toFixed(2) || '0.00'}</p>
                  <div className="flex items-center gap-2">
                    {order.is_reward && (
                      <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-medium rounded flex-shrink-0">
                        <Gift className="w-2.5 h-2.5" />
                        Reward
                      </span>
                    )}
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded border whitespace-nowrap capitalize ${getStatusStyles(order.status)}`}>
                      {order.status === 'submission_failed' ? 'Failed' : order.status}
                    </span>
                    
                    {isCombo && childOrders.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => toggleExpand(order.id, e)}
                        className="h-6 px-1.5 text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                      >
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </Button>
                    )}

                    {order.status === 'submission_failed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate('/orders')}
                        className="text-[10px] h-6 px-1.5 border-red-200 text-red-600 hover:bg-red-50"
                      >
                        Retry
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Expandable Sub-Orders breakdown on Dashboard */}
              {isCombo && childOrders.length > 0 && isExpanded && (
                <div className="bg-white border-t border-indigo-100 px-4 py-2.5 space-y-1.5 animate-fadeIn">
                  <p className="text-[11px] font-semibold text-gray-700 uppercase tracking-wider">
                    Sub-Orders Statuses:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {childOrders.map((child, idx) => {
                      const childStatus = child.status || 'pending';
                      const childName = child.service_type || child.service_name || `Sub-Service #${idx + 1}`;
                      const childQty = child.fixed_quantity || child.quantity || (order.quantity / childOrders.length) || order.quantity;

                      return (
                        <div key={child.id || idx} className="flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded px-2.5 py-1.5">
                          <span className="font-medium text-gray-800 truncate mr-2">
                            {childName} (+{Number(childQty).toLocaleString()})
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize flex items-center gap-1 shrink-0 ${getStatusStyles(childStatus)}`}>
                            {getStatusIcon(childStatus)}
                            {childStatus}
                          </span>
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
  );
});

DashboardOrders.displayName = 'DashboardOrders';

export default DashboardOrders;
