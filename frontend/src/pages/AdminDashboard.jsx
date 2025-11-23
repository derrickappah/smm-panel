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
  Download, RefreshCw, MessageSquare, Send, Layers
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
    smmgen_service_id: '',
    is_combo: false,
    combo_service_ids: [],
    combo_smmgen_service_ids: [],
    seller_only: false
  });

  useEffect(() => {
    fetchAllData();

    // Subscribe to real-time updates for transactions (deposits)
    // Listen to ALL transaction changes, then filter in callback for better reliability
    const transactionsChannel = supabase
      .channel('admin-transactions-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all changes (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'transactions'
        },
        (payload) => {
          // Only process deposit transactions
          const isDeposit = payload.new?.type === 'deposit' || payload.old?.type === 'deposit';
          if (isDeposit) {
            console.log('Deposit transaction change detected:', {
              eventType: payload.eventType,
              id: payload.new?.id || payload.old?.id,
              oldStatus: payload.old?.status,
              newStatus: payload.new?.status
            });
            // Refresh deposits when transaction status changes
            // Use setTimeout to debounce rapid updates
            setTimeout(() => {
              console.log('Refreshing deposits after transaction change...');
              fetchAllData();
            }, 200);
          }
        }
      )
      .subscribe((status) => {
        console.log('Transaction subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to transaction changes');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('⚠️ Real-time subscription issue, status:', status);
          console.log('Will rely on manual refresh and periodic polling');
        }
      });

    // Set up periodic polling as backup (every 20 seconds)
    // This ensures updates even if real-time fails
    const pollInterval = setInterval(() => {
      console.log('Periodic refresh: checking for deposit updates...');
      fetchAllData();
    }, 20000); // Poll every 20 seconds as backup

    // Cleanup subscription and polling on unmount
    return () => {
      console.log('Cleaning up transaction subscription and polling');
      supabase.removeChannel(transactionsChannel);
      clearInterval(pollInterval);
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

      const [usersRes, ordersRes, depositsRes, transactionsRes, servicesRes, ticketsRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('orders').select('*, services(name, platform)').order('created_at', { ascending: false }),
        supabase.from('transactions').select('*, profiles(email, name)').eq('type', 'deposit').order('created_at', { ascending: false }),
        supabase.from('transactions').select('*, profiles(email, name)').order('created_at', { ascending: false }),
        supabase.from('services').select('*').order('created_at', { ascending: false }),
        supabase.from('support_tickets').select('*, profiles(name, email)').order('created_at', { ascending: false })
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

      // Update state with fetched data (always update even if some queries failed)
      // This ensures UI reflects the latest data immediately
      if (usersRes.data) setUsers(usersRes.data);
      if (ordersRes.data) setOrders(ordersRes.data);
      if (depositsRes.data) setDeposits(depositsRes.data);
      if (transactionsRes.data) setAllTransactions(transactionsRes.data);
      if (servicesRes.data) setServices(servicesRes.data);
      if (ticketsRes.data) setSupportTickets(ticketsRes.data);

      // Calculate enhanced stats using current data
      const currentDeposits = depositsRes.data || deposits;
      const currentOrders = ordersRes.data || orders;
      const currentTickets = ticketsRes.data || supportTickets;
      
      const pendingDeposits = currentDeposits.filter(d => d.status === 'pending').length;
      const confirmedDeposits = currentDeposits.filter(d => d.status === 'approved').length;
      const completedOrders = currentOrders.filter(o => o.status === 'completed').length;
      const openTickets = currentTickets.filter(t => t.status === 'open').length;
      const totalRevenue = currentOrders
        .filter(o => o.status === 'completed')
        .reduce((sum, o) => sum + parseFloat(o.total_cost || 0), 0);
      const totalDeposits = currentDeposits
        .filter(d => d.status === 'approved')
        .reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);

      setStats({
        total_users: (usersRes.data || users).length,
        total_orders: currentOrders.length,
        pending_deposits: pendingDeposits,
        total_revenue: totalRevenue,
        completed_orders: completedOrders,
        total_services: (servicesRes.data || services).length,
        confirmed_deposits: confirmedDeposits,
        total_deposits: totalDeposits,
        open_tickets: openTickets
      });

      // Show warning if only seeing own data
      if (usersRes.data && usersRes.data.length === 1 && usersRes.data[0].id === currentUser.user.id) {
        toast.warning('Only seeing your own data. RLS policies may need to be updated. Run database/fixes/FIX_ADMIN_RLS.sql in Supabase.');
      }
      
      console.log('Admin data refreshed successfully');
    } catch (error) {
      console.error('Error fetching admin data:', error);
      toast.error(error.message || 'Failed to load admin data. Check RLS policies.');
      // Don't clear existing data on error - keep showing what we have
    } finally {
      setRefreshing(false);
    }
  };

  // User Management Functions
  const handleUpdateUser = async (userId, updates) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        console.error('Error updating user:', error);
        throw error;
      }

      if (!data) {
        throw new Error('Update succeeded but no data returned');
      }

      console.log('User updated successfully:', data);
      toast.success('User updated successfully!');
      setEditingUser(null);
      
      // Wait a moment for database to sync, then refresh
      await new Promise(resolve => setTimeout(resolve, 300));
      await fetchAllData();
    } catch (error) {
      console.error('Failed to update user:', error);
      toast.error(error.message || 'Failed to update user');
    } finally {
      setLoading(false);
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
      const { data, error } = await supabase.from('services').insert({
        platform: serviceForm.platform,
        service_type: serviceForm.service_type,
        name: serviceForm.name,
        rate: parseFloat(serviceForm.rate),
        min_quantity: parseInt(serviceForm.min_quantity),
        max_quantity: parseInt(serviceForm.max_quantity),
        description: serviceForm.description,
        smmgen_service_id: serviceForm.smmgen_service_id || null,
        is_combo: serviceForm.is_combo || false,
        combo_service_ids: serviceForm.is_combo && serviceForm.combo_service_ids.length > 0 
          ? serviceForm.combo_service_ids 
          : null,
        combo_smmgen_service_ids: serviceForm.is_combo && serviceForm.combo_smmgen_service_ids.length > 0
          ? serviceForm.combo_smmgen_service_ids
          : null,
        seller_only: serviceForm.seller_only || false
      }).select().single();

      if (error) {
        console.error('Error creating service:', error);
        throw error;
      }

      if (!data) {
        throw new Error('Service created but no data returned');
      }

      console.log('Service created successfully:', data);
      toast.success('Service created successfully!');
      setServiceForm({
        platform: '',
        service_type: '',
        name: '',
        rate: '',
        min_quantity: '',
        max_quantity: '',
        description: '',
        smmgen_service_id: '',
        is_combo: false,
        combo_service_ids: [],
        combo_smmgen_service_ids: [],
        seller_only: false
      });
      
      // Wait a moment for database to sync, then refresh
      await new Promise(resolve => setTimeout(resolve, 300));
      await fetchAllData();
    } catch (error) {
      console.error('Failed to create service:', error);
      toast.error(error.message || 'Failed to create service');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateService = async (serviceId, updates) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('services')
        .update(updates)
        .eq('id', serviceId)
        .select()
        .single();

      if (error) {
        console.error('Error updating service:', error);
        
        // Check for specific error types
        if (error.code === '42501') {
          // Permission denied (RLS policy issue)
          toast.error('Permission denied. Please ensure RLS policies allow admins to update services.');
        } else {
          throw error;
        }
        return;
      }

      if (!data) {
        throw new Error('Update succeeded but no data returned');
      }

      console.log('Service updated successfully:', data);
      toast.success('Service updated successfully!');
      setEditingService(null);
      
      // Update local state immediately for better UX
      setServices(prevServices => 
        prevServices.map(s => s.id === serviceId ? { ...s, ...data } : s)
      );
      
      // Wait a moment for database to sync, then refresh all data
      await new Promise(resolve => setTimeout(resolve, 300));
      await fetchAllData();
    } catch (error) {
      console.error('Failed to update service:', error);
      toast.error(error.message || 'Failed to update service. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteService = async (serviceId) => {
    setLoading(true);
    try {
      // Check if there are any orders using this service (for warning only)
      const { data: ordersUsingService, error: checkError } = await supabase
        .from('orders')
        .select('id')
        .eq('service_id', serviceId);

      let orderCount = 0;
      if (!checkError && ordersUsingService) {
        orderCount = ordersUsingService.length;
      }

      // Show warning if orders exist, but allow deletion (CASCADE will handle it)
      if (orderCount > 0) {
        const confirmMessage = `Warning: This service has ${orderCount} order${orderCount === 1 ? '' : 's'} associated with it. Deleting this service will also delete all associated orders. Are you sure you want to continue?`;
        if (!confirm(confirmMessage)) {
          setLoading(false);
          return;
        }
      } else {
        // Standard confirmation if no orders
        if (!confirm('Are you sure you want to delete this service? This action cannot be undone.')) {
          setLoading(false);
          return;
        }
      }

      // Attempt to delete the service (CASCADE will automatically delete related orders)
      const { data: deletedData, error } = await supabase
        .from('services')
        .delete()
        .eq('id', serviceId)
        .select();

      if (error) {
        console.error('Error deleting service:', error);
        
        // Check for specific error types
        if (error.code === '23503') {
          // Foreign key constraint violation
          toast.error('Cannot delete service: It is being used by existing orders. Please contact support.');
        } else if (error.code === '42501') {
          // Permission denied (RLS policy issue)
          toast.error('Permission denied. Please ensure RLS policies allow admins to delete services.');
        } else {
          throw error;
        }
        return;
      }

      // Verify deletion succeeded
      if (!deletedData || deletedData.length === 0) {
        // Check if service still exists
        const { data: stillExists } = await supabase
          .from('services')
          .select('id')
          .eq('id', serviceId)
          .maybeSingle();

        if (stillExists) {
          throw new Error('Service deletion failed - service still exists. This may be a permission issue.');
        } else {
          // Service was deleted (no data returned is normal for DELETE)
          console.log('Service deleted successfully (no data returned, which is normal)');
        }
      } else {
        console.log('Service deleted successfully:', deletedData[0]);
      }

      toast.success('Service deleted successfully!');
      
      // Remove from local state immediately for better UX
      setServices(prevServices => prevServices.filter(s => s.id !== serviceId));
      
      // Wait a moment for database to sync, then refresh all data
      await new Promise(resolve => setTimeout(resolve, 300));
      await fetchAllData();
    } catch (error) {
      console.error('Failed to delete service:', error);
      toast.error(error.message || 'Failed to delete service. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  // Order Management Functions
  const handleOrderStatusUpdate = async (orderId, status) => {
    setLoading(true);
    try {
      const updateData = { status };
      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', orderId)
        .select()
        .single();

      if (error) {
        console.error('Error updating order status:', error);
        throw error;
      }

      if (!data) {
        throw new Error('Update succeeded but no data returned');
      }

      console.log('Order status updated successfully:', data);
      toast.success('Order status updated!');
      
      // Wait a moment for database to sync, then refresh
      await new Promise(resolve => setTimeout(resolve, 300));
      await fetchAllData();
    } catch (error) {
      console.error('Failed to update order status:', error);
      toast.error(error.message || 'Failed to update order status');
    } finally {
      setLoading(false);
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
      await new Promise(resolve => setTimeout(resolve, 300));
      await fetchAllData();
    } catch (error) {
      console.error('Error processing refund:', error);
      toast.error(error.message || 'Failed to refund order. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  // Support Ticket Management Functions
  const handleUpdateTicketStatus = async (ticketId, newStatus) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .update({ status: newStatus })
        .eq('id', ticketId)
        .select()
        .single();

      if (error) {
        console.error('Error updating ticket status:', error);
        throw error;
      }

      if (!data) {
        throw new Error('Update succeeded but no data returned');
      }

      console.log('Ticket status updated successfully:', data);
      toast.success('Ticket status updated!');
      setEditingTicket(null);
      
      // Wait a moment for database to sync, then refresh
      await new Promise(resolve => setTimeout(resolve, 300));
      await fetchAllData();
    } catch (error) {
      console.error('Failed to update ticket status:', error);
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
      
      // Get ticket details to send email
      const ticket = supportTickets.find(t => t.id === ticketId);
      if (!ticket) {
        throw new Error('Ticket not found');
      }

      // Update ticket in database
      const { data, error } = await supabase
        .from('support_tickets')
        .update({ 
          admin_response: ticketResponse,
          status: 'in_progress' // Auto-update status when admin responds
        })
        .eq('id', ticketId)
        .select()
        .single();

      if (error) {
        console.error('Error updating ticket response:', error);
        throw error;
      }

      if (!data) {
        throw new Error('Update succeeded but no data returned');
      }

      console.log('Ticket response updated successfully:', data);

      // Clear the response input
      setTicketResponse('');
      setEditingTicket(null);
      
      // Wait a moment for database to sync, then refresh
      await new Promise(resolve => setTimeout(resolve, 300));
      await fetchAllData();

      // Send email to user (if email service is configured)
      try {
        const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
        if (isProduction) {
          // Send email via serverless function
          const emailResponse = await fetch('/api/send-support-email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              to: ticket.profiles?.email || ticket.email,
              subject: `Re: Support Ticket #${ticketId.slice(0, 8)} - ${ticket.profiles?.name || ticket.name}`,
              message: ticketResponse,
              ticketId: ticketId.slice(0, 8),
              userName: ticket.profiles?.name || ticket.name
            })
          });

          if (!emailResponse.ok) {
            console.warn('Failed to send email, but response was saved');
          }
        }
      } catch (emailError) {
        // Don't fail the response if email fails
        console.warn('Email sending failed (non-critical):', emailError);
      }

      toast.success('Response added and sent to user!');
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
    u.email?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.phone_number?.toLowerCase().includes(userSearch.toLowerCase())
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
                  
                  {/* Combo Service Options */}
                  <div className="space-y-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="is_combo"
                        checked={serviceForm.is_combo}
                        onChange={(e) => setServiceForm({ ...serviceForm, is_combo: e.target.checked })}
                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      />
                      <Label htmlFor="is_combo" className="text-sm font-medium text-gray-900">
                        This is a combo service (combines multiple services)
                      </Label>
                    </div>
                    
                    {serviceForm.is_combo && (
                      <div className="space-y-3 mt-3">
                        <div>
                          <Label className="text-sm font-medium">Component Services</Label>
                          <p className="text-xs text-gray-500 mb-2">Select the services to include in this combo</p>
                          <div className="max-h-40 overflow-y-auto border border-gray-200 rounded p-2 bg-white">
                            {services.filter(s => !s.is_combo).map((service) => (
                              <div key={service.id} className="flex items-center space-x-2 py-1">
                                <input
                                  type="checkbox"
                                  checked={serviceForm.combo_service_ids?.includes(service.id)}
                                  onChange={(e) => {
                                    const currentIds = serviceForm.combo_service_ids || [];
                                    if (e.target.checked) {
                                      setServiceForm({
                                        ...serviceForm,
                                        combo_service_ids: [...currentIds, service.id]
                                      });
                                    } else {
                                      setServiceForm({
                                        ...serviceForm,
                                        combo_service_ids: currentIds.filter(id => id !== service.id)
                                      });
                                    }
                                  }}
                                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                />
                                <Label className="text-sm text-gray-700">
                                  {service.name} ({service.platform})
                                </Label>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        <div>
                          <Label className="text-sm font-medium">SMMGen Service IDs (comma-separated)</Label>
                          <Input
                            placeholder="123, 456 (one for each component service)"
                            value={serviceForm.combo_smmgen_service_ids?.join(', ') || ''}
                            onChange={(e) => {
                              const ids = e.target.value.split(',').map(id => id.trim()).filter(id => id);
                              setServiceForm({ ...serviceForm, combo_smmgen_service_ids: ids });
                            }}
                            className="mt-1"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Enter SMMGen service IDs in the same order as component services
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Seller-Only Service Option */}
                  <div className="flex items-center space-x-2 p-4 border border-gray-200 rounded-lg bg-yellow-50">
                    <input
                      type="checkbox"
                      id="seller_only"
                      checked={serviceForm.seller_only}
                      onChange={(e) => setServiceForm({ ...serviceForm, seller_only: e.target.checked })}
                      className="w-4 h-4 text-yellow-600 border-gray-300 rounded focus:ring-yellow-500"
                    />
                    <Label htmlFor="seller_only" className="text-sm font-medium text-gray-900">
                      Seller-only service (only visible to users with seller or admin role)
                    </Label>
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
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-gray-900">{service.name}</p>
                                {service.is_combo && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                                    <Layers className="w-3 h-3" />
                                    Combo
                                  </span>
                                )}
                                {service.seller_only && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
                                    Seller Only
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-600">
                                {service.platform} • {service.service_type}
                              </p>
                              <p className="text-sm text-gray-600">
                                Rate: ₵{service.rate}/1K • Qty: {service.min_quantity}-{service.max_quantity}
                              </p>
                              {service.is_combo && service.combo_service_ids && (
                                <p className="text-xs text-purple-600 mt-1">
                                  Includes {service.combo_service_ids.length} service{service.combo_service_ids.length !== 1 ? 's' : ''}
                                </p>
                              )}
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
                            {u.phone_number && (
                              <p className="text-sm text-gray-600">📱 {u.phone_number}</p>
                            )}
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
    phone_number: user.phone_number || '',
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
        <Label>Phone Number</Label>
        <Input
          type="tel"
          placeholder="+233 XX XXX XXXX"
          value={formData.phone_number}
          onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
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
            <SelectItem value="seller">Seller</SelectItem>
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
    smmgen_service_id: service.smmgen_service_id || '',
    is_combo: service.is_combo || false,
    combo_service_ids: service.combo_service_ids || [],
    combo_smmgen_service_ids: service.combo_smmgen_service_ids || [],
    seller_only: service.seller_only || false
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...formData,
      rate: parseFloat(formData.rate),
      min_quantity: parseInt(formData.min_quantity),
      max_quantity: parseInt(formData.max_quantity),
      smmgen_service_id: formData.smmgen_service_id || null,
      is_combo: formData.is_combo || false,
      combo_service_ids: formData.is_combo && formData.combo_service_ids.length > 0 
        ? formData.combo_service_ids 
        : null,
      combo_smmgen_service_ids: formData.is_combo && formData.combo_smmgen_service_ids.length > 0
        ? formData.combo_smmgen_service_ids
        : null,
      seller_only: formData.seller_only || false
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
      <div className="flex items-center space-x-2 p-3 border border-gray-200 rounded-lg bg-yellow-50">
        <input
          type="checkbox"
          id="edit_seller_only"
          checked={formData.seller_only}
          onChange={(e) => setFormData({ ...formData, seller_only: e.target.checked })}
          className="w-4 h-4 text-yellow-600 border-gray-300 rounded focus:ring-yellow-500"
        />
        <Label htmlFor="edit_seller_only" className="text-sm font-medium text-gray-900">
          Seller-only service
        </Label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm">Save</Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
};

export default AdminDashboard;
