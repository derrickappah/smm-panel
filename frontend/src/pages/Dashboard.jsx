import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { axiosInstance } from '@/App';
import Navbar from '@/components/Navbar';
import { Wallet, ShoppingCart, Clock, TrendingUp } from 'lucide-react';

const Dashboard = ({ user, onLogout, onUpdateUser }) => {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [depositAmount, setDepositAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [orderForm, setOrderForm] = useState({
    service_id: '',
    link: '',
    quantity: ''
  });

  useEffect(() => {
    fetchServices();
    fetchRecentOrders();
  }, []);

  const fetchServices = async () => {
    try {
      const response = await axiosInstance.get('/services');
      setServices(response.data);
    } catch (error) {
      console.error('Error fetching services:', error);
    }
  };

  const fetchRecentOrders = async () => {
    try {
      const response = await axiosInstance.get('/orders');
      setRecentOrders(response.data.slice(0, 5));
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  };

  const handleDeposit = async (e) => {
    e.preventDefault();
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setLoading(true);
    try {
      await axiosInstance.post('/user/deposit', { amount: parseFloat(depositAmount) });
      toast.success('Deposit request submitted! Waiting for admin approval.');
      setDepositAmount('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit deposit request');
    } finally {
      setLoading(false);
    }
  };

  const handleOrder = async (e) => {
    e.preventDefault();
    if (!orderForm.service_id || !orderForm.link || !orderForm.quantity) {
      toast.error('Please fill all fields');
      return;
    }

    setLoading(true);
    try {
      await axiosInstance.post('/orders', {
        service_id: orderForm.service_id,
        link: orderForm.link,
        quantity: parseInt(orderForm.quantity)
      });
      toast.success('Order placed successfully!');
      setOrderForm({ service_id: '', link: '', quantity: '' });
      await onUpdateUser();
      fetchRecentOrders();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  const selectedService = services.find(s => s.id === orderForm.service_id);
  const estimatedCost = selectedService && orderForm.quantity
    ? ((parseInt(orderForm.quantity) / 1000) * selectedService.rate).toFixed(2)
    : '0.00';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <Navbar user={user} onLogout={onLogout} />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Welcome Section */}
        <div className="mb-8 animate-fadeIn">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Welcome back, {user.name}!</h1>
          <p className="text-gray-600">Manage your orders and grow your social presence</p>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-8 animate-slideUp">
          <div className="glass p-6 rounded-2xl card-hover">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center">
                <Wallet className="w-6 h-6 text-white" />
              </div>
            </div>
            <p className="text-gray-600 text-sm mb-1">Current Balance</p>
            <h3 data-testid="user-balance" className="text-3xl font-bold text-gray-900">${user.balance.toFixed(2)}</h3>
          </div>

          <div className="glass p-6 rounded-2xl card-hover">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                <ShoppingCart className="w-6 h-6 text-white" />
              </div>
            </div>
            <p className="text-gray-600 text-sm mb-1">Total Orders</p>
            <h3 className="text-3xl font-bold text-gray-900">{recentOrders.length}</h3>
          </div>

          <div className="glass p-6 rounded-2xl card-hover">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
            </div>
            <p className="text-gray-600 text-sm mb-1">Account Status</p>
            <h3 className="text-xl font-bold text-green-600">Active</h3>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Add Funds */}
          <div className="glass p-8 rounded-3xl animate-slideUp">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Add Funds</h2>
            <form onSubmit={handleDeposit} className="space-y-5">
              <div>
                <Label htmlFor="amount" className="text-gray-700 font-medium mb-2 block">Amount (USD)</Label>
                <Input
                  id="amount"
                  data-testid="deposit-amount-input"
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="Enter amount"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="rounded-xl bg-white/70"
                />
              </div>
              <Button
                data-testid="deposit-submit-btn"
                type="submit"
                disabled={loading}
                className="w-full btn-hover bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white py-6 rounded-full"
              >
                {loading ? 'Processing...' : 'Request Deposit'}
              </Button>
              <p className="text-sm text-gray-600 text-center">
                Deposits are manually approved by admin
              </p>
            </form>
          </div>

          {/* Quick Order */}
          <div className="glass p-8 rounded-3xl animate-slideUp">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Place New Order</h2>
            <form onSubmit={handleOrder} className="space-y-5">
              <div>
                <Label htmlFor="service" className="text-gray-700 font-medium mb-2 block">Service</Label>
                <Select value={orderForm.service_id} onValueChange={(value) => setOrderForm({ ...orderForm, service_id: value })}>
                  <SelectTrigger data-testid="order-service-select" className="rounded-xl bg-white/70">
                    <SelectValue placeholder="Select a service" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((service) => (
                      <SelectItem key={service.id} value={service.id}>
                        {service.name} - ${service.rate}/1000
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="link" className="text-gray-700 font-medium mb-2 block">Link</Label>
                <Input
                  id="link"
                  data-testid="order-link-input"
                  type="url"
                  placeholder="https://instagram.com/yourprofile"
                  value={orderForm.link}
                  onChange={(e) => setOrderForm({ ...orderForm, link: e.target.value })}
                  className="rounded-xl bg-white/70"
                />
              </div>

              <div>
                <Label htmlFor="quantity" className="text-gray-700 font-medium mb-2 block">Quantity</Label>
                <Input
                  id="quantity"
                  data-testid="order-quantity-input"
                  type="number"
                  placeholder="1000"
                  value={orderForm.quantity}
                  onChange={(e) => setOrderForm({ ...orderForm, quantity: e.target.value })}
                  className="rounded-xl bg-white/70"
                />
                {selectedService && (
                  <p className="text-sm text-gray-600 mt-2">
                    Min: {selectedService.min_quantity} | Max: {selectedService.max_quantity}
                  </p>
                )}
              </div>

              <div className="bg-indigo-50 p-4 rounded-xl">
                <p className="text-sm text-gray-600 mb-1">Estimated Cost</p>
                <p data-testid="order-estimated-cost" className="text-2xl font-bold text-indigo-600">${estimatedCost}</p>
              </div>

              <Button
                data-testid="order-submit-btn"
                type="submit"
                disabled={loading || !orderForm.service_id}
                className="w-full btn-hover bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white py-6 rounded-full"
              >
                {loading ? 'Processing...' : 'Place Order'}
              </Button>
            </form>
          </div>
        </div>

        {/* Recent Orders */}
        {recentOrders.length > 0 && (
          <div className="mt-8 glass p-8 rounded-3xl animate-slideUp">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Recent Orders</h2>
              <Button
                data-testid="view-all-orders-btn"
                variant="ghost"
                onClick={() => navigate('/orders')}
                className="text-indigo-600 hover:text-indigo-700"
              >
                View All
              </Button>
            </div>
            <div className="space-y-3">
              {recentOrders.map((order) => {
                const service = services.find(s => s.id === order.service_id);
                return (
                  <div key={order.id} className="bg-white/50 p-4 rounded-xl flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900">{service?.name || 'Service'}</p>
                      <p className="text-sm text-gray-600">Quantity: {order.quantity}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">${order.total_cost.toFixed(2)}</p>
                      <span className={`text-xs px-3 py-1 rounded-full ${
                        order.status === 'completed' ? 'bg-green-100 text-green-700' :
                        order.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                        order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;