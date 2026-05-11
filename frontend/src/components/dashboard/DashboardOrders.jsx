import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tag, Gift } from 'lucide-react';

const DashboardOrders = React.memo(({ orders, services }) => {
  const navigate = useNavigate();

  const getStatusStyles = useMemo(() => {
    return (status) => {
      const statusLower = status?.toLowerCase() || '';
      if (statusLower === 'completed') {
        return 'bg-green-100 text-green-700 border-green-200';
      } else if (statusLower === 'processing' || statusLower.includes('in progress')) {
        return 'bg-blue-100 text-blue-700 border-blue-200';
      } else if (statusLower === 'partial') {
        return 'bg-orange-100 text-orange-700 border-orange-200';
      } else if (statusLower === 'canceled' || statusLower === 'cancelled' || statusLower.includes('cancel')) {
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
          const service = services?.find(s => s.id === order.service_id);
          const isPackageOrder = !!order.promotion_package_id;
          const serviceName = isPackageOrder
            ? order.promotion_packages?.name || 'Package'
            : service?.name || 'Service';

          return (
            <div key={order.id} className={`bg-gray-50 border ${isPackageOrder ? 'border-purple-200' : 'border-gray-200'} px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg hover:border-gray-300 transition-colors`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 truncate max-w-[150px] sm:max-w-none">{serviceName}</p>
                  <span className="text-[10px] sm:text-xs text-gray-500 whitespace-nowrap shrink-0">({order.quantity?.toLocaleString() || '0'})</span>
                  {isPackageOrder && (
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
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded border whitespace-nowrap ${getStatusStyles(order.status)}`}>
                      {order.status === 'submission_failed' ? 'Failed' : order.status}
                    </span>
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
            </div>
          );
        })}
      </div>
    </div>
  );
});

DashboardOrders.displayName = 'DashboardOrders';

export default DashboardOrders;

