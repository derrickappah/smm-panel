import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

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
      } else {
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      }
    };
  }, []);

  if (orders.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 sm:mt-8 bg-white border border-gray-200 rounded-lg p-6 sm:p-8 shadow-sm animate-slideUp">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Recent Orders</h2>
        <Button
          data-testid="view-all-orders-btn"
          variant="ghost"
          onClick={() => navigate('/orders')}
          className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-lg"
        >
          View All
        </Button>
      </div>
      <div className="space-y-3">
        {orders.map((order) => {
          const service = services.find(s => s.id === order.service_id);
          return (
            <div key={order.id} className="bg-gray-50 border border-gray-200 p-4 rounded-lg hover:border-gray-300 transition-colors">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm sm:text-base font-medium text-gray-900 truncate">{service?.name || 'Service'}</p>
                  <p className="text-xs sm:text-sm text-gray-600 mt-0.5">Quantity: {order.quantity.toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                  <p className="text-sm sm:text-base font-semibold text-gray-900">₵{order.total_cost.toFixed(2)}</p>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded border ${getStatusStyles(order.status)}`}>
                    {order.status}
                  </span>
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

