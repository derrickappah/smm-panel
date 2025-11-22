import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import { 
  Users, ShoppingCart, DollarSign, Package, Search, Edit, Trash2, 
  Plus, Minus, TrendingUp, CheckCircle, XCircle, Clock, Filter,
  Download, RefreshCw, MessageSquare, Send
} from 'lucide-react';

const AdminDashboard = ({ user, onLogout }) => {
  const [stats, setStats] = useState({ 
    total_users: 0, 
    total_orders: 0, 
    pending_deposits: 0,
    total_revenue: 0,
    completed_orders: 0,
    total_services: 0,
    confirmed_deposits: 0,
    total_deposits: 0,
    open_tickets: 0
  });
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]);
  const [services, setServices] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Search and filter states
  const [userSearch, setUserSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [serviceSearch, setServiceSearch] = useState('');
  
  // Edit states
  const [editingUser, setEditingUser] = useState(null);
  const [editingService, setEditingService] = useState(null);
  const [balanceAdjustment, setBalanceAdjustment] = useState({ userId: '', amount: '', type: 'add' });
  
  // Form states
  const [serviceForm, setServiceForm] = useState({
    platform: '',
    service_type: '',
    name: '',
    rate: '',
    min_quantity: '',
    max_quantity: '',
    description: '',
    smmgen_service_id: ''
  });

  useEffect(() => {
    fetchAllData();

    // Subscribe to real-time updates for transactions (deposits)
    const transactionsChannel = supabase
      .channel('admin-transactions-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all changes (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'transactions',
          filter: 'type=eq.deposit'
        },
        (payload) => {
          console.log('Transaction change detected:', payload);
          // Refresh deposits when transaction status changes
          fetchAllData();
        }
      )
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(transactionsChannel);
    };
  }, []);

  const fetchAllData = async () => {
    setRefreshing(true);
    try {
      // Verify user is admin first
      const { data: currentUser } = await supabase.auth.getUser();
      if (!currentUser?.user) {
        toast.error('Not authenticated');
        return;
      }

      const { data: userProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', currentUser.user.id)
        .single();

      if (userProfile?.role !== 'admin') {
        toast.error('Access denied. Admin role required.');
        return;
      }

      const [usersRes, ordersRes, depositsRes, transactionsRes, servicesRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('orders').select('*, services(name, platform)').order('created_at', { ascending: false }),
        supabase.from('transactions').select('*, profiles(email, name)').eq('type', 'deposit').order('created_at', { ascending: false }),
        supabase.from('transactions').select('*, profiles(email, name)').order('created_at', { ascending: false }),
        supabase.from('services').select('*').order('created_at', { ascending: false })
      ]);

      // Check for errors and provide specific messages
      if (usersRes.error) {
        console.error('Error fetching users:', usersRes.error);
        if (usersRes.error.code === '42501' || usersRes.error.message?.includes('permission') || usersRes.error.message?.includes('policy')) {
          toast.error('RLS Policy Error: Cannot view all users. Please run database/fixes/FIX_ADMIN_RLS.sql in Supabase SQL Editor.');
        } else {
          throw usersRes.error;
        }
      }
      if (ordersRes.error) {
        console.error('Error fetching orders:', ordersRes.error);
        if (ordersRes.error.code === '42501' || ordersRes.error.message?.includes('permission') || ordersRes.error.message?.includes('policy')) {
          toast.error('RLS Policy Error: Cannot view all orders. Please run database/fixes/FIX_ADMIN_RLS.sql in Supabase SQL Editor.');
        } else {
          throw ordersRes.error;
        }
      }
      if (depositsRes.error) {
        console.error('Error fetching deposits:', depositsRes.error);
        if (depositsRes.error.code === '42501' || depositsRes.error.message?.includes('permission') || depositsRes.error.message?.includes('policy')) {
          toast.error('RLS Policy Error: Cannot view all transactions. Please run database/fixes/FIX_ADMIN_RLS.sql in Supabase SQL Editor.');
        } else {
          throw depositsRes.error;
        }
      }
      if (transactionsRes.error) {
        console.error('Error fetching transactions:', transactionsRes.error);
        if (transactionsRes.error.code === '42501' || transactionsRes.error.message?.includes('permission') || transactionsRes.error.message?.includes('policy')) {
          toast.error('RLS Policy Error: Cannot view all transactions. Please run database/fixes/FIX_ADMIN_RLS.sql in Supabase SQL Editor.');
        } else {
          throw transactionsRes.error;
        }
      }
      if (servicesRes.error) {
        console.error('Error fetching services:', servicesRes.error);
        throw servicesRes.error;
      }
      if (ticketsRes.error) {
        console.error('Error fetching support tickets:', ticketsRes.error);
        // Don't throw - support tickets might not exist yet
        console.warn('Support tickets table may not exist. Run CREATE_SUPPORT_TICKETS.sql migration.');
      }

      setUsers(usersRes.data || []);
      setOrders(ordersRes.data || []);
      setDeposits(depositsRes.data || []);
      setAllTransactions(transactionsRes.data || []);
      setServices(servicesRes.data || []);
      setSupportTickets(ticketsRes.data || []);

      // Calculate enhanced stats
      const pendingDeposits = (depositsRes.data || []).filter(d => d.status === 'pending').length;
      const confirmedDeposits = (depositsRes.data || []).filter(d => d.status === 'approved').length;
      const completedOrders = (ordersRes.data || []).filter(o => o.status === 'completed').length;
      const openTickets = (ticketsRes.data || []).filter(t => t.status === 'open').length;
      const totalRevenue = (ordersRes.data || [])
        .filter(o => o.status === 'completed')
        .reduce((sum, o) => sum + parseFloat(o.total_cost || 0), 0);
      const totalDeposits = (depositsRes.data || [])
        .filter(d => d.status === 'approved')
        .reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);

      setStats({
        total_users: (usersRes.data || []).length,
        total_orders: (ordersRes.data || []).length,
        pending_deposits: pendingDeposits,
        total_revenue: totalRevenue,
        completed_orders: completedOrders,
        total_services: (servicesRes.data || []).length,
        confirmed_deposits: confirmedDeposits,
        total_deposits: totalDeposits,
        open_tickets: openTickets
      });

      // Show warning if only seeing own data
      if (usersRes.data && usersRes.data.length === 1 && usersRes.data[0].id === currentUser.user.id) {
        toast.warning('Only seeing your own data. RLS policies may need to be updated. Run database/fixes/FIX_ADMIN_RLS.sql in Supabase.');
      }
    } catch (error) {
      console.error('Error fetching admin data:', error);
      toast.error(error.message || 'Failed to load admin data. Check RLS policies.');
    } finally {
      setRefreshing(false);
    }
  };

  // User Management Functions
  const handleUpdateUser = async (userId, updates) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId);

      if (error) throw error;
      toast.success('User updated successfully!');
      setEditingUser(null);
      fetchAllData();
    } catch (error) {
      toast.error(error.message || 'Failed to update user');
    }
  };

  const handleAdjustBalance = async () => {
    if (!balanceAdjustment.userId || !balanceAdjustment.amount) {
      toast.error('Please select a user and enter an amount');
      return;
    }

    try {
      const user = users.find(u => u.id === balanceAdjustment.userId);
      if (!user) throw new Error('User not found');

      const amount = parseFloat(balanceAdjustment.amount);
      const newBalance = balanceAdjustment.type === 'add' 
        ? user.balance + amount 
        : user.balance - amount;

      if (newBalance < 0) {
        toast.error('Balance cannot be negative');
        return;
      }

      await handleUpdateUser(balanceAdjustment.userId, { balance: newBalance });
      
      // Create transaction record
      await supabase.from('transactions').insert({
        user_id: balanceAdjustment.userId,
        amount: amount,
        type: 'deposit',
        status: 'approved'
      });

      setBalanceAdjustment({ userId: '', amount: '', type: 'add' });
      toast.success(`Balance ${balanceAdjustment.type === 'add' ? 'added' : 'deducted'} successfully!`);
    } catch (error) {
      toast.error(error.message || 'Failed to adjust balance');
    }
  };

  // Service Management Functions
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
        description: serviceForm.description,
        smmgen_service_id: serviceForm.smmgen_service_id || null
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
        description: '',
        smmgen_service_id: ''
      });
      fetchAllData();
    } catch (error) {
      toast.error(error.message || 'Failed to create service');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateService = async (serviceId, updates) => {
    try {
      const { error } = await supabase
        .from('services')
        .update(updates)
        .eq('id', serviceId);

      if (error) throw error;
      toast.success('Service updated successfully!');
      setEditingService(null);
      fetchAllData();
    } catch (error) {
      toast.error(error.message || 'Failed to update service');
    }
  };

  const handleDeleteService = async (serviceId) => {
    if (!confirm('Are you sure you want to delete this service? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('services')
        .delete()
        .eq('id', serviceId);

      if (error) throw error;
      toast.success('Service deleted successfully!');
      fetchAllData();
    } catch (error) {
      toast.error(error.message || 'Failed to delete service');
    }
  };

  // Order Management Functions
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

  const handleRefundOrder = async (order) => {
    if (!confirm('Are you sure you want to refund this order? The user will receive their balance back.')) {
      return;
    }

    try {
      setLoading(true);
      
      // Get user's current balance
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('balance, name, email')
        .eq('id', order.user_id)
        .single();

      if (profileError) {
        console.error('Error fetching profile for refund:', profileError);
        throw new Error(`Failed to fetch user profile: ${profileError.message}`);
      }

      if (!profile) {
        throw new Error('User profile not found');
      }

      const currentBalance = parseFloat(profile.balance || 0);
      const refundAmount = parseFloat(order.total_cost || 0);
      const newBalance = currentBalance + refundAmount;

      console.log('Processing refund:', {
        userId: order.user_id,
        userName: profile.name || profile.email,
        currentBalance,
        refundAmount,
        newBalance,
        orderId: order.id
      });

      // Refund the amount
      const { data: updatedProfile, error: balanceError } = await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', order.user_id)
        .select('balance')
        .single();

      if (balanceError) {
        console.error('Error updating balance:', balanceError);
        throw new Error(`Failed to update balance: ${balanceError.message}`);
      }

      // Verify the balance was updated correctly
      if (!updatedProfile || parseFloat(updatedProfile.balance) !== newBalance) {
        console.error('Balance verification failed:', {
          expected: newBalance,
          actual: updatedProfile?.balance
        });
        throw new Error('Balance update verification failed. Please check manually.');
      }

      console.log('Balance updated successfully:', {
        oldBalance: currentBalance,
        newBalance: updatedProfile.balance
      });

      // Create a transaction record for the refund (optional but recommended for tracking)
      try {
        await supabase
          .from('transactions')
          .insert({
            user_id: order.user_id,
            amount: refundAmount,
            type: 'deposit',
            status: 'approved'
          });
        console.log('Refund transaction record created');
      } catch (transactionError) {
        // Don't fail the refund if transaction record creation fails
        console.warn('Failed to create refund transaction record:', transactionError);
      }

      // Update order status to cancelled
      const { error: orderError } = await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', order.id);

      if (orderError) {
        console.error('Error updating order status:', orderError);
        // Balance was updated, but order status failed - still show success but warn
        toast.warning(`Balance refunded, but failed to update order status: ${orderError.message}`);
      } else {
        toast.success(`Order refunded successfully! ₵${refundAmount.toFixed(2)} added back to user's balance.`);
      }

      // Refresh data to show updated balance
      fetchAllData();
    } catch (error) {
      console.error('Error processing refund:', error);
      toast.error(error.message || 'Failed to refund order. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  // Support Ticket Management Functions
  const handleUpdateTicketStatus = async (ticketId, newStatus) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('support_tickets')
        .update({ status: newStatus })
        .eq('id', ticketId);

      if (error) throw error;
      toast.success('Ticket status updated!');
      fetchAllData();
      setEditingTicket(null);
    } catch (error) {
      toast.error(error.message || 'Failed to update ticket status');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTicketResponse = async (ticketId) => {
    if (!ticketResponse.trim()) {
      toast.error('Please enter a response');
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase
        .from('support_tickets')
        .update({ 
          admin_response: ticketResponse,
          status: 'in_progress' // Auto-update status when admin responds
        })
        .eq('id', ticketId);

      if (error) throw error;
      toast.success('Response added successfully!');
      setTicketResponse('');
      setEditingTicket(null);
      fetchAllData();
    } catch (error) {
      toast.error(error.message || 'Failed to add response');
    } finally {
      setLoading(false);
    }
  };

  // Deposit status filter
  const [depositStatusFilter, setDepositStatusFilter] = useState('all');
  const [ticketStatusFilter, setTicketStatusFilter] = useState('all');
  const [editingTicket, setEditingTicket] = useState(null);
  const [ticketResponse, setTicketResponse] = useState('');

  // Filter functions
  const filteredUsers = users.filter(u => 
    u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearch.toLowerCase())
  );

  const filteredOrders = orders.filter(o => {
    const matchesSearch = orderSearch === '' || 
      o.id.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.user_id.toLowerCase().includes(orderSearch.toLowerCase());
    const matchesStatus = orderStatusFilter === 'all' || o.status === orderStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredTickets = supportTickets.filter(t => {
    const matchesStatus = ticketStatusFilter === 'all' || t.status === ticketStatusFilter;
    return matchesStatus;
  });

  const filteredServices = services.filter(s =>
    s.name?.toLowerCase().includes(serviceSearch.toLowerCase()) ||
    s.platform?.toLowerCase().includes(serviceSearch.toLowerCase()) ||
    s.service_type?.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  const filteredDeposits = deposits.filter(d => {
    if (depositStatusFilter === 'all') return true;
    if (depositStatusFilter === 'pending') return d.status === 'pending';
    if (depositStatusFilter === 'confirmed') return d.status === 'approved';
    if (depositStatusFilter === 'cancelled') return d.status === 'rejected';
    return true;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <Navbar user={user} onLogout={onLogout} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8 animate-fadeIn">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
              <p className="text-gray-600">Manage users, orders, and services</p>
            </div>
            <Button
              onClick={fetchAllData}
              disabled={refreshing}
              variant="outline"
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Enhanced Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6 mb-6 sm:mb-8 animate-slideUp">
          <div className="glass p-4 sm:p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <Users className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-600" />
              <span className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.total_users}</span>
            </div>
            <p className="text-gray-600 text-xs sm:text-sm">Total Users</p>
          </div>
          <div className="glass p-4 sm:p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <ShoppingCart className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" />
              <span className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.total_orders}</span>
            </div>
            <p className="text-gray-600 text-xs sm:text-sm">Total Orders</p>
          </div>
          <div className="glass p-4 sm:p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 text-green-600" />
              <span className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.completed_orders}</span>
            </div>
            <p className="text-gray-600 text-xs sm:text-sm">Completed</p>
          </div>
          <div className="glass p-4 sm:p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-600" />
              <span className="text-2xl sm:text-3xl font-bold text-gray-900">₵{stats.total_revenue.toFixed(2)}</span>
            </div>
            <p className="text-gray-600 text-xs sm:text-sm">Revenue</p>
          </div>
          <div className="glass p-4 sm:p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <Clock className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-600" />
              <span className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.pending_deposits}</span>
            </div>
            <p className="text-gray-600 text-xs sm:text-sm">Pending</p>
          </div>
          <div className="glass p-4 sm:p-6 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <Package className="w-6 h-6 sm:w-8 sm:h-8 text-purple-600" />
              <span className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.total_services}</span>
            </div>
            <p className="text-gray-600 text-xs sm:text-sm">Services</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="deposits" className="animate-slideUp">
          <TabsList className="glass mb-6 flex-wrap">
            <TabsTrigger value="deposits">Deposits</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="transactions">Transactions</TabsTrigger>
            <TabsTrigger value="support">
              Support {stats.open_tickets > 0 && <span className="ml-1 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{stats.open_tickets}</span>}
            </TabsTrigger>
            <TabsTrigger value="balance">Balance</TabsTrigger>
          </TabsList>

          {/* Deposits Tab */}
          <TabsContent value="deposits">
            <div className="glass p-4 sm:p-6 rounded-3xl">
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Payment Deposits</h2>
                <Select value={depositStatusFilter} onValueChange={setDepositStatusFilter}>
                  <SelectTrigger className="w-full sm:w-48">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Payments are processed via Paystack. Status is automatically updated based on payment confirmation.
              </p>
              {filteredDeposits.length === 0 ? (
                <p className="text-gray-600 text-center py-8">No deposits found</p>
              ) : (
                <div className="space-y-4">
                  {filteredDeposits.map((deposit) => {
                    const statusConfig = {
                      pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
                      approved: { label: 'Confirmed', color: 'bg-green-100 text-green-700', icon: CheckCircle },
                      rejected: { label: 'Cancelled', color: 'bg-red-100 text-red-700', icon: XCircle }
                    };
                    const status = statusConfig[deposit.status] || statusConfig.pending;
                    const StatusIcon = status.icon;

                    return (
                      <div key={deposit.id} className="bg-white/50 p-4 rounded-xl">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${status.color}`}>
                                <StatusIcon className="w-3 h-3" />
                                {status.label}
                              </span>
                            </div>
                            <p className="font-medium text-gray-900">Amount: ₵{deposit.amount.toFixed(2)}</p>
                            <p className="text-sm text-gray-600">
                              User: {deposit.profiles?.name || deposit.profiles?.email || deposit.user_id.slice(0, 8)}
                            </p>
                            <p className="text-xs text-gray-500">
                              {new Date(deposit.created_at).toLocaleString()}
                            </p>
                            {deposit.status === 'approved' && (
                              <p className="text-xs text-green-600 mt-1">✓ Payment confirmed via Paystack</p>
                            )}
                            {deposit.status === 'rejected' && (
                              <p className="text-xs text-red-600 mt-1">✗ Payment was cancelled</p>
                            )}
                            {deposit.status === 'pending' && (
                              <p className="text-xs text-yellow-600 mt-1">⏳ Awaiting payment confirmation</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders">
            <div className="glass p-4 sm:p-6 rounded-3xl">
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Search orders..."
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
                  <SelectTrigger className="w-full sm:w-40">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-4">
                {filteredOrders.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">No orders found</p>
                ) : (
                  filteredOrders.map((order) => (
                    <div key={order.id} className="bg-white/50 p-4 rounded-xl">
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">Order: {order.id.slice(0, 8)}...</p>
                            <p className="text-sm text-gray-600">
                              Service: {order.services?.name || 'N/A'}
                            </p>
                            <p className="text-sm text-gray-600">
                              Quantity: {order.quantity} | Cost: ₵{order.total_cost.toFixed(2)}
                            </p>
                            <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleString()}</p>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                            <Select 
                              value={order.status} 
                              onValueChange={(value) => handleOrderStatusUpdate(order.id, value)}
                            >
                              <SelectTrigger className="w-full sm:w-40">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="processing">Processing</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                                <SelectItem value="cancelled">Cancelled</SelectItem>
                              </SelectContent>
                            </Select>
                            {order.status !== 'cancelled' && (
                              <Button
                                onClick={() => handleRefundOrder(order)}
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                              >
                                Refund
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          {/* Services Tab */}
          <TabsContent value="services">
            <div className="space-y-6">
              {/* Add Service Form */}
              <div className="glass p-4 sm:p-8 rounded-3xl">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Add New Service</h2>
                <form onSubmit={handleCreateService} className="space-y-5">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label>Platform</Label>
                      <Select value={serviceForm.platform} onValueChange={(value) => setServiceForm({ ...serviceForm, platform: value })}>
                        <SelectTrigger>
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
                      placeholder="Service description"
                      value={serviceForm.description}
                      onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>SMMGen Service ID</Label>
                    <Input
                      placeholder="SMMGen API service ID (optional)"
                      value={serviceForm.smmgen_service_id}
                      onChange={(e) => setServiceForm({ ...serviceForm, smmgen_service_id: e.target.value })}
                    />
                    <p className="text-xs text-gray-500 mt-1">Enter the SMMGen API service ID for integration</p>
                  </div>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white py-6 rounded-full"
                  >
                    {loading ? 'Creating...' : 'Create Service'}
                  </Button>
                </form>
              </div>

              {/* Services List */}
              <div className="glass p-4 sm:p-6 rounded-3xl">
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900">All Services</h2>
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Search services..."
                      value={serviceSearch}
                      onChange={(e) => setServiceSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  {filteredServices.length === 0 ? (
                    <p className="text-gray-600 text-center py-8">No services found</p>
                  ) : (
                    filteredServices.map((service) => (
                      <div key={service.id} className="bg-white/50 p-4 rounded-xl">
                        {editingService?.id === service.id ? (
                          <ServiceEditForm 
                            service={service} 
                            onSave={(updates) => handleUpdateService(service.id, updates)}
                            onCancel={() => setEditingService(null)}
                          />
                        ) : (
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">{service.name}</p>
                              <p className="text-sm text-gray-600">
                                {service.platform} • {service.service_type}
                              </p>
                              <p className="text-sm text-gray-600">
                                Rate: ₵{service.rate}/1K • Qty: {service.min_quantity}-{service.max_quantity}
                              </p>
                              {service.smmgen_service_id && (
                                <p className="text-xs text-gray-500 mt-1">
                                  SMMGen ID: {service.smmgen_service_id}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                onClick={() => setEditingService(service)}
                                variant="outline"
                                size="sm"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                onClick={() => handleDeleteService(service.id)}
                                variant="destructive"
                                size="sm"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <div className="glass p-4 sm:p-6 rounded-3xl">
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">All Users</h2>
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Search users..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="space-y-4">
                {filteredUsers.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">No users found</p>
                ) : (
                  filteredUsers.map((u) => (
                    <div key={u.id} className="bg-white/50 p-4 rounded-xl">
                      {editingUser?.id === u.id ? (
                        <UserEditForm 
                          user={u} 
                          onSave={(updates) => handleUpdateUser(u.id, updates)}
                          onCancel={() => setEditingUser(null)}
                        />
                      ) : (
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{u.name}</p>
                            <p className="text-sm text-gray-600">{u.email}</p>
                            <p className="text-xs text-gray-500">
                              Joined: {new Date(u.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                            <div className="text-right">
                              <p className="font-medium text-gray-900">₵{u.balance.toFixed(2)}</p>
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                              }`}>
                                {u.role}
                              </span>
                            </div>
                            <Button
                              onClick={() => setEditingUser(u)}
                              variant="outline"
                              size="sm"
                            >
                              <Edit className="w-4 h-4 mr-2" />
                              Edit
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          {/* Transactions Tab */}
          <TabsContent value="transactions">
            <div className="glass p-4 sm:p-6 rounded-3xl">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">All Transactions</h2>
              <div className="space-y-4">
                {allTransactions.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">No transactions found</p>
                ) : (
                  allTransactions.map((transaction) => (
                    <div key={transaction.id} className="bg-white/50 p-4 rounded-xl">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              transaction.type === 'deposit' 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {transaction.type}
                            </span>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              transaction.status === 'approved' 
                                ? 'bg-green-100 text-green-700'
                                : transaction.status === 'pending'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {transaction.status}
                            </span>
                          </div>
                          <p className="font-medium text-gray-900">Amount: ₵{transaction.amount.toFixed(2)}</p>
                          <p className="text-sm text-gray-600">
                            User: {transaction.profiles?.name || transaction.profiles?.email || transaction.user_id.slice(0, 8)}
                          </p>
                          <p className="text-xs text-gray-500">{new Date(transaction.created_at).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          {/* Support Tickets Tab */}
          <TabsContent value="support">
            <div className="glass p-4 sm:p-6 rounded-3xl">
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Support Tickets</h2>
                <Select value={ticketStatusFilter} onValueChange={setTicketStatusFilter}>
                  <SelectTrigger className="w-full sm:w-48">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {filteredTickets.length === 0 ? (
                <p className="text-gray-600 text-center py-8">No support tickets found</p>
              ) : (
                <div className="space-y-4">
                  {filteredTickets.map((ticket) => {
                    const statusConfig = {
                      open: { label: 'Open', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
                      in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700', icon: Clock },
                      resolved: { label: 'Resolved', color: 'bg-green-100 text-green-700', icon: CheckCircle },
                      closed: { label: 'Closed', color: 'bg-gray-100 text-gray-700', icon: XCircle }
                    };
                    const status = statusConfig[ticket.status] || statusConfig.open;
                    const StatusIcon = status.icon;

                    return (
                      <div key={ticket.id} className="bg-white/50 p-4 sm:p-6 rounded-xl">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${status.color}`}>
                                <StatusIcon className="w-3 h-3" />
                                {status.label}
                              </span>
                              <span className="text-xs text-gray-500">ID: {ticket.id.slice(0, 8)}</span>
                            </div>
                            <p className="font-medium text-gray-900 mb-1">
                              {ticket.profiles?.name || ticket.name} ({ticket.profiles?.email || ticket.email})
                            </p>
                            {ticket.order_id && (
                              <p className="text-sm text-gray-600 mb-1">
                                Order ID: <span className="font-mono">{ticket.order_id}</span>
                              </p>
                            )}
                            <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{ticket.message}</p>
                            {ticket.admin_response && (
                              <div className="mt-3 p-3 bg-indigo-50 rounded-lg">
                                <p className="text-xs font-medium text-indigo-900 mb-1">Admin Response:</p>
                                <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.admin_response}</p>
                              </div>
                            )}
                            <p className="text-xs text-gray-500 mt-2">
                              Created: {new Date(ticket.created_at).toLocaleString()}
                              {ticket.updated_at !== ticket.created_at && (
                                <> • Updated: {new Date(ticket.updated_at).toLocaleString()}</>
                              )}
                            </p>
                          </div>
                          <div className="flex flex-col sm:flex-row gap-2">
                            {editingTicket === ticket.id ? (
                              <div className="flex flex-col gap-2 w-full sm:w-64">
                                <Select
                                  value={ticket.status}
                                  onValueChange={(value) => handleUpdateTicketStatus(ticket.id, value)}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="open">Open</SelectItem>
                                    <SelectItem value="in_progress">In Progress</SelectItem>
                                    <SelectItem value="resolved">Resolved</SelectItem>
                                    <SelectItem value="closed">Closed</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Textarea
                                  placeholder="Add your response..."
                                  value={ticketResponse}
                                  onChange={(e) => setTicketResponse(e.target.value)}
                                  className="min-h-[100px]"
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleAddTicketResponse(ticket.id)}
                                    className="flex-1"
                                  >
                                    <Send className="w-4 h-4 mr-1" />
                                    Send Response
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setEditingTicket(null);
                                      setTicketResponse('');
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setEditingTicket(ticket.id);
                                  setTicketResponse(ticket.admin_response || '');
                                }}
                                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                              >
                                <Edit className="w-4 h-4 mr-1" />
                                Respond
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Balance Adjustment Tab */}
          <TabsContent value="balance">
            <div className="glass p-4 sm:p-8 rounded-3xl max-w-2xl">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Manual Balance Adjustment</h2>
              <div className="space-y-5">
                <div>
                  <Label>Select User</Label>
                  <Select 
                    value={balanceAdjustment.userId} 
                    onValueChange={(value) => setBalanceAdjustment({ ...balanceAdjustment, userId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a user" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name} ({u.email}) - Current: ₵{u.balance.toFixed(2)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Adjustment Type</Label>
                  <Select 
                    value={balanceAdjustment.type} 
                    onValueChange={(value) => setBalanceAdjustment({ ...balanceAdjustment, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="add">Add Balance</SelectItem>
                      <SelectItem value="subtract">Subtract Balance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Amount (₵)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={balanceAdjustment.amount}
                    onChange={(e) => setBalanceAdjustment({ ...balanceAdjustment, amount: e.target.value })}
                    required
                  />
                </div>
                <Button
                  onClick={handleAdjustBalance}
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white py-6 rounded-full"
                >
                  {balanceAdjustment.type === 'add' ? <Plus className="w-4 h-4 mr-2" /> : <Minus className="w-4 h-4 mr-2" />}
                  {balanceAdjustment.type === 'add' ? 'Add' : 'Subtract'} Balance
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

// User Edit Form Component
const UserEditForm = ({ user, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    name: user.name,
    email: user.email,
    role: user.role,
    balance: user.balance
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Name</Label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>
      <div>
        <Label>Email</Label>
        <Input
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          required
        />
      </div>
      <div>
        <Label>Role</Label>
        <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Balance (₵)</Label>
        <Input
          type="number"
          step="0.01"
          value={formData.balance}
          onChange={(e) => setFormData({ ...formData, balance: parseFloat(e.target.value) })}
          required
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm">Save</Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
};

// Service Edit Form Component
const ServiceEditForm = ({ service, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    platform: service.platform,
    service_type: service.service_type,
    name: service.name,
    rate: service.rate,
    min_quantity: service.min_quantity,
    max_quantity: service.max_quantity,
    description: service.description || '',
    smmgen_service_id: service.smmgen_service_id || ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...formData,
      rate: parseFloat(formData.rate),
      min_quantity: parseInt(formData.min_quantity),
      max_quantity: parseInt(formData.max_quantity),
      smmgen_service_id: formData.smmgen_service_id || null
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label>Platform</Label>
          <Select value={formData.platform} onValueChange={(value) => setFormData({ ...formData, platform: value })}>
            <SelectTrigger>
              <SelectValue />
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
            value={formData.service_type}
            onChange={(e) => setFormData({ ...formData, service_type: e.target.value })}
            required
          />
        </div>
      </div>
      <div>
        <Label>Service Name</Label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <Label>Rate (per 1000)</Label>
          <Input
            type="number"
            step="0.01"
            value={formData.rate}
            onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
            required
          />
        </div>
        <div>
          <Label>Min Quantity</Label>
          <Input
            type="number"
            value={formData.min_quantity}
            onChange={(e) => setFormData({ ...formData, min_quantity: e.target.value })}
            required
          />
        </div>
        <div>
          <Label>Max Quantity</Label>
          <Input
            type="number"
            value={formData.max_quantity}
            onChange={(e) => setFormData({ ...formData, max_quantity: e.target.value })}
            required
          />
        </div>
      </div>
      <div>
        <Label>Description</Label>
        <Input
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </div>
      <div>
        <Label>SMMGen Service ID</Label>
        <Input
          placeholder="SMMGen API service ID (optional)"
          value={formData.smmgen_service_id}
          onChange={(e) => setFormData({ ...formData, smmgen_service_id: e.target.value })}
        />
        <p className="text-xs text-gray-500 mt-1">Enter the SMMGen API service ID for integration</p>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm">Save</Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
};

export default AdminDashboard;
