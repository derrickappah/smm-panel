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

  if (orders.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 sm:mt-8 bg-white border-2 border-gray-300 rounded-lg p-6 sm:p-8 shadow-xl animate-slideUp">
      <div className="flex items-center justify-between mb-6 gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Recent Orders</h2>
        <Button
          data-testid="view-all-orders-btn"
          variant="ghost"
          onClick={() => navigate('/orders')}
          className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-lg whitespace-nowrap"
        >
          View All
        </Button>
      </div>
      <div className="space-y-3">
        {orders.map((order) => {
          const service = services.find(s => s.id === order.service_id);
          const isPackageOrder = !!order.promotion_package_id;
          const serviceName = isPackageOrder
            ? order.promotion_packages?.name || 'Package'
            : service?.name || 'Service';

          return (
            <div key={order.id} className={`bg-gray-50 border ${isPackageOrder ? 'border-purple-200' : 'border-gray-200'} p-4 rounded-lg hover:border-gray-300 transition-colors`}>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex-1 min-w-0 max-w-full">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm sm:text-base font-medium text-gray-900 truncate max-w-full">{serviceName}</p>
                    {isPackageOrder && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded flex-shrink-0">
                        <Tag className="w-3 h-3" />
                        Package
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-gray-600 mt-0.5">Quantity: {order.quantity?.toLocaleString() || '0'}</p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                  <p className="text-sm sm:text-base font-semibold text-gray-900">₵{order.total_cost?.toFixed(2) || '0.00'}</p>
                  <div className="flex items-center gap-2">
                    {order.is_reward && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded flex-shrink-0">
                        <Gift className="w-3 h-3" />
                        Reward
                      </span>
                    )}
                    <span className={`text-xs font-medium px-2.5 py-1 rounded border ${getStatusStyles(order.status)}`}>
                      {order.status === 'submission_failed' ? 'Placement Failed' : order.status}
                    </span>
                    {order.status === 'submission_failed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate('/orders')}
                        className="text-xs h-7 px-2 border-red-200 text-red-600 hover:bg-red-50"
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

