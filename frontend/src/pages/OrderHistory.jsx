import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getSMMGenOrderStatus } from '@/lib/smmgen';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Clock, CheckCircle, XCircle, Loader, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const OrderHistory = ({ user, onLogout }) => {
  const [orders, setOrders] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingStatus, setCheckingStatus] = useState({});
  const hasCheckedStatus = useRef(false);

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

      setOrders(ordersRes.data || []);
      setServices(servicesRes.data || []);
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

  // Map SMMGen status to our status format
  const mapSMMGenStatus = useCallback((smmgenStatus) => {
    if (!smmgenStatus) return null;
    
    const statusLower = String(smmgenStatus).toLowerCase();
    
    // SMMGen typically returns: 'Pending', 'Processing', 'Completed', 'Partial', 'Cancelled', etc.
    if (statusLower.includes('completed') || statusLower === 'completed') {
      return 'completed';
    }
    if (statusLower.includes('cancelled') || statusLower.includes('canceled')) {
      return 'cancelled';
    }
    if (statusLower.includes('processing') || statusLower.includes('in progress') || statusLower.includes('partial')) {
      return 'processing';
    }
    if (statusLower.includes('pending') || statusLower === 'pending') {
      return 'pending';
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

        // Update local state
        setOrders(prevOrders =>
          prevOrders.map(o =>
            o.id === order.id
              ? { ...o, status: mappedStatus, completed_at: mappedStatus === 'completed' ? new Date().toISOString() : o.completed_at }
              : o
          )
        );

        toast.success(`Order status updated to ${mappedStatus}`);
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
        const ordersWithSMMGen = orders.filter(o => o.smmgen_order_id && (o.status === 'pending' || o.status === 'processing'));
        
        // Check status for each order (with delay to avoid rate limiting)
        for (let i = 0; i < ordersWithSMMGen.length; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000 * i)); // 1 second delay between checks
          await checkOrderStatus(ordersWithSMMGen[i]);
        }
      };

      checkAllSMMGenOrders();
    }
  }, [loading, orders.length, checkOrderStatus]);

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
                        <span>Cost: <strong>₵{order.total_cost.toFixed(2)}</strong></span>
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
                        {order.smmgen_order_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => checkOrderStatus(order)}
                            disabled={checkingStatus[order.id]}
                            className="mt-2 text-xs"
                          >
                            {checkingStatus[order.id] ? (
                              <>
                                <Loader className="w-3 h-3 mr-1 animate-spin" />
                                Checking...
                              </>
                            ) : (
                              <>
                                <RefreshCw className="w-3 h-3 mr-1" />
                                Check Status
                              </>
                            )}
                          </Button>
                        )}
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
