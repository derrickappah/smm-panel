import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tag, Gift, Layers, CheckCircle, Clock, XCircle, Loader } from 'lucide-react';
import PlatformIcon from '@/components/PlatformIcon';

const DashboardOrders = React.memo(({ orders, services }) => {
  const navigate = useNavigate();

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
        return <CheckCircle className="w-3 h-3 text-green-600 shrink-0" />;
      case 'canceled':
      case 'cancelled':
      case 'failed':
        return <XCircle className="w-3 h-3 text-red-600 shrink-0" />;
      case 'processing':
      case 'in progress':
        return <Loader className="w-3 h-3 text-blue-600 animate-spin shrink-0" />;
      case 'partial':
        return <Loader className="w-3 h-3 text-orange-600 animate-spin shrink-0" />;
      case 'refunded':
      case 'refunds':
        return <XCircle className="w-3 h-3 text-purple-600 shrink-0" />;
      case 'submission_failed':
        return <XCircle className="w-3 h-3 text-red-500 shrink-0" />;
      case 'pending':
      default:
        return <Clock className="w-3 h-3 text-yellow-600 shrink-0" />;
    }
  };

  const displayOrders = (orders || []).slice(0, 1);

  if (!displayOrders || displayOrders.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 sm:mt-8 bg-white border-2 border-gray-300 rounded-lg p-4 sm:p-6 shadow-xl animate-slideUp">
      <div className="flex items-center justify-between mb-4 gap-4">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">Recent Order</h2>
        <Button
          data-testid="view-all-orders-btn"
          variant="ghost"
          onClick={() => navigate('/orders')}
          className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-lg whitespace-nowrap h-8 px-3 text-sm font-medium"
        >
          See More
        </Button>
      </div>
      <div className="space-y-2">
        {displayOrders.map((order) => {
          const service = services?.find(s => s.id === order.service_id) || order.services;
          const isPackageOrder = !!order.promotion_package_id;
          const isCombo = !!(order.is_combo || order.combo_id || order.combo_name);
          const platformName = order.platform || order.services?.platform || service?.platform || '';
          
          let serviceName = order.service_name;
          if (!serviceName) {
            if (order.combo_name && order.combo_item_name) {
              serviceName = `${order.combo_name} (${order.combo_item_name})`;
            } else if (order.combo_name) {
              serviceName = order.combo_name;
            } else {
              serviceName = service?.name || 'SMM Service';
            }
          }

          const displayId = order.display_order_id || 
            (order.apiowner_order_id && !String(order.apiowner_order_id).toLowerCase().includes('not placed') ? order.apiowner_order_id :
             order.oldsmm_order_id && !String(order.oldsmm_order_id).toLowerCase().includes('not placed') ? order.oldsmm_order_id :
             order.g1618_order_id && !String(order.g1618_order_id).toLowerCase().includes('not placed') ? order.g1618_order_id :
             order.worldofsmm_order_id && !String(order.worldofsmm_order_id).toLowerCase().includes('not placed') ? order.worldofsmm_order_id :
             order.smmcost_order_id && !String(order.smmcost_order_id).toLowerCase().includes('not placed') ? order.smmcost_order_id :
             order.jbsmmpanel_order_id && order.jbsmmpanel_order_id > 0 ? order.jbsmmpanel_order_id :
             order.smmgen_order_id && !String(order.smmgen_order_id).toLowerCase().includes('not placed') ? order.smmgen_order_id :
             (order.id ? order.id.slice(0, 8) : ''));

          return (
            <div 
              key={order.id} 
              className={`bg-gray-50 border ${isCombo ? 'border-indigo-200 bg-indigo-50/10' : isPackageOrder ? 'border-purple-200' : 'border-gray-200'} px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg hover:border-gray-300 transition-colors flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap`}
            >
              <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                <PlatformIcon platform={platformName} serviceName={serviceName} className="w-4 h-4 object-contain shrink-0" />
                <p className="text-sm font-medium text-gray-900 truncate max-w-[180px] sm:max-w-none">{serviceName}</p>
                <span className="text-[10px] sm:text-xs text-gray-500 whitespace-nowrap shrink-0">(+{Number(order.quantity || 0).toLocaleString()})</span>
                
                {isCombo && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-semibold rounded border border-indigo-200">
                    <Layers className="w-2.5 h-2.5" />
                    Combo
                  </span>
                )}

                {displayId && displayId !== 'N/A' && (
                  <span className="font-mono text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-700">
                    ID: {displayId}
                  </span>
                )}

                {order.is_reward && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-medium rounded flex-shrink-0">
                    <Gift className="w-2.5 h-2.5" />
                    Reward
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 sm:gap-4 shrink-0 flex-wrap">
                <p className="text-sm font-semibold text-gray-900 whitespace-nowrap">₵{Number(order.total_cost || 0).toFixed(2)}</p>
                
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded border whitespace-nowrap capitalize flex items-center gap-1 ${getStatusStyles(order.status)}`}>
                  {getStatusIcon(order.status)}
                  {order.status === 'submission_failed' ? 'Failed' : order.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

DashboardOrders.displayName = 'DashboardOrders';

export default DashboardOrders;
