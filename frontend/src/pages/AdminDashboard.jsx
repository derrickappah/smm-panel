import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import { Users, ShoppingCart, DollarSign, Package } from 'lucide-react';

const AdminDashboard = ({ user, onLogout }) => {
  const [stats, setStats] = useState({ total_users: 0, total_orders: 0, pending_deposits: 0 });
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [serviceForm, setServiceForm] = useState({
    platform: '',
    service_type: '',
    name: '',
    rate: '',
    min_quantity: '',
    max_quantity: '',
    description: ''
  });

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      const [usersRes, ordersRes, depositsRes] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('orders').select('*').order('created_at', { ascending: false }),
        supabase.from('transactions').select('*').eq('type', 'deposit').order('created_at', { ascending: false })
      ]);

      if (usersRes.error) throw usersRes.error;
      if (ordersRes.error) throw ordersRes.error;
      if (depositsRes.error) throw depositsRes.error;

      setUsers(usersRes.data || []);
      setOrders(ordersRes.data || []);
      setDeposits(depositsRes.data || []);

      // Calculate stats
      const pendingDeposits = (depositsRes.data || []).filter(d => d.status === 'pending').length;
      setStats({
        total_users: (usersRes.data || []).length,
        total_orders: (ordersRes.data || []).length,
        pending_deposits: pendingDeposits
      });
    } catch (error) {
      console.error('Error fetching admin data:', error);
      toast.error('Failed to load admin data');
    }
  };

  const handleCreateService = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.from('services').insert({
        platform: serviceForm.platform,
        service_type: serviceForm.service_type,
        name: serviceForm.name,
        rate: parseFloat(serviceForm.rate),
        min_quantity: parseInt(serviceForm.min_quantity),
        max_quantity: parseInt(serviceForm.max_quantity),
        description: serviceForm.description
      });

      if (error) throw error;
      toast.success('Service created successfully!');
      setServiceForm({
        platform: '',
        service_type: '',
        name: '',
        rate: '',
        min_quantity: '',
        max_quantity: '',
        description: ''
      });
    } catch (error) {
      toast.error(error.message || 'Failed to create service');
    } finally {
      setLoading(false);
    }
  };

  const handleOrderStatusUpdate = async (orderId, status) => {
    try {
      const updateData = { status };
      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId);

      if (error) throw error;
      toast.success('Order status updated!');
      fetchAllData();
    } catch (error) {
      toast.error(error.message || 'Failed to update order status');
    }
  };

  const handleDepositAction = async (transactionId, action) => {
    try {
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      
      // Update transaction status
      const { error: transactionError } = await supabase
        .from('transactions')
        .update({ status: newStatus })
        .eq('id', transactionId);

      if (transactionError) throw transactionError;

      // If approved, add balance to user
      if (action === 'approve') {
        const transaction = deposits.find(d => d.id === transactionId);
        if (transaction) {
          // Get current balance
          const { data: profile } = await supabase
            .from('profiles')
            .select('balance')
            .eq('id', transaction.user_id)
            .single();

          if (profile) {
            const { error: balanceError } = await supabase
              .from('profiles')
              .update({ balance: profile.balance + transaction.amount })
              .eq('id', transaction.user_id);

            if (balanceError) throw balanceError;
          }
        }
      }

      toast.success(`Deposit ${action}d successfully!`);
      fetchAllData();
    } catch (error) {
      toast.error(error.message || `Failed to ${action} deposit`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <Navbar user={user} onLogout={onLogout} />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8 animate-fadeIn">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
          <p className="text-gray-600">Manage users, orders, and services</p>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8 animate-slideUp">
          <div className="glass p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <Users className="w-8 h-8 text-indigo-600" />
              <span className="text-3xl font-bold text-gray-900">{stats.total_users}</span>
            </div>
            <p className="text-gray-600 text-sm">Total Users</p>
          </div>
          <div className="glass p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <ShoppingCart className="w-8 h-8 text-blue-600" />
              <span className="text-3xl font-bold text-gray-900">{stats.total_orders}</span>
            </div>
            <p className="text-gray-600 text-sm">Total Orders</p>
          </div>
          <div className="glass p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="w-8 h-8 text-green-600" />
              <span className="text-3xl font-bold text-gray-900">{stats.pending_deposits}</span>
            </div>
            <p className="text-gray-600 text-sm">Pending Deposits</p>
          </div>
          <div className="glass p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <Package className="w-8 h-8 text-purple-600" />
              <span className="text-3xl font-bold text-gray-900">Active</span>
            </div>
            <p className="text-gray-600 text-sm">System Status</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="deposits" className="animate-slideUp">
          <TabsList className="glass mb-6">
            <TabsTrigger data-testid="admin-deposits-tab" value="deposits">Pending Deposits</TabsTrigger>
            <TabsTrigger data-testid="admin-orders-tab" value="orders">Manage Orders</TabsTrigger>
            <TabsTrigger data-testid="admin-services-tab" value="services">Add Service</TabsTrigger>
            <TabsTrigger data-testid="admin-users-tab" value="users">Users</TabsTrigger>
          </TabsList>

          {/* Deposits Tab */}
          <TabsContent value="deposits">
            <div className="glass p-6 rounded-3xl">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Pending Deposits</h2>
              {deposits.filter(d => d.status === 'pending').length === 0 ? (
                <p className="text-gray-600 text-center py-8">No pending deposits</p>
              ) : (
                <div className="space-y-4">
                  {deposits.filter(d => d.status === 'pending').map((deposit) => (
                    <div key={deposit.id} data-testid={`deposit-item-${deposit.id}`} className="bg-white/50 p-4 rounded-xl flex justify-between items-center">
                      <div>
                        <p className="font-medium text-gray-900">Amount: ₵{deposit.amount.toFixed(2)}</p>
                        <p className="text-sm text-gray-600">User ID: {deposit.user_id.slice(0, 8)}</p>
                        <p className="text-xs text-gray-500">{new Date(deposit.created_at).toLocaleString()}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          data-testid={`deposit-approve-${deposit.id}`}
                          onClick={() => handleDepositAction(deposit.id, 'approve')}
                          className="bg-green-500 hover:bg-green-600 text-white"
                        >
                          Approve
                        </Button>
                        <Button
                          data-testid={`deposit-reject-${deposit.id}`}
                          onClick={() => handleDepositAction(deposit.id, 'reject')}
                          variant="destructive"
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders">
            <div className="glass p-6 rounded-3xl">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">All Orders</h2>
              <div className="space-y-4">
                {orders.slice(0, 20).map((order) => (
                  <div key={order.id} data-testid={`admin-order-item-${order.id}`} className="bg-white/50 p-4 rounded-xl">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-medium text-gray-900">Order ID: {order.id.slice(0, 8)}</p>
                        <p className="text-sm text-gray-600">User: {order.user_id.slice(0, 8)}</p>
                        <p className="text-sm text-gray-600">Quantity: {order.quantity} | Cost: ₵{order.total_cost.toFixed(2)}</p>
                      </div>
                      <Select defaultValue={order.status} onValueChange={(value) => handleOrderStatusUpdate(order.id, value)}>
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="processing">Processing</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Services Tab */}
          <TabsContent value="services">
            <div className="glass p-8 rounded-3xl max-w-2xl">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Add New Service</h2>
              <form onSubmit={handleCreateService} className="space-y-5">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Platform</Label>
                    <Select value={serviceForm.platform} onValueChange={(value) => setServiceForm({ ...serviceForm, platform: value })}>
                      <SelectTrigger data-testid="service-platform-select">
                        <SelectValue placeholder="Select platform" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="tiktok">TikTok</SelectItem>
                        <SelectItem value="youtube">YouTube</SelectItem>
                        <SelectItem value="facebook">Facebook</SelectItem>
                        <SelectItem value="twitter">Twitter</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Service Type</Label>
                    <Input
                      data-testid="service-type-input"
                      placeholder="e.g., followers, likes"
                      value={serviceForm.service_type}
                      onChange={(e) => setServiceForm({ ...serviceForm, service_type: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label>Service Name</Label>
                  <Input
                    data-testid="service-name-input"
                    placeholder="e.g., Instagram Followers - High Quality"
                    value={serviceForm.name}
                    onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <Label>Rate (per 1000)</Label>
                    <Input
                      data-testid="service-rate-input"
                      type="number"
                      step="0.01"
                      placeholder="5.00"
                      value={serviceForm.rate}
                      onChange={(e) => setServiceForm({ ...serviceForm, rate: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Min Quantity</Label>
                    <Input
                      data-testid="service-min-input"
                      type="number"
                      placeholder="100"
                      value={serviceForm.min_quantity}
                      onChange={(e) => setServiceForm({ ...serviceForm, min_quantity: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Max Quantity</Label>
                    <Input
                      data-testid="service-max-input"
                      type="number"
                      placeholder="10000"
                      value={serviceForm.max_quantity}
                      onChange={(e) => setServiceForm({ ...serviceForm, max_quantity: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <Input
                    data-testid="service-description-input"
                    placeholder="Service description"
                    value={serviceForm.description}
                    onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
                    required
                  />
                </div>
                <Button
                  data-testid="service-submit-btn"
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white py-6 rounded-full"
                >
                  {loading ? 'Creating...' : 'Create Service'}
                </Button>
              </form>
            </div>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <div className="glass p-6 rounded-3xl">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">All Users</h2>
              <div className="space-y-3">
                {users.map((u) => (
                  <div key={u.id} className="bg-white/50 p-4 rounded-xl flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-900">{u.name}</p>
                      <p className="text-sm text-gray-600">{u.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">₵{u.balance.toFixed(2)}</p>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {u.role}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminDashboard;
