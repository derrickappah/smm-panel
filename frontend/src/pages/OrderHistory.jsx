import React, { useState, useEffect } from 'react';
import { axiosInstance } from '@/App';
import Navbar from '@/components/Navbar';
import { Clock, CheckCircle, XCircle, Loader } from 'lucide-react';

const OrderHistory = ({ user, onLogout }) => {
  const [orders, setOrders] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [ordersRes, servicesRes] = await Promise.all([
        axiosInstance.get('/orders'),
        axiosInstance.get('/services')
      ]);
      setOrders(ordersRes.data);
      setServices(servicesRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'cancelled':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'processing':
        return <Loader className="w-5 h-5 text-blue-600 animate-spin" />;
      default:
        return <Clock className="w-5 h-5 text-yellow-600" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-700';
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      case 'processing':
        return 'bg-blue-100 text-blue-700';
      default:
        return 'bg-yellow-100 text-yellow-700';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <Navbar user={user} onLogout={onLogout} />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8 animate-fadeIn">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Order History</h1>
          <p className="text-gray-600">Track all your orders and their status</p>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-indigo-600 mx-auto"></div>
          </div>
        ) : orders.length === 0 ? (
          <div className="glass p-12 rounded-3xl text-center animate-slideUp">
            <p className="text-gray-600 text-lg mb-4">No orders yet</p>
            <p className="text-gray-500">Your order history will appear here</p>
          </div>
        ) : (
          <div className="space-y-4 animate-slideUp">
            {orders.map((order, index) => {
              const service = services.find(s => s.id === order.service_id);
              return (
                <div
                  key={order.id}
                  data-testid={`order-item-${order.id}`}
                  className="glass p-6 rounded-2xl card-hover"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-gray-900">{service?.name || 'Service'}</h3>
                        <span className={`text-xs px-3 py-1 rounded-full font-medium ${getStatusColor(order.status)}`}>
                          {order.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{order.link}</p>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                        <span>Quantity: <strong>{order.quantity}</strong></span>
                        <span>Cost: <strong>${order.total_cost.toFixed(2)}</strong></span>
                        <span>Order ID: <strong>{order.id.slice(0, 8)}</strong></span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {getStatusIcon(order.status)}
                      <div className="text-right">
                        <p className="text-xs text-gray-500">Placed on</p>
                        <p className="text-sm font-medium text-gray-700">
                          {new Date(order.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderHistory;