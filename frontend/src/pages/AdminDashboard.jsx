import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { processManualRefund } from '@/lib/refunds';
import { saveOrderStatusHistory } from '@/lib/orderStatusHistory';
import { getSMMGenOrderStatus } from '@/lib/smmgen';
import Navbar from '@/components/Navbar';
import { 
  Users, ShoppingCart, DollarSign, Package, Search, Edit, Trash2, 
  Plus, Minus, TrendingUp, CheckCircle, XCircle, Clock, Filter,
  Download, RefreshCw, MessageSquare, Send, Layers, Wallet, Receipt, HelpCircle,
  AlertCircle, BarChart3, Activity, FileText, Settings, Bell, Power, PowerOff
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
    open_tickets: 0,
    users_today: 0,
    orders_today: 0,
    deposits_today: 0,
    revenue_today: 0,
    processing_orders: 0,
    cancelled_orders: 0,
    failed_orders: 0,
    refunded_orders: 0,
    failed_refunds: 0,
    total_deposits_amount: 0,
    total_revenue_amount: 0,
    average_order_value: 0,
    total_transactions: 0,
    rejected_deposits: 0,
    in_progress_tickets: 0,
    resolved_tickets: 0
  });
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]);
  const [services, setServices] = useState([]);
  const [supportTickets, setSupportTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [manuallyCrediting, setManuallyCrediting] = useState(null);
  const [approvingDeposit, setApprovingDeposit] = useState(null);
  const [balanceCheckResults, setBalanceCheckResults] = useState({});
  const [checkingBalances, setCheckingBalances] = useState(false);
  const [userProfiles, setUserProfiles] = useState({});
  // Payment method settings
  const [paymentMethodSettings, setPaymentMethodSettings] = useState({
    paystack_enabled: true,
    manual_enabled: true,
    hubtel_enabled: true
  });
  
  // Search and filter states
  const [userSearch, setUserSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [serviceSearch, setServiceSearch] = useState('');
  
  // Pagination states
  const [depositsPage, setDepositsPage] = useState(1);
  const depositsPerPage = 20;
  const [ordersPage, setOrdersPage] = useState(1);
  const ordersPerPage = 20;
  const [usersPage, setUsersPage] = useState(1);
  const usersPerPage = 20;
  const [transactionsPage, setTransactionsPage] = useState(1);
  const transactionsPerPage = 20;
  const [ticketsPage, setTicketsPage] = useState(1);
  const ticketsPerPage = 20;
  const [balancePage, setBalancePage] = useState(1);
  const balancePerPage = 20;
  
  // Deposit search state
  const [depositSearch, setDepositSearch] = useState('');
  const [depositDateFilter, setDepositDateFilter] = useState('');
  
  // Order search state
  const [orderDateFilter, setOrderDateFilter] = useState('');
  
  // User search state
  const [userDateFilter, setUserDateFilter] = useState('');
  
  // Transaction search state
  const [transactionSearch, setTransactionSearch] = useState('');
  const [transactionDateFilter, setTransactionDateFilter] = useState('');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState('all');
  const [transactionStatusFilter, setTransactionStatusFilter] = useState('all');
  
  // Ticket search state
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketDateFilter, setTicketDateFilter] = useState('');
  
  // Balance search state
  const [balanceListSearch, setBalanceListSearch] = useState('');
  const [balanceDateFilter, setBalanceDateFilter] = useState('');
  
  // Edit states
  const [editingUser, setEditingUser] = useState(null);
  const [editingService, setEditingService] = useState(null);
  const [balanceAdjustment, setBalanceAdjustment] = useState({ userId: '', amount: '', type: 'add' });
  const [balanceUserSearch, setBalanceUserSearch] = useState('');
  const [balanceUserDropdownOpen, setBalanceUserDropdownOpen] = useState(false);
  
  // Active section state (for sidebar navigation)
  const [activeSection, setActiveSection] = useState('dashboard');
  
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
    seller_only: false,
    enabled: true
  });

  useEffect(() => {
    fetchAllData(true); // Check SMMGen status on initial load

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
              fetchAllData(false); // Skip SMMGen status check on transaction updates
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
      fetchAllData(false); // Skip SMMGen status check on periodic refresh
    }, 20000); // Poll every 20 seconds as backup

    // Cleanup subscription and polling on unmount
    return () => {
      console.log('Cleaning up transaction subscription and polling');
      supabase.removeChannel(transactionsChannel);
      clearInterval(pollInterval);
    };
  }, []);

  const fetchAllData = async (checkSMMGenStatus = false) => {
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

      const [usersRes, ordersRes, depositsRes, transactionsRes, servicesRes, ticketsRes, settingsRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        supabase.from('orders').select('*, services(name, platform), profiles(name, email, phone_number)').order('created_at', { ascending: false }),
        supabase.from('transactions').select('*, profiles(email, name, phone_number)').eq('type', 'deposit').order('created_at', { ascending: false }),
        supabase.from('transactions').select('*, profiles(email, name, balance)').order('created_at', { ascending: false }),
        supabase.from('services').select('*').order('created_at', { ascending: false }),
        supabase.from('support_tickets').select('*, profiles(name, email)').order('created_at', { ascending: false }),
        supabase.from('app_settings').select('*').in('key', ['payment_method_paystack_enabled', 'payment_method_manual_enabled', 'payment_method_hubtel_enabled'])
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

      // Map SMMGen status to our status format
      const mapSMMGenStatus = (smmgenStatus) => {
        if (!smmgenStatus) return null;
        
        const statusString = String(smmgenStatus).trim();
        const statusLower = statusString.toLowerCase();
        
        // Map to exact SMMGen statuses (normalized to lowercase)
        if (statusLower === 'pending' || statusLower.includes('pending')) {
          return 'pending';
        }
        if (statusLower === 'in progress' || statusLower.includes('in progress')) {
          return 'in progress';
        }
        if (statusLower === 'completed' || statusLower.includes('completed')) {
          return 'completed';
        }
        if (statusLower === 'partial' || statusLower.includes('partial')) {
          return 'partial';
        }
        if (statusLower === 'processing' || statusLower.includes('processing')) {
          return 'processing';
        }
        if (statusLower === 'canceled' || statusLower === 'cancelled' || statusLower.includes('cancel')) {
          return 'canceled';
        }
        if (statusLower === 'refunds' || statusLower.includes('refund')) {
          return 'refunds';
        }
        
        return null;
      };

      // Check and update order statuses from SMMGen for orders that aren't completed
      // Only check if explicitly requested (on initial load or manual refresh)
      let finalOrders = ordersRes.data || [];
      if (checkSMMGenStatus && ordersRes.data && ordersRes.data.length > 0) {
        const updatedOrders = await Promise.all(
          ordersRes.data.map(async (order) => {
            // Check SMMGen status for orders that have SMMGen IDs and aren't completed or refunded
            // Skip refunded orders - they should not be overwritten by SMMGen status
            if (order.smmgen_order_id && order.status !== 'completed' && order.status !== 'refunded') {
              try {
                const statusData = await getSMMGenOrderStatus(order.smmgen_order_id);
                const smmgenStatus = statusData.status || statusData.Status;
                const mappedStatus = mapSMMGenStatus(smmgenStatus);

                // Update in database if status changed
                if (mappedStatus && mappedStatus !== order.status) {
                  // Save status to history first
                  await saveOrderStatusHistory(
                    order.id,
                    mappedStatus,
                    'smmgen',
                    statusData, // Full SMMGen response
                    order.status // Previous status
                  );

                  // Update order status in Supabase
                  await supabase
                    .from('orders')
                    .update({ 
                      status: mappedStatus,
                      completed_at: mappedStatus === 'completed' ? new Date().toISOString() : order.completed_at
                    })
                    .eq('id', order.id);
                  
                  // Return updated order
                  return { ...order, status: mappedStatus };
                }
              } catch (error) {
                console.warn('Failed to check SMMGen status for order:', order.id, error);
                // Continue with original order if check fails
              }
            }
            
            return order;
          })
        );

        // Use updated orders for stats calculation
        finalOrders = updatedOrders;
        // Update state with updated orders
        // Debug: Log first order to check smmgen_order_id field
        if (updatedOrders.length > 0) {
          console.log('Sample updated order data:', updatedOrders[0]);
          console.log('SMMGen order ID:', updatedOrders[0].smmgen_order_id);
          console.log('Full order object keys:', Object.keys(updatedOrders[0]));
        }
        setOrders(updatedOrders);
      } else {
        // Debug: Log first order to check smmgen_order_id field
        if (ordersRes.data && ordersRes.data.length > 0) {
          console.log('Sample order data (no updates):', ordersRes.data[0]);
          console.log('SMMGen order ID:', ordersRes.data[0].smmgen_order_id);
        }
        setOrders(ordersRes.data || []);
      }

      // Update state with fetched data (always update even if some queries failed)
      // This ensures UI reflects the latest data immediately
      if (usersRes.data) setUsers(usersRes.data);
      if (depositsRes.data) setDeposits(depositsRes.data);
      if (transactionsRes.data) {
        setAllTransactions(transactionsRes.data);
        // Build user profiles map for balance checking
        const profilesMap = {};
        transactionsRes.data.forEach(transaction => {
          if (transaction.profiles) {
            profilesMap[transaction.user_id] = transaction.profiles;
          }
        });
        setUserProfiles(profilesMap);
      }
      if (servicesRes.data) setServices(servicesRes.data);
      if (ticketsRes.data) setSupportTickets(ticketsRes.data);
      
      // Process payment method settings
      if (settingsRes && !settingsRes.error && settingsRes.data) {
        const settings = {};
        settingsRes.data.forEach(setting => {
          settings[setting.key] = setting.value === 'true';
        });
        setPaymentMethodSettings({
          paystack_enabled: settings.payment_method_paystack_enabled !== false, // Default to true
          manual_enabled: settings.payment_method_manual_enabled !== false, // Default to true
          hubtel_enabled: settings.payment_method_hubtel_enabled !== false // Default to true
        });
      }

      // Calculate enhanced stats using current data (use updated orders with SMMGen statuses)
      const currentDeposits = depositsRes.data || [];
      const currentOrders = finalOrders; // Use orders with updated SMMGen statuses
      const currentTickets = ticketsRes.data || [];
      
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

      // Calculate today's metrics
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);

      const usersToday = (usersRes.data || []).filter(u => {
        const userDate = new Date(u.created_at);
        return userDate >= today && userDate <= todayEnd;
      }).length;

      const ordersToday = currentOrders.filter(o => {
        const orderDate = new Date(o.created_at);
        return orderDate >= today && orderDate <= todayEnd;
      }).length;

      const depositsToday = currentDeposits.filter(d => {
        const depositDate = new Date(d.created_at);
        return depositDate >= today && depositDate <= todayEnd;
      }).length;

      const revenueToday = currentOrders
        .filter(o => {
          const orderDate = new Date(o.created_at);
          return orderDate >= today && orderDate <= todayEnd && o.status === 'completed';
        })
        .reduce((sum, o) => sum + parseFloat(o.total_cost || 0), 0);

      const processingOrders = currentOrders.filter(o => o.status === 'processing' || o.status === 'in progress').length;
      const cancelledOrders = currentOrders.filter(o => o.status === 'canceled' || o.status === 'cancelled').length;
      const partialOrders = currentOrders.filter(o => o.status === 'partial').length;
      const refundOrders = currentOrders.filter(o => o.status === 'refunds').length;
      // Debug: Log refunded orders calculation
      const refundedOrders = currentOrders.filter(o => {
        const isRefunded = o.refund_status === 'succeeded';
        if (isRefunded) {
          console.log('Found refunded order:', o.id, 'refund_status:', o.refund_status);
        }
        return isRefunded;
      }).length;
      console.log('Total refunded orders:', refundedOrders, 'out of', currentOrders.length, 'total orders');
      const failedRefunds = currentOrders.filter(o => o.refund_status === 'failed').length;
      const failedOrders = 0; // No "failed" status in SMMGen - using cancelled_orders instead
      const rejectedDeposits = currentDeposits.filter(d => d.status === 'rejected').length;
      const inProgressTickets = currentTickets.filter(t => t.status === 'in_progress').length;
      const resolvedTickets = currentTickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;
      const totalTransactions = (transactionsRes.data || allTransactions || []).length;
      const averageOrderValue = completedOrders > 0 ? totalRevenue / completedOrders : 0;

      setStats({
        total_users: (usersRes.data || users).length,
        total_orders: currentOrders.length,
        pending_deposits: pendingDeposits,
        total_revenue: totalRevenue,
        completed_orders: completedOrders,
        total_services: (servicesRes.data || services).length,
        confirmed_deposits: confirmedDeposits,
        total_deposits: totalDeposits,
        open_tickets: openTickets,
        users_today: usersToday,
        orders_today: ordersToday,
        deposits_today: depositsToday,
        revenue_today: revenueToday,
        processing_orders: processingOrders,
        cancelled_orders: cancelledOrders,
        failed_orders: failedOrders,
        refunded_orders: refundedOrders,
        failed_refunds: failedRefunds,
        total_deposits_amount: totalDeposits,
        total_revenue_amount: totalRevenue,
        average_order_value: averageOrderValue,
        total_transactions: totalTransactions,
        rejected_deposits: rejectedDeposits,
        in_progress_tickets: inProgressTickets,
        resolved_tickets: resolvedTickets
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
      await fetchAllData(false); // Skip SMMGen status check on updates
    } catch (error) {
      console.error('Failed to update user:', error);
      toast.error(error.message || 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  const handleAdjustBalance = async () => {
    if (!balanceAdjustment.userId || !balanceAdjustment.amount) {
      toast.error('Please search and select a user and enter an amount');
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
      
      // Create transaction record for balance adjustment
      // Use 'deposit' type for additions, 'order' type for subtractions
      await supabase.from('transactions').insert({
        user_id: balanceAdjustment.userId,
        amount: amount,
        type: balanceAdjustment.type === 'add' ? 'deposit' : 'order',
        status: 'approved'
      });

      setBalanceAdjustment({ userId: '', amount: '', type: 'add' });
      setBalanceUserSearch('');
      setBalanceUserDropdownOpen(false);
      toast.success(`Balance ${balanceAdjustment.type === 'add' ? 'added' : 'deducted'} successfully!`);
    } catch (error) {
      toast.error(error.message || 'Failed to adjust balance');
    }
  };

  // Load verified transactions from database on mount
  useEffect(() => {
    loadVerifiedTransactions();
  }, []);

  // Function to load verified transactions from database
  const loadVerifiedTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('verified_transactions')
        .select('transaction_id, verified_status');

      if (error) {
        console.warn('Failed to load verified transactions from database:', error);
        return;
      }

      if (data) {
        const verified = {};
        data.forEach(item => {
          verified[item.transaction_id] = item.verified_status;
        });
        setBalanceCheckResults(verified);
      }
    } catch (error) {
      console.warn('Error loading verified transactions:', error);
    }
  };

  // Function to save verified transaction to database
  const saveVerifiedTransaction = async (transactionId, status) => {
    try {
      // Check if already exists
      const { data: existing } = await supabase
        .from('verified_transactions')
        .select('id')
        .eq('transaction_id', transactionId)
        .maybeSingle();

      if (existing) {
        // Update existing record
        const { error } = await supabase
          .from('verified_transactions')
          .update({
            verified_status: status,
            updated_at: new Date().toISOString()
          })
          .eq('transaction_id', transactionId);

        if (error) {
          console.warn('Failed to update verified transaction:', error);
        }
      } else {
        // Insert new record
        const { data: { user: authUser } } = await supabase.auth.getUser();
        const { error } = await supabase
          .from('verified_transactions')
          .insert({
            transaction_id: transactionId,
            verified_status: status,
            verified_by: authUser?.id || null
          });

        if (error) {
          console.warn('Failed to save verified transaction:', error);
        }
      }
    } catch (error) {
      console.warn('Error saving verified transaction:', error);
    }
  };

  // For admin: Check if balance was updated after successful deposit (TRIPLE CHECK)
  const performTripleCheck = async (transaction) => {
    if (transaction.type !== 'deposit' || transaction.status !== 'approved') {
      return null;
    }

    const userProfile = userProfiles[transaction.user_id];
    if (!userProfile) {
      return 'unknown';
    }

    const transactionAmount = parseFloat(transaction.amount || 0);
    if (transactionAmount <= 0) {
      return 'unknown';
    }
    
    // TRIPLE CHECK SYSTEM
    let freshBalance = parseFloat(userProfile.balance || 0);
    const freshBalances = [];
    
    try {
      for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 150));
        const { data: freshProfile, error: freshError } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', transaction.user_id)
          .single();

        if (!freshError && freshProfile) {
          const balance = parseFloat(freshProfile.balance || 0);
          freshBalances.push(balance);
        }
      }

      if (freshBalances.length > 0) {
        freshBalance = Math.max(...freshBalances);
        userProfile.balance = freshBalance;
      }
    } catch (error) {
      console.warn('Fresh balance fetch failed:', error);
    }

    // Get all orders for this user to check refund status
    const userOrders = orders.filter(o => o.user_id === transaction.user_id);
    const refundedOrderIds = new Set(
      userOrders
        .filter(o => o.refund_status === 'succeeded')
        .map(o => o.id)
    );

    // Calculate all approved deposits
    const allApprovedDeposits = allTransactions
      .filter(t => 
        t.user_id === transaction.user_id &&
        t.type === 'deposit' &&
        t.status === 'approved'
      )
      .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    // Calculate all approved refunds (money returned to user)
    const allApprovedRefunds = allTransactions
      .filter(t =>
        t.user_id === transaction.user_id &&
        t.type === 'refund' &&
        t.status === 'approved'
      )
      .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    // Calculate orders (money spent)
    const allCompletedOrders = allTransactions
      .filter(t =>
        t.user_id === transaction.user_id &&
        t.type === 'order' &&
        t.status === 'approved'
      )
      .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    // Balance = deposits + refunds - orders
    const expectedBalanceFromTransactions = allApprovedDeposits + allApprovedRefunds - allCompletedOrders;
    const balanceWithoutThisTransaction = allApprovedDeposits + allApprovedRefunds - transactionAmount - allCompletedOrders;
    const minExpectedBalanceWithTransaction = balanceWithoutThisTransaction + transactionAmount;

    const tolerance = Math.max(0.10, expectedBalanceFromTransactions * 0.01);
    const check1Pass = freshBalance >= (expectedBalanceFromTransactions - tolerance);
    const check2Pass = freshBalance >= (minExpectedBalanceWithTransaction - tolerance);
    const significantDifference = expectedBalanceFromTransactions - freshBalance;
    const check3Pass = significantDifference <= tolerance || significantDifference <= transactionAmount * 0.5;

    const passCount = [check1Pass, check2Pass, check3Pass].filter(Boolean).length;
    
    if (passCount >= 2) {
      return 'updated';
    } else if (passCount === 1) {
      if (freshBalance >= balanceWithoutThisTransaction - tolerance) {
        return 'updated';
      }
      if (freshBalance < balanceWithoutThisTransaction - transactionAmount * 0.8) {
        return 'not_updated';
      }
      return 'updated';
    } else {
      const significantGap = expectedBalanceFromTransactions - freshBalance;
      if (significantGap > transactionAmount * 0.9) {
        return 'not_updated';
      }
      return 'updated';
    }
  };
  
  // Perform balance checks when transactions or userProfiles change
  useEffect(() => {
    if (allTransactions.length === 0 || Object.keys(userProfiles).length === 0) {
      return;
    }

    let isMounted = true;

    const performBalanceChecks = async () => {
      setCheckingBalances(true);
      
      let previouslyVerified = {};
      try {
        const { data: verifiedData, error } = await supabase
          .from('verified_transactions')
          .select('transaction_id, verified_status');

        if (!error && verifiedData) {
          verifiedData.forEach(item => {
            previouslyVerified[item.transaction_id] = item.verified_status;
          });
        }
      } catch (error) {
        console.warn('Failed to load verified transactions from database:', error);
      }
      
      const results = { ...previouslyVerified };
      
      const depositTransactions = allTransactions.filter(
        t => t.type === 'deposit' && t.status === 'approved'
      );

      for (const transaction of depositTransactions) {
        if (!isMounted) break;
        
        if (previouslyVerified[transaction.id] === 'updated') {
          continue;
        }
        
        const result = await performTripleCheck(transaction);
        if (isMounted) {
          results[transaction.id] = result;
          if (result && result !== 'checking') {
            await saveVerifiedTransaction(transaction.id, result);
          }
        }
      }
      
      if (isMounted) {
        setBalanceCheckResults(results);
        setCheckingBalances(false);
      }
    };

    performBalanceChecks();

    return () => {
      isMounted = false;
    };
  }, [allTransactions, userProfiles]);

  // Helper function to get balance check result
  const getBalanceCheckResult = (transaction) => {
    if (transaction.type !== 'deposit' || transaction.status !== 'approved') {
      return null;
    }
    return balanceCheckResults[transaction.id] || 'checking';
  };

  // For admin: Manually credit balance for a deposit
  const handleTogglePaymentMethod = async (method, enabled) => {
    try {
      let settingKey, description, stateKey, displayName;
      
      if (method === 'paystack') {
        settingKey = 'payment_method_paystack_enabled';
        description = 'Enable/disable Paystack payment method';
        stateKey = 'paystack_enabled';
        displayName = 'Paystack';
      } else if (method === 'manual') {
        settingKey = 'payment_method_manual_enabled';
        description = 'Enable/disable Manual (Mobile Money) payment method';
        stateKey = 'manual_enabled';
        displayName = 'Manual';
      } else if (method === 'hubtel') {
        settingKey = 'payment_method_hubtel_enabled';
        description = 'Enable/disable Hubtel payment method';
        stateKey = 'hubtel_enabled';
        displayName = 'Hubtel';
      } else {
        toast.error('Unknown payment method');
        return;
      }
      
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          key: settingKey,
          value: enabled ? 'true' : 'false',
          description: description
        }, {
          onConflict: 'key'
        });

      if (error) {
        console.error('Error updating payment method setting:', error);
        toast.error('Failed to update payment method setting');
        return;
      }

      setPaymentMethodSettings(prev => ({
        ...prev,
        [stateKey]: enabled
      }));

      toast.success(`${displayName} payment method ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Error toggling payment method:', error);
      toast.error('Failed to update payment method setting');
    }
  };

  const handleApproveManualDeposit = async (deposit) => {
    setApprovingDeposit(deposit.id);
    try {
      const userProfile = userProfiles[deposit.user_id];
      if (!userProfile) {
        toast.error('User profile not found');
        return;
      }

      const currentBalance = parseFloat(userProfile.balance || 0);
      const depositAmount = parseFloat(deposit.amount || 0);
      const newBalance = currentBalance + depositAmount;

      // Update transaction status to approved
      const { error: transactionError } = await supabase
        .from('transactions')
        .update({ status: 'approved' })
        .eq('id', deposit.id);

      if (transactionError) {
        console.error('Error updating transaction status:', transactionError);
        toast.error('Failed to update transaction status: ' + transactionError.message);
        return;
      }

      // Update user balance
      const { error: balanceError } = await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', deposit.user_id);

      if (balanceError) {
        console.error('Error updating balance:', balanceError);
        toast.error('Failed to update balance: ' + balanceError.message);
        // Try to revert transaction status
        await supabase
          .from('transactions')
          .update({ status: 'pending' })
          .eq('id', deposit.id);
        return;
      }

      toast.success(`Manual deposit approved! ₵${depositAmount.toFixed(2)} added to user's account.`);
      
      // Refresh data
      await fetchAllData(false);
    } catch (error) {
      console.error('Error approving manual deposit:', error);
      toast.error('Failed to approve deposit: ' + error.message);
    } finally {
      setApprovingDeposit(null);
    }
  };

  const handleManualCredit = async (transaction) => {
    setManuallyCrediting(transaction.id);
    try {
      const userProfile = userProfiles[transaction.user_id];
      if (!userProfile) {
        toast.error('User profile not found');
        return;
      }

      const currentBalance = parseFloat(userProfile.balance || 0);
      const depositAmount = parseFloat(transaction.amount || 0);
      const newBalance = currentBalance + depositAmount;

      const { error: balanceError } = await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', transaction.user_id);

      if (balanceError) {
        console.error('Error updating balance:', balanceError);
        toast.error('Failed to update balance: ' + balanceError.message);
        return;
      }

      toast.success(`Balance credited successfully! ₵${depositAmount.toFixed(2)} added to user's account.`);
      
      setBalanceCheckResults(prev => ({
        ...prev,
        [transaction.id]: 'updated'
      }));
      
      await saveVerifiedTransaction(transaction.id, 'updated');
      
      await fetchData();
    } catch (error) {
      console.error('Error manually crediting balance:', error);
      toast.error('Failed to credit balance: ' + error.message);
    } finally {
      setManuallyCrediting(null);
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
        seller_only: serviceForm.seller_only || false,
        enabled: serviceForm.enabled !== undefined ? serviceForm.enabled : true
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
        seller_only: false,
        enabled: true
      });
      
      // Wait a moment for database to sync, then refresh
      await new Promise(resolve => setTimeout(resolve, 300));
      await fetchAllData(false); // Skip SMMGen status check on updates
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
      // Ensure enabled is explicitly set as boolean
      const updateData = {
        ...updates,
        enabled: Boolean(updates.enabled)
      };
      
      // Remove any undefined or null values that might cause issues
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });
      
      console.log('Updating service with data:', updateData);
      console.log('Service ID:', serviceId);
      console.log('Service ID type:', typeof serviceId);
      
      // First, verify the service exists
      const { data: existingService, error: checkError } = await supabase
        .from('services')
        .select('id, name, enabled')
        .eq('id', serviceId)
        .single();
      
      if (checkError || !existingService) {
        console.error('Service not found or error checking:', checkError);
        toast.error(`Service not found. ID: ${serviceId}`);
        return;
      }
      
      console.log('Service exists:', existingService);
      
      // Perform the update and check the response
      const { data: updateResponse, error: updateError } = await supabase
        .from('services')
        .update(updateData)
        .eq('id', serviceId)
        .select();

      if (updateError) {
        console.error('Error updating service:', updateError);
        console.error('Error details:', JSON.stringify(updateError, null, 2));
        
        // Check for specific error types
        if (updateError.code === '42501') {
          // Permission denied (RLS policy issue)
          toast.error('Permission denied. Please ensure RLS policies allow admins to update services.');
        } else if (updateError.code === '23505') {
          // Unique constraint violation
          toast.error('Update failed: Duplicate entry detected.');
        } else {
          toast.error(`Update failed: ${updateError.message || 'Unknown error'}`);
          throw updateError;
        }
        return;
      }

      // Check if update actually affected any rows
      if (!updateResponse || updateResponse.length === 0) {
        console.error('Update returned no rows - service might not exist or update failed silently');
        toast.error('Update failed: No rows were updated. The service might not exist.');
        return;
      }

      console.log('Update response:', updateResponse);
      console.log('Number of rows updated:', updateResponse.length);

      // Use the data from the update response if available, otherwise fetch separately
      let data = updateResponse[0];
      
      if (!data) {
        // Fallback: fetch the updated service separately
        const { data: fetchedData, error: fetchError } = await supabase
          .from('services')
          .select('*')
          .eq('id', serviceId)
          .single();

        if (fetchError) {
          console.error('Error fetching updated service:', fetchError);
          toast.error('Update may have succeeded but could not verify. Please refresh.');
          setEditingService(null);
          await new Promise(resolve => setTimeout(resolve, 500));
          await fetchAllData(false);
          return;
        }

        data = fetchedData;
      }

      // Verify the update actually changed the values
      const updateSucceeded = Object.keys(updateData).every(key => {
        if (key === 'enabled') {
          // Boolean comparison
          return data[key] === Boolean(updateData[key]);
        }
        return String(data[key]) === String(updateData[key]);
      });

      if (!updateSucceeded) {
        console.warn('Update verification failed. Expected:', updateData, 'Got:', data);
        console.warn('Mismatched fields:', Object.keys(updateData).filter(key => {
          if (key === 'enabled') {
            return data[key] !== Boolean(updateData[key]);
          }
          return String(data[key]) !== String(updateData[key]);
        }));
      }

      console.log('Service updated successfully:', data);
      console.log('Update verification:', updateSucceeded ? 'PASSED' : 'FAILED');
      toast.success('Service updated successfully!');
      setEditingService(null);
      
      // Update local state immediately for better UX
      setServices(prevServices => {
        const updated = prevServices.map(s => {
          if (s.id === serviceId) {
            console.log('Updating service in state:', s.id, 'Old:', s, 'New:', data);
            // Merge the data properly, ensuring all fields are updated
            return { ...s, ...data };
          }
          return s;
        });
        console.log('Updated services state - total services:', updated.length);
        return updated;
      });
      
      // Wait longer for database to sync, then refresh services directly
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Fetch fresh services from database to ensure consistency
      const { data: freshServices, error: refreshError } = await supabase
        .from('services')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (!refreshError && freshServices) {
        console.log('Refreshed services from database:', freshServices.length);
        setServices(freshServices);
      } else {
        console.warn('Error refreshing services, using full refresh:', refreshError);
        // Fallback to full refresh if direct fetch fails
        await fetchAllData(false);
      }
    } catch (error) {
      console.error('Failed to update service:', error);
      toast.error(error.message || 'Failed to update service. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleService = async (serviceId, currentEnabled) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('services')
        .update({ enabled: !currentEnabled })
        .eq('id', serviceId);

      if (error) {
        console.error('Error toggling service:', error);
        throw error;
      }

      toast.success(`Service ${!currentEnabled ? 'enabled' : 'disabled'} successfully!`);
      
      // Wait a moment for database to sync, then refresh
      await new Promise(resolve => setTimeout(resolve, 300));
      await fetchAllData(false); // Skip SMMGen status check on updates
    } catch (error) {
      console.error('Failed to toggle service:', error);
      toast.error(error.message || 'Failed to toggle service');
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
      await fetchAllData(false); // Skip SMMGen status check on updates
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
      // Get current order to get previous status
      const { data: currentOrder } = await supabase
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single();

      const previousStatus = currentOrder?.status;

      // Get current user for created_by
      const { data: { user: authUser } } = await supabase.auth.getUser();

      // Save status to history first
      await saveOrderStatusHistory(
        orderId,
        status,
        'manual',
        null, // No SMMGen response for manual changes
        previousStatus,
        authUser?.id // Admin who made the change
      );

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
      await fetchAllData(false); // Skip SMMGen status check on updates
    } catch (error) {
      console.error('Failed to update order status:', error);
      toast.error(error.message || 'Failed to update order status');
    } finally {
      setLoading(false);
    }
  };

  const handleRefundOrder = async (order) => {
    // Check if refund was already processed
    if (order.refund_status === 'succeeded') {
      if (!confirm('This order has already been refunded. Are you sure you want to refund it again?')) {
      return;
    }
    } else if (order.refund_status === 'failed') {
      if (!confirm('Automatic refund failed for this order. Proceed with manual refund?')) {
        return;
      }
    } else {
      if (!confirm('Are you sure you want to refund this order? The user will receive their balance back.')) {
        return;
      }
    }

    try {
      setLoading(true);
      
      // Use the manual refund utility function
      const refundResult = await processManualRefund(order);

      if (refundResult.success) {
        toast.success(`Order refunded successfully! ₵${refundResult.refundAmount.toFixed(2)} added back to user's balance.`);
      } else {
        throw new Error(refundResult.error || 'Failed to process refund');
      }

      // Refresh data to show updated balance and stats
      // Increased delay to ensure database has synced the refund_status update
      await new Promise(resolve => setTimeout(resolve, 500));
      await fetchAllData(false); // Skip SMMGen status check on updates
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
      await fetchAllData(false); // Skip SMMGen status check on updates
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
      await fetchAllData(false); // Skip SMMGen status check on updates

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
  const filteredUsers = users.filter(u => {
    // Search filter
    const searchLower = userSearch.toLowerCase();
    const matchesSearch = userSearch === '' || 
      u.name?.toLowerCase().includes(searchLower) ||
      u.email?.toLowerCase().includes(searchLower) ||
      u.phone_number?.toLowerCase().includes(searchLower);
    
    // Date filter
    let matchesDate = true;
    if (userDateFilter) {
      const userDate = new Date(u.created_at).toLocaleDateString();
      const filterDate = new Date(userDateFilter).toLocaleDateString();
      matchesDate = userDate === filterDate;
    }
    
    return matchesSearch && matchesDate;
  });

  // Pagination calculations for users
  const totalUsersPages = Math.ceil(filteredUsers.length / usersPerPage);
  const startUserIndex = (usersPage - 1) * usersPerPage;
  const endUserIndex = startUserIndex + usersPerPage;
  const paginatedUsers = filteredUsers.slice(startUserIndex, endUserIndex);

  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setUsersPage(1);
  }, [userSearch, userDateFilter]);

  const filteredOrders = orders.filter(o => {
    // Search filter
    const searchLower = orderSearch.toLowerCase();
    const matchesSearch = orderSearch === '' || 
      o.id.toLowerCase().includes(searchLower) ||
      o.user_id.toLowerCase().includes(searchLower) ||
      o.profiles?.name?.toLowerCase().includes(searchLower) ||
      o.profiles?.email?.toLowerCase().includes(searchLower) ||
      o.profiles?.phone_number?.toLowerCase().includes(searchLower) ||
      o.services?.name?.toLowerCase().includes(searchLower) ||
      o.link?.toLowerCase().includes(searchLower);
    
    // Status filter
    const matchesStatus = orderStatusFilter === 'all' || o.status === orderStatusFilter;
    
    // Date filter
    let matchesDate = true;
    if (orderDateFilter) {
      const orderDate = new Date(o.created_at).toLocaleDateString();
      const filterDate = new Date(orderDateFilter).toLocaleDateString();
      matchesDate = orderDate === filterDate;
    }
    
    return matchesSearch && matchesStatus && matchesDate;
  });

  // Pagination calculations for orders
  const totalOrdersPages = Math.ceil(filteredOrders.length / ordersPerPage);
  const startOrderIndex = (ordersPage - 1) * ordersPerPage;
  const endOrderIndex = startOrderIndex + ordersPerPage;
  const paginatedOrders = filteredOrders.slice(startOrderIndex, endOrderIndex);

  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setOrdersPage(1);
  }, [orderStatusFilter, orderSearch, orderDateFilter]);

  const filteredTickets = supportTickets.filter(t => {
    // Search filter
    const searchLower = ticketSearch.toLowerCase();
    const matchesSearch = ticketSearch === '' || 
      t.id.toLowerCase().includes(searchLower) ||
      t.user_id.toLowerCase().includes(searchLower) ||
      t.subject?.toLowerCase().includes(searchLower) ||
      t.message?.toLowerCase().includes(searchLower) ||
      t.profiles?.name?.toLowerCase().includes(searchLower) ||
      t.profiles?.email?.toLowerCase().includes(searchLower);
    
    // Status filter
    const matchesStatus = ticketStatusFilter === 'all' || t.status === ticketStatusFilter;
    
    // Date filter
    let matchesDate = true;
    if (ticketDateFilter) {
      const ticketDate = new Date(t.created_at).toLocaleDateString();
      const filterDate = new Date(ticketDateFilter).toLocaleDateString();
      matchesDate = ticketDate === filterDate;
    }
    
    return matchesSearch && matchesStatus && matchesDate;
  });

  // Pagination calculations for tickets
  const totalTicketsPages = Math.ceil(filteredTickets.length / ticketsPerPage);
  const startTicketIndex = (ticketsPage - 1) * ticketsPerPage;
  const endTicketIndex = startTicketIndex + ticketsPerPage;
  const paginatedTickets = filteredTickets.slice(startTicketIndex, endTicketIndex);

  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setTicketsPage(1);
  }, [ticketStatusFilter, ticketSearch, ticketDateFilter]);

  const filteredBalanceUsers = users.filter(u => {
    // Search filter
    const searchLower = balanceListSearch.toLowerCase();
    const matchesSearch = balanceListSearch === '' || 
      u.name?.toLowerCase().includes(searchLower) ||
      u.email?.toLowerCase().includes(searchLower) ||
      u.phone_number?.toLowerCase().includes(searchLower);
    
    // Date filter
    let matchesDate = true;
    if (balanceDateFilter) {
      const userDate = new Date(u.created_at).toLocaleDateString();
      const filterDate = new Date(balanceDateFilter).toLocaleDateString();
      matchesDate = userDate === filterDate;
    }
    
    return matchesSearch && matchesDate;
  });

  // Pagination calculations for balance users
  const totalBalancePages = Math.ceil(filteredBalanceUsers.length / balancePerPage);
  const startBalanceIndex = (balancePage - 1) * balancePerPage;
  const endBalanceIndex = startBalanceIndex + balancePerPage;
  const paginatedBalanceUsers = filteredBalanceUsers.slice(startBalanceIndex, endBalanceIndex);

  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setBalancePage(1);
  }, [balanceListSearch, balanceDateFilter]);

  const filteredTransactions = allTransactions.filter(t => {
    // Search filter
    const searchLower = transactionSearch.toLowerCase();
    const matchesSearch = transactionSearch === '' || 
      t.id.toLowerCase().includes(searchLower) ||
      t.user_id.toLowerCase().includes(searchLower) ||
      t.profiles?.name?.toLowerCase().includes(searchLower) ||
      t.profiles?.email?.toLowerCase().includes(searchLower);
    
    // Type filter
    const matchesType = transactionTypeFilter === 'all' || t.type === transactionTypeFilter;
    
    // Status filter
    const matchesStatus = transactionStatusFilter === 'all' || t.status === transactionStatusFilter;
    
    // Date filter
    let matchesDate = true;
    if (transactionDateFilter) {
      const transactionDate = new Date(t.created_at).toLocaleDateString();
      const filterDate = new Date(transactionDateFilter).toLocaleDateString();
      matchesDate = transactionDate === filterDate;
    }
    
    return matchesSearch && matchesType && matchesStatus && matchesDate;
  });

  // Pagination calculations for transactions
  const totalTransactionsPages = Math.ceil(filteredTransactions.length / transactionsPerPage);
  const startTransactionIndex = (transactionsPage - 1) * transactionsPerPage;
  const endTransactionIndex = startTransactionIndex + transactionsPerPage;
  const paginatedTransactions = filteredTransactions.slice(startTransactionIndex, endTransactionIndex);

  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setTransactionsPage(1);
  }, [transactionSearch, transactionDateFilter, transactionTypeFilter, transactionStatusFilter]);

  const filteredServices = services.filter(s =>
    s.name?.toLowerCase().includes(serviceSearch.toLowerCase()) ||
    s.platform?.toLowerCase().includes(serviceSearch.toLowerCase()) ||
    s.service_type?.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  const filteredDeposits = deposits.filter(d => {
    // Status filter
    let matchesStatus = true;
    if (depositStatusFilter === 'pending') matchesStatus = d.status === 'pending';
    else if (depositStatusFilter === 'confirmed') matchesStatus = d.status === 'approved';
    else if (depositStatusFilter === 'cancelled') matchesStatus = d.status === 'rejected';
    
    // Username search
    let matchesSearch = true;
    if (depositSearch.trim()) {
      const searchLower = depositSearch.toLowerCase();
      const userName = (d.profiles?.name || '').toLowerCase();
      const userEmail = (d.profiles?.email || '').toLowerCase();
      const userId = (d.user_id || '').toLowerCase();
      matchesSearch = userName.includes(searchLower) || 
                     userEmail.includes(searchLower) || 
                     userId.includes(searchLower);
    }
    
    // Date filter
    let matchesDate = true;
    if (depositDateFilter) {
      const depositDate = new Date(d.created_at).toLocaleDateString();
      const filterDate = new Date(depositDateFilter).toLocaleDateString();
      matchesDate = depositDate === filterDate;
    }
    
    return matchesStatus && matchesSearch && matchesDate;
  });

  // Pagination calculations for deposits
  const totalDepositsPages = Math.ceil(filteredDeposits.length / depositsPerPage);
  const startDepositIndex = (depositsPage - 1) * depositsPerPage;
  const endDepositIndex = startDepositIndex + depositsPerPage;
  const paginatedDeposits = filteredDeposits.slice(startDepositIndex, endDepositIndex);

  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setDepositsPage(1);
  }, [depositStatusFilter, depositSearch, depositDateFilter]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {user?.role !== 'admin' && <Navbar user={user} onLogout={onLogout} />}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 lg:pl-[280px]">
        {/* Navigation - Sidebar for desktop, Tabs for mobile */}
        <div className="flex flex-col lg:flex-row gap-6 animate-slideUp">
          {/* Sidebar Navigation - Desktop */}
          <div className="hidden lg:block fixed top-0 left-0 bottom-0 w-64 z-40 pt-4 pb-6 px-6">
            <div className="glass p-4 rounded-2xl h-full flex flex-col overflow-y-auto">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 px-2">Navigation</h3>
              <nav className="space-y-1">
                <button
                  onClick={() => setActiveSection('dashboard')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    activeSection === 'dashboard'
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white'
                      : 'text-gray-700 hover:bg-white/50'
                  }`}
                >
                  <Layers className="w-5 h-5" />
                  <span className="font-medium">Dashboard</span>
                </button>
                <button
                  onClick={() => setActiveSection('deposits')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    activeSection === 'deposits'
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white'
                      : 'text-gray-700 hover:bg-white/50'
                  }`}
                >
                  <DollarSign className="w-5 h-5" />
                  <span className="font-medium">Deposits</span>
                </button>
                <button
                  onClick={() => setActiveSection('orders')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    activeSection === 'orders'
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white'
                      : 'text-gray-700 hover:bg-white/50'
                  }`}
                >
                  <ShoppingCart className="w-5 h-5" />
                  <span className="font-medium">Orders</span>
                </button>
                <button
                  onClick={() => setActiveSection('services')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    activeSection === 'services'
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white'
                      : 'text-gray-700 hover:bg-white/50'
                  }`}
                >
                  <Package className="w-5 h-5" />
                  <span className="font-medium">Services</span>
                </button>
                <button
                  onClick={() => setActiveSection('users')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    activeSection === 'users'
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white'
                      : 'text-gray-700 hover:bg-white/50'
                  }`}
                >
                  <Users className="w-5 h-5" />
                  <span className="font-medium">Users</span>
                </button>
                <button
                  onClick={() => setActiveSection('transactions')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    activeSection === 'transactions'
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white'
                      : 'text-gray-700 hover:bg-white/50'
                  }`}
                >
                  <Receipt className="w-5 h-5" />
                  <span className="font-medium">Transactions</span>
                </button>
                <button
                  onClick={() => setActiveSection('support')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    activeSection === 'support'
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white'
                      : 'text-gray-700 hover:bg-white/50'
                  }`}
                >
                  <MessageSquare className="w-5 h-5" />
                  <span className="font-medium">Support</span>
                  {stats.open_tickets > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                      {stats.open_tickets}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveSection('balance')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    activeSection === 'balance'
                      ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white'
                      : 'text-gray-700 hover:bg-white/50'
                  }`}
                >
                  <Wallet className="w-5 h-5" />
                  <span className="font-medium">Balance</span>
                </button>
              </nav>
              
              {/* User Info at Bottom */}
              <div className="mt-auto pt-4 border-t border-white/20">
                <div className="px-3 py-3 space-y-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 truncate">{user?.name || 'Admin'}</p>
                    <p className="text-xs text-gray-600 truncate">{user?.email || ''}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Balance:</span>
                    <span className="text-sm font-semibold text-indigo-600">₵{user?.balance?.toFixed(2) || '0.00'}</span>
                  </div>
                  <Button
                    onClick={onLogout}
                    variant="outline"
                    size="sm"
                    className="w-full mt-2 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                  >
                    <span className="text-xs">Logout</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs Navigation - Mobile */}
          <Tabs value={activeSection} onValueChange={setActiveSection} className="w-full">
            <TabsList className="glass mb-6 flex-wrap w-full lg:hidden">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
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

            {/* Content Area */}
            <div className="flex-1 min-w-0">
              {/* Dashboard Section */}
              <TabsContent value="dashboard" className="lg:mt-0">
                <div className="space-y-6">
                  {/* Header Section */}
                  <div className="glass p-6 sm:p-8 rounded-3xl">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                      <div>
                        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
                        <p className="text-gray-600">Manage users, orders, and services</p>
                      </div>
                      <Button
                        onClick={() => fetchAllData(true)} // Check SMMGen status on manual refresh
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
                  <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4">
                    {/* Users Today */}
                    <div className="glass p-3 rounded-xl hover:scale-105 transition-transform cursor-pointer" onClick={() => setActiveSection('users')}>
                      <div className="flex items-center justify-between mb-1">
                        <Users className="w-4 h-4 text-indigo-600" />
                        <span className="text-lg font-bold text-gray-900">{stats.users_today}</span>
                      </div>
                      <p className="text-gray-600 text-[10px] font-medium">Users Today</p>
                      <p className="text-gray-400 text-[9px] mt-0.5">{stats.total_users} Total</p>
                    </div>
                    {/* Orders Today */}
                    <div className="glass p-3 rounded-xl hover:scale-105 transition-transform cursor-pointer" onClick={() => setActiveSection('orders')}>
                      <div className="flex items-center justify-between mb-1">
                        <ShoppingCart className="w-4 h-4 text-blue-600" />
                        <span className="text-lg font-bold text-gray-900">{stats.orders_today}</span>
                      </div>
                      <p className="text-gray-600 text-[10px] font-medium">Orders Today</p>
                      <p className="text-gray-400 text-[9px] mt-0.5">{stats.total_orders} Total</p>
                    </div>
                    {/* Deposits Today */}
                    <div className="glass p-3 rounded-xl hover:scale-105 transition-transform cursor-pointer" onClick={() => setActiveSection('deposits')}>
                      <div className="flex items-center justify-between mb-1">
                        <DollarSign className="w-4 h-4 text-emerald-600" />
                        <span className="text-lg font-bold text-gray-900">{stats.deposits_today}</span>
                      </div>
                      <p className="text-gray-600 text-[10px] font-medium">Deposits Today</p>
                      <p className="text-gray-400 text-[9px] mt-0.5">{stats.pending_deposits} Pending</p>
                    </div>
                    {/* Cancelled Orders */}
                    <div className="glass p-3 rounded-xl hover:scale-105 transition-transform cursor-pointer" onClick={() => setActiveSection('orders')}>
                      <div className="flex items-center justify-between mb-1">
                        <XCircle className="w-4 h-4 text-orange-600" />
                        <span className="text-lg font-bold text-gray-900">{stats.cancelled_orders}</span>
                      </div>
                      <p className="text-gray-600 text-[10px] font-medium">Cancelled</p>
                      <p className="text-gray-400 text-[9px] mt-0.5">Orders</p>
                    </div>
                    {/* Total Revenue */}
                    <div className="glass p-3 rounded-xl hover:scale-105 transition-transform cursor-pointer" onClick={() => setActiveSection('transactions')}>
                      <div className="flex items-center justify-between mb-1">
                        <TrendingUp className="w-4 h-4 text-green-600" />
                        <span className="text-lg font-bold text-gray-900">₵{stats.total_revenue_amount.toFixed(0)}</span>
                      </div>
                      <p className="text-gray-600 text-[10px] font-medium">Total Revenue</p>
                      <p className="text-gray-400 text-[9px] mt-0.5">{stats.completed_orders} Orders</p>
                    </div>
                    {/* Average Order Value */}
                    <div className="glass p-3 rounded-xl hover:scale-105 transition-transform cursor-pointer" onClick={() => setActiveSection('orders')}>
                      <div className="flex items-center justify-between mb-1">
                        <BarChart3 className="w-4 h-4 text-purple-600" />
                        <span className="text-lg font-bold text-gray-900">₵{stats.average_order_value.toFixed(0)}</span>
                      </div>
                      <p className="text-gray-600 text-[10px] font-medium">Avg Order</p>
                      <p className="text-gray-400 text-[9px] mt-0.5">Per Order</p>
                    </div>
                    {/* Completed Orders */}
                    <div className="glass p-3 rounded-xl hover:scale-105 transition-transform cursor-pointer" onClick={() => setActiveSection('orders')}>
                      <div className="flex items-center justify-between mb-1">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="text-lg font-bold text-gray-900">{stats.completed_orders}</span>
                      </div>
                      <p className="text-gray-600 text-[10px] font-medium">Completed</p>
                      <p className="text-gray-400 text-[9px] mt-0.5">{stats.processing_orders} Processing</p>
                    </div>
                    {/* Processing Orders */}
                    <div className="glass p-3 rounded-xl hover:scale-105 transition-transform cursor-pointer" onClick={() => setActiveSection('orders')}>
                      <div className="flex items-center justify-between mb-1">
                        <Clock className="w-4 h-4 text-blue-600" />
                        <span className="text-lg font-bold text-gray-900">{stats.processing_orders}</span>
                      </div>
                      <p className="text-gray-600 text-[10px] font-medium">Processing</p>
                      <p className="text-gray-400 text-[9px] mt-0.5">{stats.cancelled_orders} Cancelled</p>
                    </div>
                    {/* Pending Deposits */}
                    <div className="glass p-3 rounded-xl hover:scale-105 transition-transform cursor-pointer" onClick={() => setActiveSection('deposits')}>
                      <div className="flex items-center justify-between mb-1">
                        <AlertCircle className="w-4 h-4 text-yellow-600" />
                        <span className="text-lg font-bold text-gray-900">{stats.pending_deposits}</span>
                      </div>
                      <p className="text-gray-600 text-[10px] font-medium">Pending</p>
                      <p className="text-gray-400 text-[9px] mt-0.5">{stats.confirmed_deposits} Confirmed</p>
                    </div>
                    {/* Rejected Deposits */}
                    <div className="glass p-3 rounded-xl hover:scale-105 transition-transform cursor-pointer" onClick={() => setActiveSection('deposits')}>
                      <div className="flex items-center justify-between mb-1">
                        <XCircle className="w-4 h-4 text-red-600" />
                        <span className="text-lg font-bold text-gray-900">{stats.rejected_deposits}</span>
                      </div>
                      <p className="text-gray-600 text-[10px] font-medium">Rejected</p>
                      <p className="text-gray-400 text-[9px] mt-0.5">Deposits</p>
                    </div>
                    {/* Failed Orders */}
                    <div className="glass p-3 rounded-xl hover:scale-105 transition-transform cursor-pointer" onClick={() => setActiveSection('orders')}>
                      <div className="flex items-center justify-between mb-1">
                        <XCircle className="w-4 h-4 text-red-600" />
                        <span className="text-lg font-bold text-gray-900">{stats.failed_orders}</span>
                      </div>
                      <p className="text-gray-600 text-[10px] font-medium">Failed</p>
                      <p className="text-gray-400 text-[9px] mt-0.5">Orders</p>
                    </div>
                    {/* Refunded Orders */}
                    <div className="glass p-3 rounded-xl hover:scale-105 transition-transform cursor-pointer" onClick={() => setActiveSection('orders')}>
                      <div className="flex items-center justify-between mb-1">
                        <Receipt className="w-4 h-4 text-orange-600" />
                        <span className="text-lg font-bold text-gray-900">{stats.refunded_orders}</span>
                      </div>
                      <p className="text-gray-600 text-[10px] font-medium">Refunded</p>
                      <p className="text-gray-400 text-[9px] mt-0.5">{stats.failed_refunds} Failed</p>
                    </div>
                    {/* Open Support Tickets */}
                    <div className="glass p-3 rounded-xl hover:scale-105 transition-transform cursor-pointer" onClick={() => setActiveSection('support')}>
                      <div className="flex items-center justify-between mb-1">
                        <MessageSquare className="w-4 h-4 text-blue-600" />
                        <span className="text-lg font-bold text-gray-900">{stats.open_tickets}</span>
                      </div>
                      <p className="text-gray-600 text-[10px] font-medium">Open Tickets</p>
                      <p className="text-gray-400 text-[9px] mt-0.5">{stats.in_progress_tickets} In Progress</p>
                    </div>
                    {/* Resolved Tickets */}
                    <div className="glass p-3 rounded-xl hover:scale-105 transition-transform cursor-pointer" onClick={() => setActiveSection('support')}>
                      <div className="flex items-center justify-between mb-1">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="text-lg font-bold text-gray-900">{stats.resolved_tickets}</span>
                      </div>
                      <p className="text-gray-600 text-[10px] font-medium">Resolved</p>
                      <p className="text-gray-400 text-[9px] mt-0.5">Tickets</p>
                    </div>
                    {/* Total Transactions */}
                    <div className="glass p-3 rounded-xl hover:scale-105 transition-transform cursor-pointer" onClick={() => setActiveSection('transactions')}>
                      <div className="flex items-center justify-between mb-1">
                        <Receipt className="w-4 h-4 text-indigo-600" />
                        <span className="text-lg font-bold text-gray-900">{stats.total_transactions}</span>
                      </div>
                      <p className="text-gray-600 text-[10px] font-medium">Transactions</p>
                      <p className="text-gray-400 text-[9px] mt-0.5">All Time</p>
                    </div>
                    {/* Total Services */}
                    <div className="glass p-3 rounded-xl hover:scale-105 transition-transform cursor-pointer" onClick={() => setActiveSection('services')}>
                      <div className="flex items-center justify-between mb-1">
                        <Package className="w-4 h-4 text-purple-600" />
                        <span className="text-lg font-bold text-gray-900">{stats.total_services}</span>
                      </div>
                      <p className="text-gray-600 text-[10px] font-medium">Services</p>
                      <p className="text-gray-400 text-[9px] mt-0.5">Active</p>
                    </div>
                  </div>

                  {/* Quick Actions & Alerts */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Quick Actions */}
                    <div className="glass p-6 rounded-3xl">
                      <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-indigo-600" />
                        Quick Actions
                      </h3>
                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          onClick={() => setActiveSection('deposits')}
                          variant="outline"
                          className="flex flex-col items-center gap-2 h-auto py-4 hover:bg-indigo-50"
                        >
                          <DollarSign className="w-5 h-5 text-indigo-600" />
                          <span className="text-xs">Review Deposits</span>
                          {stats.pending_deposits > 0 && (
                            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                              {stats.pending_deposits}
                            </span>
                          )}
                        </Button>
                        <Button
                          onClick={() => setActiveSection('support')}
                          variant="outline"
                          className="flex flex-col items-center gap-2 h-auto py-4 hover:bg-indigo-50"
                        >
                          <MessageSquare className="w-5 h-5 text-indigo-600" />
                          <span className="text-xs">Support Tickets</span>
                          {stats.open_tickets > 0 && (
                            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                              {stats.open_tickets}
                            </span>
                          )}
                        </Button>
                        <Button
                          onClick={() => setActiveSection('orders')}
                          variant="outline"
                          className="flex flex-col items-center gap-2 h-auto py-4 hover:bg-indigo-50"
                        >
                          <ShoppingCart className="w-5 h-5 text-indigo-600" />
                          <span className="text-xs">View Orders</span>
                        </Button>
                        <Button
                          onClick={() => setActiveSection('users')}
                          variant="outline"
                          className="flex flex-col items-center gap-2 h-auto py-4 hover:bg-indigo-50"
                        >
                          <Users className="w-5 h-5 text-indigo-600" />
                          <span className="text-xs">Manage Users</span>
                        </Button>
                      </div>
                    </div>

                    {/* Alerts & Notifications */}
                    <div className="glass p-6 rounded-3xl">
                      <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Bell className="w-5 h-5 text-yellow-600" />
                        Alerts & Notifications
                      </h3>
                      <div className="space-y-3">
                        {stats.pending_deposits > 0 && (
                          <div className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">{stats.pending_deposits} Pending Deposit{stats.pending_deposits > 1 ? 's' : ''}</p>
                              <p className="text-xs text-gray-600">Requires your attention</p>
                            </div>
                            <Button
                              onClick={() => setActiveSection('deposits')}
                              size="sm"
                              variant="outline"
                              className="text-xs"
                            >
                              Review
                            </Button>
                          </div>
                        )}
                        {stats.open_tickets > 0 && (
                          <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <MessageSquare className="w-5 h-5 text-blue-600 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">{stats.open_tickets} Open Ticket{stats.open_tickets > 1 ? 's' : ''}</p>
                              <p className="text-xs text-gray-600">Awaiting response</p>
                            </div>
                            <Button
                              onClick={() => setActiveSection('support')}
                              size="sm"
                              variant="outline"
                              className="text-xs"
                            >
                              View
                            </Button>
                          </div>
                        )}
                        {allTransactions.filter(t => t.type === 'deposit' && t.status === 'approved' && getBalanceCheckResult(t) === 'not_updated').length > 0 && (
                          <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">
                                {allTransactions.filter(t => t.type === 'deposit' && t.status === 'approved' && getBalanceCheckResult(t) === 'not_updated').length} Balance{allTransactions.filter(t => t.type === 'deposit' && t.status === 'approved' && getBalanceCheckResult(t) === 'not_updated').length > 1 ? 's' : ''} Not Updated
                              </p>
                              <p className="text-xs text-gray-600">Requires manual credit</p>
                            </div>
                            <Button
                              onClick={() => setActiveSection('transactions')}
                              size="sm"
                              variant="outline"
                              className="text-xs"
                            >
                              Fix
                            </Button>
                          </div>
                        )}
                        {stats.pending_deposits === 0 && stats.open_tickets === 0 && allTransactions.filter(t => t.type === 'deposit' && t.status === 'approved' && getBalanceCheckResult(t) === 'not_updated').length === 0 && (
                          <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">All Clear!</p>
                              <p className="text-xs text-gray-600">No pending actions required</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Recent Activity */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Recent Orders */}
                    <div className="glass p-6 rounded-3xl">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                          <ShoppingCart className="w-5 h-5 text-blue-600" />
                          Recent Orders
                        </h3>
                        <Button
                          onClick={() => setActiveSection('orders')}
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                        >
                          View All
                        </Button>
                      </div>
                      <div className="space-y-3 max-h-[300px] overflow-y-auto">
                        {orders.slice(0, 5).map((order) => (
                          <div key={order.id} className="flex items-center justify-between p-3 bg-white/50 rounded-lg hover:bg-white/70 transition-colors">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{order.services?.name || 'Unknown Service'}</p>
                              <div className="flex flex-col gap-1 mt-1">
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                                    order.status === 'completed' ? 'bg-green-100 text-green-700' :
                                    order.status === 'processing' || order.status === 'in progress' ? 'bg-blue-100 text-blue-700' :
                                    order.status === 'partial' ? 'bg-orange-100 text-orange-700' :
                                    order.status === 'canceled' || order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                    order.status === 'refunds' ? 'bg-purple-100 text-purple-700' :
                                    'bg-yellow-100 text-yellow-700'
                                  }`}>
                                    {order.status}
                                  </span>
                                  <span className="text-xs text-gray-500">{new Date(order.created_at).toLocaleDateString()}</span>
                                </div>
                                <p className="text-xs text-gray-600 truncate">
                                  {order.profiles?.name || order.profiles?.email || 'Unknown User'}
                                </p>
                              </div>
                            </div>
                            <div className="text-right ml-4">
                              <p className="text-sm font-semibold text-gray-900">₵{order.total_cost.toFixed(2)}</p>
                              <p className="text-xs text-gray-500">Qty: {order.quantity}</p>
                            </div>
                          </div>
                        ))}
                        {orders.length === 0 && (
                          <p className="text-center text-gray-500 text-sm py-4">No orders yet</p>
                        )}
                      </div>
                    </div>

                    {/* Recent Deposits */}
                    <div className="glass p-6 rounded-3xl">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                          <DollarSign className="w-5 h-5 text-emerald-600" />
                          Recent Deposits
                        </h3>
                        <Button
                          onClick={() => setActiveSection('deposits')}
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                        >
                          View All
                        </Button>
                      </div>
                      <div className="space-y-3 max-h-[300px] overflow-y-auto">
                        {deposits.slice(0, 5).map((deposit) => (
                          <div key={deposit.id} className="flex items-center justify-between p-3 bg-white/50 rounded-lg hover:bg-white/70 transition-colors">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{deposit.profiles?.name || deposit.profiles?.email || 'Unknown User'}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  deposit.status === 'approved' ? 'bg-green-100 text-green-700' :
                                  deposit.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>
                                  {deposit.status}
                                </span>
                                <span className="text-xs text-gray-500">{new Date(deposit.created_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                            <div className="text-right ml-4">
                              <p className="text-sm font-semibold text-gray-900">₵{deposit.amount.toFixed(2)}</p>
                            </div>
                          </div>
                        ))}
                        {deposits.length === 0 && (
                          <p className="text-center text-gray-500 text-sm py-4">No deposits yet</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
              {/* Deposits Section */}
              <TabsContent value="deposits" className="lg:mt-0">
            <div className="glass p-4 sm:p-6 rounded-3xl">
              <div className="flex flex-col gap-4 mb-6">
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                  <div className="flex items-center gap-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Payment Deposits</h2>
                    <Button
                      onClick={() => fetchAllData(true)}
                      disabled={refreshing}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  </div>
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
                {/* Search and Date Filter */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Search by username, email, or user ID..."
                      value={depositSearch}
                      onChange={(e) => setDepositSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <div>
                    <Input
                      type="date"
                      placeholder="Filter by date"
                      value={depositDateFilter}
                      onChange={(e) => setDepositDateFilter(e.target.value)}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Payments are processed via Paystack. Status is automatically updated based on payment confirmation.
              </p>
              {filteredDeposits.length === 0 ? (
                <p className="text-gray-600 text-center py-8">No deposits found</p>
              ) : (
                <>
                  <div className="overflow-hidden rounded-xl border border-white/20">
                    <div className="max-h-[600px] overflow-y-auto overflow-x-auto">
                      {/* Fixed Header */}
                      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white sticky top-0 z-10 min-w-[1400px]">
                        <div className="grid grid-cols-[2fr_2fr_2fr_3fr_3fr_2fr] gap-4 p-4 font-semibold text-sm text-center">
                          <div>Status</div>
                          <div>Method</div>
                          <div>Amount</div>
                          <div>User</div>
                          <div>Transaction Details</div>
                          <div>Actions</div>
                        </div>
                      </div>
                      {/* Scrollable List */}
                      <div className="divide-y divide-gray-200/50 min-w-[1400px]">
                        {paginatedDeposits.map((deposit) => {
                    const statusConfig = {
                      pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
                      approved: { label: 'Confirmed', color: 'bg-green-100 text-green-700', icon: CheckCircle },
                      rejected: { label: 'Cancelled', color: 'bg-red-100 text-red-700', icon: XCircle }
                    };
                    const status = statusConfig[deposit.status] || statusConfig.pending;
                    const StatusIcon = status.icon;

                    const isManual = deposit.deposit_method === 'manual' || deposit.deposit_method === 'momo';
                    const isPaystack = deposit.deposit_method === 'paystack' || (!deposit.deposit_method && deposit.paystack_reference);

                    return (
                          <div key={deposit.id} className="bg-white/50 hover:bg-white/70 transition-colors">
                            <div className="grid grid-cols-[2fr_2fr_2fr_3fr_3fr_2fr] gap-4 p-4 items-center">
                              {/* Status */}
                              <div className="flex justify-center">
                                <span className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 ${status.color}`}>
                                  <StatusIcon className="w-3.5 h-3.5" />
                                  {status.label}
                                </span>
                              </div>
                              {/* Method */}
                              <div className="flex justify-center">
                                {isManual ? (
                                  <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 flex items-center gap-1.5">
                                    <Wallet className="w-3.5 h-3.5" />
                                    Manual (MOMO)
                                  </span>
                                ) : isPaystack ? (
                                  <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 flex items-center gap-1.5">
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    Paystack
                                  </span>
                                ) : (
                                  <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                    Unknown
                                  </span>
                                )}
                              </div>
                              {/* Amount */}
                              <div className="text-center">
                                <p className="font-semibold text-gray-900">₵{deposit.amount.toFixed(2)}</p>
                                <p className="text-xs text-gray-500">{new Date(deposit.created_at).toLocaleDateString()}</p>
                                <p className="text-xs text-gray-400">{new Date(deposit.created_at).toLocaleTimeString()}</p>
                              </div>
                              {/* User */}
                              <div className="text-center">
                                <p className="font-medium text-gray-900 text-sm">{deposit.profiles?.name || 'Unknown'}</p>
                                <p className="text-xs text-gray-600 break-all">{deposit.profiles?.email || deposit.user_id.slice(0, 8)}</p>
                                {deposit.profiles?.phone_number && (
                                  <p className="text-xs text-gray-500">📱 {deposit.profiles.phone_number}</p>
                                )}
                                {isManual && deposit.momo_number && (
                                  <p className="text-xs text-blue-600 mt-1">MOMO: {deposit.momo_number}</p>
                                )}
                              </div>
                              {/* Transaction Details */}
                              <div className="text-center">
                                {isPaystack && deposit.paystack_reference && (
                                  <p className="text-xs text-gray-600 mb-1">Ref: {deposit.paystack_reference}</p>
                                )}
                                {isManual && deposit.manual_reference && (
                                  <p className="text-xs text-gray-600 mb-1">Ref: {deposit.manual_reference}</p>
                                )}
                                {isManual && deposit.payment_proof_url && (
                                  <a
                                    href={deposit.payment_proof_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:text-blue-800 underline flex items-center justify-center gap-1"
                                  >
                                    <span>View Proof</span>
                                  </a>
                                )}
                                {deposit.status === 'pending' && isManual && (
                                  <p className="text-xs text-yellow-600 mt-1">Awaiting approval</p>
                                )}
                              </div>
                              {/* Actions */}
                              <div className="flex justify-center">
                                {deposit.status === 'pending' && isManual ? (
                                  <Button
                                    onClick={() => handleApproveManualDeposit(deposit)}
                                    disabled={loading || approvingDeposit === deposit.id}
                                    variant="default"
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700 text-white text-xs"
                                  >
                                    {approvingDeposit === deposit.id ? 'Approving...' : 'Approve'}
                                  </Button>
                                ) : deposit.status === 'pending' && isPaystack ? (
                                  <span className="text-xs text-gray-500">Auto-verify</span>
                                ) : deposit.status === 'approved' ? (
                                  <span className="text-xs text-green-600">✓ Approved</span>
                                ) : (
                                  <span className="text-xs text-red-600">Rejected</span>
                                )}
                              </div>
                            </div>
                          </div>
                    );
                  })}
                </div>
                    </div>
                  </div>
                  {/* Pagination Controls */}
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-gray-600">
                      Showing {startDepositIndex + 1} to {Math.min(endDepositIndex, filteredDeposits.length)} of {filteredDeposits.length} deposits
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => setDepositsPage(prev => Math.max(1, prev - 1))}
                        disabled={depositsPage === 1}
                        variant="outline"
                        size="sm"
                      >
                        Previous
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalDepositsPages) }, (_, i) => {
                          let pageNum;
                          if (totalDepositsPages <= 5) {
                            pageNum = i + 1;
                          } else if (depositsPage <= 3) {
                            pageNum = i + 1;
                          } else if (depositsPage >= totalDepositsPages - 2) {
                            pageNum = totalDepositsPages - 4 + i;
                          } else {
                            pageNum = depositsPage - 2 + i;
                          }
                          return (
                            <Button
                              key={pageNum}
                              onClick={() => setDepositsPage(pageNum)}
                              variant={depositsPage === pageNum ? "default" : "outline"}
                              size="sm"
                              className={depositsPage === pageNum ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white" : ""}
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        onClick={() => setDepositsPage(prev => Math.min(totalDepositsPages, prev + 1))}
                        disabled={depositsPage === totalDepositsPages}
                        variant="outline"
                        size="sm"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

            {/* Orders Section */}
            <TabsContent value="orders" className="lg:mt-0">
            <div className="glass p-4 sm:p-6 rounded-3xl">
              <div className="flex flex-col gap-4 mb-6">
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                  <div className="flex items-center gap-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Orders</h2>
                    <Button
                      onClick={() => fetchAllData(true)}
                      disabled={refreshing}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  </div>
                <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
                  <SelectTrigger className="w-full sm:w-40">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in progress">In Progress</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="canceled">Canceled</SelectItem>
                    <SelectItem value="refunds">Refunds</SelectItem>
                    <SelectItem value="refunded">Already Refunded</SelectItem>
                  </SelectContent>
                </Select>
              </div>
                {/* Search and Date Filter */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Search by order ID, username, email, phone, or service..."
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <div>
                    <Input
                      type="date"
                      placeholder="Filter by date"
                      value={orderDateFilter}
                      onChange={(e) => setOrderDateFilter(e.target.value)}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
                {filteredOrders.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">No orders found</p>
                ) : (
                <>
                  <div className="overflow-hidden rounded-xl border border-white/20">
                    <div className="max-h-[600px] overflow-y-auto overflow-x-auto">
                      {/* Fixed Header */}
                      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white sticky top-0 z-10 min-w-[1500px]">
                        <div className="grid grid-cols-12 gap-4 p-4 font-semibold text-sm">
                          <div className="col-span-1.5">Status</div>
                          <div className="col-span-1">Order ID</div>
                          <div className="col-span-1">SMMGen ID</div>
                          <div className="col-span-1">Quantity</div>
                          <div className="col-span-1.5">Time</div>
                          <div className="col-span-2">User</div>
                          <div className="col-span-1.5">Service</div>
                          <div className="col-span-1">Cost</div>
                          <div className="col-span-2">Link</div>
                          <div className="col-span-1">Actions</div>
                        </div>
                      </div>
                      {/* Scrollable List */}
                      <div className="divide-y divide-gray-200/50 min-w-[1500px]">
                        {paginatedOrders.map((order) => (
                          <div key={order.id} className="bg-white/50 hover:bg-white/70 transition-colors">
                            <div className="grid grid-cols-12 gap-4 p-4 items-center">
                              {/* Status */}
                              <div className="col-span-1.5 flex flex-col gap-1">
                                <span className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 w-fit ${
                                order.status === 'completed' ? 'bg-green-100 text-green-700' :
                                order.status === 'processing' || order.status === 'in progress' ? 'bg-blue-100 text-blue-700' :
                                order.status === 'partial' ? 'bg-orange-100 text-orange-700' :
                                order.status === 'canceled' || order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                order.status === 'refunds' ? 'bg-purple-100 text-purple-700' :
                                order.status === 'refunded' ? 'bg-gray-100 text-gray-700' :
                                'bg-yellow-100 text-yellow-700'
                              }`}>
                                {order.status === 'refunded' ? 'already refunded' : (order.status ? String(order.status) : 'pending')}
                              </span>
                                {order.refund_status && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    Refund: {order.refund_status}
                                  </p>
                                )}
                              </div>
                              {/* Order ID */}
                              <div className="col-span-1">
                                <p className="font-medium text-gray-900 text-sm">{order.id.slice(0, 8)}...</p>
                                <p className="text-xs text-gray-500">{order.id.slice(8, 16)}...</p>
                              </div>
                              {/* SMMGen Order ID */}
                              <div className="col-span-1">
                                {order.smmgen_order_id ? (
                                  <>
                                    <p className="font-medium text-gray-900 text-sm">{order.smmgen_order_id}</p>
                                    <p className="text-xs text-gray-500">({typeof order.smmgen_order_id})</p>
                                  </>
                                ) : (
                                  <p className="text-xs text-gray-400 italic">N/A</p>
                                )}
                              </div>
                              {/* Quantity */}
                              <div className="col-span-1">
                                <p className="font-semibold text-gray-900 text-base">{order.quantity}</p>
                                <p className="text-xs text-gray-500">units</p>
                              </div>
                              {/* Time */}
                              <div className="col-span-1.5">
                                <p className="text-sm text-gray-700">{new Date(order.created_at).toLocaleDateString()}</p>
                                <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleTimeString()}</p>
                              </div>
                              {/* User */}
                              <div className="col-span-2">
                                <p className="font-medium text-gray-900 text-sm">{order.profiles?.name || 'Unknown'}</p>
                                <p className="text-xs text-gray-600">{order.profiles?.email || order.user_id.slice(0, 8)}</p>
                                {order.profiles?.phone_number && (
                                  <p className="text-xs text-gray-500">📱 {order.profiles.phone_number}</p>
                                )}
                      </div>
                              {/* Service */}
                              <div className="col-span-1.5">
                                <p className="text-sm font-medium text-gray-900">{order.services?.name || 'N/A'}</p>
                              </div>
                              {/* Cost */}
                              <div className="col-span-1">
                                <p className="text-sm font-semibold text-gray-900">₵{order.total_cost.toFixed(2)}</p>
                              </div>
                              {/* Link */}
                              <div className="col-span-2">
                                <a href={order.link} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline whitespace-nowrap break-all">
                                  {order.link}
                                </a>
                              </div>
                              {/* Actions */}
                              <div className="col-span-1">
                                <div className="flex flex-col gap-2">
                            <Select 
                              value={order.status || 'pending'} 
                              onValueChange={(value) => handleOrderStatusUpdate(order.id, value)}
                            >
                                    <SelectTrigger className="w-full text-xs">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="in progress">In Progress</SelectItem>
                          <SelectItem value="processing">Processing</SelectItem>
                          <SelectItem value="partial">Partial</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="canceled">Canceled</SelectItem>
                          <SelectItem value="refunds">Refunds</SelectItem>
                          <SelectItem value="refunded">Already Refunded</SelectItem>
                        </SelectContent>
                      </Select>
                                  {/* Show refund button only for canceled orders */}
                                  {(order.status === 'canceled' || order.status === 'cancelled') && (
                              <Button
                                onClick={() => handleRefundOrder(order)}
                                variant="outline"
                                size="sm"
                                      className={
                                        order.refund_status === 'failed' 
                                          ? "text-orange-600 hover:text-orange-700 border-orange-300 text-xs"
                                          : "text-red-600 hover:text-red-700 text-xs"
                                      }
                                      title={
                                        order.refund_status === 'failed' 
                                          ? `Automatic refund failed: ${order.refund_error || 'Unknown error'}. Click to process manual refund.`
                                          : 'Refund this order'
                                      }
                                    >
                                      {order.refund_status === 'failed' ? 'Manual Refund' : 'Refund'}
                              </Button>
                            )}
                    </div>
                  </div>
                      </div>
                    </div>
                        ))}
              </div>
                    </div>
                  </div>
                  {/* Pagination Controls */}
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-gray-600">
                      Showing {startOrderIndex + 1} to {Math.min(endOrderIndex, filteredOrders.length)} of {filteredOrders.length} orders
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => setOrdersPage(prev => Math.max(1, prev - 1))}
                        disabled={ordersPage === 1}
                        variant="outline"
                        size="sm"
                      >
                        Previous
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalOrdersPages) }, (_, i) => {
                          let pageNum;
                          if (totalOrdersPages <= 5) {
                            pageNum = i + 1;
                          } else if (ordersPage <= 3) {
                            pageNum = i + 1;
                          } else if (ordersPage >= totalOrdersPages - 2) {
                            pageNum = totalOrdersPages - 4 + i;
                          } else {
                            pageNum = ordersPage - 2 + i;
                          }
                          return (
                            <Button
                              key={pageNum}
                              onClick={() => setOrdersPage(pageNum)}
                              variant={ordersPage === pageNum ? "default" : "outline"}
                              size="sm"
                              className={ordersPage === pageNum ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white" : ""}
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        onClick={() => setOrdersPage(prev => Math.min(totalOrdersPages, prev + 1))}
                        disabled={ordersPage === totalOrdersPages}
                        variant="outline"
                        size="sm"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

            {/* Services Section */}
            <TabsContent value="services" className="lg:mt-0">
            <div className="space-y-6">
              {/* Payment Methods Settings */}
              <div className="glass p-4 sm:p-8 rounded-3xl">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Payment Methods</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-white/50 rounded-xl border-2 border-gray-200">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                        <CheckCircle className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Paystack</p>
                        <p className="text-sm text-gray-600">Online payment gateway</p>
                      </div>
                    </div>
                    <Button
                      onClick={() => handleTogglePaymentMethod('paystack', !paymentMethodSettings.paystack_enabled)}
                      variant={paymentMethodSettings.paystack_enabled ? "default" : "outline"}
                      size="sm"
                      className={paymentMethodSettings.paystack_enabled ? "bg-green-600 hover:bg-green-700" : ""}
                    >
                      {paymentMethodSettings.paystack_enabled ? (
                        <>
                          <Power className="w-4 h-4 mr-2" />
                          Enabled
                        </>
                      ) : (
                        <>
                          <PowerOff className="w-4 h-4 mr-2" />
                          Disabled
                        </>
                      )}
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-white/50 rounded-xl border-2 border-gray-200">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
                        <Wallet className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Manual (Mobile Money)</p>
                        <p className="text-sm text-gray-600">MTN Mobile Money payment</p>
                      </div>
                    </div>
                    <Button
                      onClick={() => handleTogglePaymentMethod('manual', !paymentMethodSettings.manual_enabled)}
                      variant={paymentMethodSettings.manual_enabled ? "default" : "outline"}
                      size="sm"
                      className={paymentMethodSettings.manual_enabled ? "bg-green-600 hover:bg-green-700" : ""}
                    >
                      {paymentMethodSettings.manual_enabled ? (
                        <>
                          <Power className="w-4 h-4 mr-2" />
                          Enabled
                        </>
                      ) : (
                        <>
                          <PowerOff className="w-4 h-4 mr-2" />
                          Disabled
                        </>
                      )}
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between p-4 bg-white/50 rounded-xl border-2 border-gray-200">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
                        <CheckCircle className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Hubtel</p>
                        <p className="text-sm text-gray-600">Hubtel payment gateway</p>
                      </div>
                    </div>
                    <Button
                      onClick={() => handleTogglePaymentMethod('hubtel', !paymentMethodSettings.hubtel_enabled)}
                      variant={paymentMethodSettings.hubtel_enabled ? "default" : "outline"}
                      size="sm"
                      className={paymentMethodSettings.hubtel_enabled ? "bg-green-600 hover:bg-green-700" : ""}
                    >
                      {paymentMethodSettings.hubtel_enabled ? (
                        <>
                          <Power className="w-4 h-4 mr-2" />
                          Enabled
                        </>
                      ) : (
                        <>
                          <PowerOff className="w-4 h-4 mr-2" />
                          Disabled
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
              
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
                  
                  {/* Enabled Service Option */}
                  <div className="flex items-center space-x-2 p-4 border border-gray-200 rounded-lg bg-green-50">
                    <input
                      type="checkbox"
                      id="enabled"
                      checked={serviceForm.enabled !== false}
                      onChange={(e) => setServiceForm({ ...serviceForm, enabled: e.target.checked })}
                      className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                    />
                    <Label htmlFor="enabled" className="text-sm font-medium text-gray-900">
                      Enabled (service is visible to users)
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
                  <div className="flex items-center gap-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900">All Services</h2>
                    <Button
                      onClick={() => fetchAllData(true)}
                      disabled={refreshing}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  </div>
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
                      <div 
                        key={service.id} 
                        className={`p-4 rounded-xl transition-all ${
                          service.enabled === false 
                            ? 'bg-gray-100/50 border-2 border-gray-300 opacity-75' 
                            : 'bg-white/50 border-2 border-green-200'
                        }`}
                      >
                        {editingService?.id === service.id ? (
                          <ServiceEditForm 
                            service={service} 
                            onSave={(updates) => handleUpdateService(service.id, updates)}
                            onCancel={() => setEditingService(null)}
                          />
                        ) : (
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="flex items-center gap-2">
                                  {service.enabled !== false ? (
                                    <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
                                  ) : (
                                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                  )}
                                  <p className={`font-medium ${service.enabled === false ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                                    {service.name}
                                  </p>
                                </div>
                                {service.enabled !== false ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full border border-green-300">
                                    <CheckCircle className="w-3 h-3" />
                                    Enabled
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full border border-red-300">
                                    <PowerOff className="w-3 h-3" />
                                    Disabled
                                  </span>
                                )}
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
                              <p className={`text-sm ${service.enabled === false ? 'text-gray-400' : 'text-gray-600'}`}>
                                {service.platform} • {service.service_type}
                              </p>
                              <p className={`text-sm ${service.enabled === false ? 'text-gray-400' : 'text-gray-600'}`}>
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
                                onClick={() => handleToggleService(service.id, service.enabled !== false)}
                                variant={service.enabled === false ? "default" : "outline"}
                                size="sm"
                                className={service.enabled === false ? "bg-green-600 hover:bg-green-700" : ""}
                                title={service.enabled === false ? "Enable service" : "Disable service"}
                              >
                                {service.enabled === false ? (
                                  <Power className="w-4 h-4" />
                                ) : (
                                  <PowerOff className="w-4 h-4" />
                                )}
                              </Button>
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

            {/* Users Section */}
            <TabsContent value="users" className="lg:mt-0">
            <div className="glass p-4 sm:p-6 rounded-3xl">
              <div className="flex flex-col gap-4 mb-6">
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                  <div className="flex items-center gap-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900">All Users</h2>
                    <Button
                      onClick={() => fetchAllData(true)}
                      disabled={refreshing}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  </div>
                </div>
                {/* Search and Date Filter */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                      placeholder="Search by username, email, or phone..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                  <div>
                    <Input
                      type="date"
                      placeholder="Filter by date"
                      value={userDateFilter}
                      onChange={(e) => setUserDateFilter(e.target.value)}
                      className="w-full"
                    />
              </div>
                </div>
              </div>
                {filteredUsers.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">No users found</p>
                ) : (
                <>
                  <div className="overflow-hidden rounded-xl border border-white/20">
                    <div className="max-h-[600px] overflow-y-auto overflow-x-auto">
                      {/* Fixed Header */}
                      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white sticky top-0 z-10 min-w-[1200px]">
                        <div className="grid grid-cols-12 gap-4 p-4 font-semibold text-sm">
                          <div className="col-span-2">Name</div>
                          <div className="col-span-3">Email</div>
                          <div className="col-span-2">Phone</div>
                          <div className="col-span-1">Role</div>
                          <div className="col-span-1">Balance</div>
                          <div className="col-span-2">Joined Date</div>
                          <div className="col-span-1">Actions</div>
                        </div>
                      </div>
                      {/* Scrollable List */}
                      <div className="divide-y divide-gray-200/50 min-w-[1200px]">
                        {paginatedUsers.map((u) => (
                          <div key={u.id} className="bg-white/50 hover:bg-white/70 transition-colors">
                      {editingUser?.id === u.id ? (
                              <div className="p-4">
                        <UserEditForm 
                          user={u} 
                          onSave={(updates) => handleUpdateUser(u.id, updates)}
                          onCancel={() => setEditingUser(null)}
                        />
                              </div>
                            ) : (
                              <div className="grid grid-cols-12 gap-4 p-4 items-center">
                                {/* Name */}
                                <div className="col-span-2">
                                  <p className="font-medium text-gray-900 break-words">{u.name}</p>
                    </div>
                                {/* Email */}
                                <div className="col-span-3">
                                  <p className="text-sm text-gray-700 break-all">{u.email}</p>
                                </div>
                                {/* Phone */}
                                <div className="col-span-2">
                                  <p className="text-sm text-gray-700 break-words">{u.phone_number || 'N/A'}</p>
                                </div>
                                {/* Role */}
                                <div className="col-span-1">
                                  <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${
                        u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {u.role}
                      </span>
                    </div>
                                {/* Balance */}
                                <div className="col-span-1">
                                  <p className="font-semibold text-gray-900 whitespace-nowrap">₵{u.balance.toFixed(2)}</p>
                                </div>
                                {/* Joined Date */}
                                <div className="col-span-2">
                                  <p className="text-sm text-gray-700 whitespace-nowrap">{new Date(u.created_at).toLocaleDateString()}</p>
                                  <p className="text-xs text-gray-500 whitespace-nowrap">{new Date(u.created_at).toLocaleTimeString()}</p>
                                </div>
                                {/* Actions */}
                                <div className="col-span-1">
                            <Button
                              onClick={() => setEditingUser(u)}
                              variant="outline"
                              size="sm"
                                    className="text-xs whitespace-nowrap"
                            >
                                    <Edit className="w-3 h-3 mr-1" />
                              Edit
                            </Button>
                  </div>
                        </div>
                      )}
                    </div>
                        ))}
              </div>
                    </div>
                  </div>
                  {/* Pagination Controls */}
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-gray-600">
                      Showing {startUserIndex + 1} to {Math.min(endUserIndex, filteredUsers.length)} of {filteredUsers.length} users
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => setUsersPage(prev => Math.max(1, prev - 1))}
                        disabled={usersPage === 1}
                        variant="outline"
                        size="sm"
                      >
                        Previous
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalUsersPages) }, (_, i) => {
                          let pageNum;
                          if (totalUsersPages <= 5) {
                            pageNum = i + 1;
                          } else if (usersPage <= 3) {
                            pageNum = i + 1;
                          } else if (usersPage >= totalUsersPages - 2) {
                            pageNum = totalUsersPages - 4 + i;
                          } else {
                            pageNum = usersPage - 2 + i;
                          }
                          return (
                            <Button
                              key={pageNum}
                              onClick={() => setUsersPage(pageNum)}
                              variant={usersPage === pageNum ? "default" : "outline"}
                              size="sm"
                              className={usersPage === pageNum ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white" : ""}
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        onClick={() => setUsersPage(prev => Math.min(totalUsersPages, prev + 1))}
                        disabled={usersPage === totalUsersPages}
                        variant="outline"
                        size="sm"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

            {/* Transactions Section */}
            <TabsContent value="transactions" className="lg:mt-0">
            <div className="glass p-4 sm:p-6 rounded-3xl">
              <div className="flex flex-col gap-4 mb-6">
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                  <div className="flex items-center gap-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900">All Transactions</h2>
                    <Button
                      onClick={() => fetchAllData(true)}
                      disabled={refreshing}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Select value={transactionTypeFilter} onValueChange={setTransactionTypeFilter}>
                      <SelectTrigger className="w-full sm:w-40">
                        <Filter className="w-4 h-4 mr-2" />
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="deposit">Deposit</SelectItem>
                        <SelectItem value="order">Order</SelectItem>
                        <SelectItem value="refund">Refund</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={transactionStatusFilter} onValueChange={setTransactionStatusFilter}>
                      <SelectTrigger className="w-full sm:w-40">
                        <Filter className="w-4 h-4 mr-2" />
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* Search and Date Filter */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Search by transaction ID, username, or email..."
                      value={transactionSearch}
                      onChange={(e) => setTransactionSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <div>
                    <Input
                      type="date"
                      placeholder="Filter by date"
                      value={transactionDateFilter}
                      onChange={(e) => setTransactionDateFilter(e.target.value)}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
              {filteredTransactions.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">No transactions found</p>
                ) : (
                <>
                  <div className="overflow-hidden rounded-xl border border-white/20">
                    <div className="max-h-[600px] overflow-y-auto overflow-x-auto">
                      {/* Fixed Header */}
                      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white sticky top-0 z-10 min-w-[1200px]">
                        <div className="grid grid-cols-[1.5fr_1.5fr_1.5fr_1.5fr_2fr_2fr_1fr_1fr] gap-4 p-4 font-semibold text-sm">
                          <div className="text-center">Type</div>
                          <div className="text-center">Status</div>
                          <div className="text-center">Amount</div>
                          <div className="text-center">Time</div>
                          <div className="text-center">User</div>
                          <div className="text-center">Transaction ID</div>
                          <div className="text-center">Balance Status</div>
                          <div className="text-center">Actions</div>
                        </div>
                      </div>
                      {/* Scrollable List */}
                      <div className="divide-y divide-gray-200/50 min-w-[1200px]">
                        {paginatedTransactions.map((transaction) => (
                          <div key={transaction.id} className="bg-white/50 hover:bg-white/70 transition-colors">
                            <div className="grid grid-cols-[1.5fr_1.5fr_1.5fr_1.5fr_2fr_2fr_1fr_1fr] gap-4 p-4 items-center">
                              {/* Type */}
                              <div className="flex justify-center">
                                <span className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                                  transaction.type === 'deposit' 
                                    ? 'bg-green-100 text-green-700' 
                                    : transaction.type === 'refund'
                                    ? 'bg-green-100 text-green-700'
                                    : transaction.type === 'order'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {transaction.type === 'deposit' ? 'Deposit' : 
                                   transaction.type === 'refund' ? 'Refund' :
                                   transaction.type === 'order' ? 'Order' : 
                                   transaction.type}
                                </span>
                              </div>
                              {/* Status */}
                              <div className="flex flex-col items-center gap-1">
                                <span className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                                  transaction.status === 'approved' 
                                    ? 'bg-green-100 text-green-700'
                                    : transaction.status === 'pending'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-red-100 text-red-700'
                                }`}>
                                  {transaction.status}
                                </span>
                                {/* Show Paystack status for deposit transactions */}
                                {transaction.type === 'deposit' && transaction.paystack_status && (
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                    transaction.paystack_status === 'success' ? 'bg-green-100 text-green-700' :
                                    transaction.paystack_status === 'failed' ? 'bg-red-100 text-red-700' :
                                    transaction.paystack_status === 'abandoned' ? 'bg-orange-100 text-orange-700' :
                                    'bg-gray-100 text-gray-700'
                                  }`}>
                                    {transaction.paystack_status}
                                  </span>
                                )}
                              </div>
                              {/* Amount */}
                              <div className="text-center">
                                <p className={`font-semibold ${transaction.type === 'deposit' || transaction.type === 'refund' ? 'text-green-600' : 'text-red-600'}`}>
                                  {transaction.type === 'deposit' || transaction.type === 'refund' ? '+' : '-'}₵{transaction.amount.toFixed(2)}
                                </p>
                              </div>
                              {/* Time */}
                              <div className="text-center">
                                <p className="text-sm text-gray-700">{new Date(transaction.created_at).toLocaleDateString()}</p>
                                <p className="text-xs text-gray-500">{new Date(transaction.created_at).toLocaleTimeString()}</p>
                              </div>
                              {/* User */}
                              <div className="text-center">
                                <p className="font-medium text-gray-900 text-sm">{transaction.profiles?.name || 'Unknown'}</p>
                                <p className="text-xs text-gray-600 break-all">{transaction.profiles?.email || transaction.user_id.slice(0, 8)}</p>
                              </div>
                              {/* Transaction ID */}
                              <div className="text-center">
                                <p className="text-xs text-gray-700 break-all">{transaction.id}</p>
                                {transaction.paystack_reference && (
                                  <p className="text-xs text-gray-500">Ref: {transaction.paystack_reference}</p>
                                )}
                                {transaction.order_id && (
                                  <p className="text-xs text-gray-500">Order: {transaction.order_id.slice(0, 8)}...</p>
                                )}
                              </div>
                              {/* Balance Status */}
                              <div className="flex justify-center">
                                {(() => {
                                  const balanceCheck = getBalanceCheckResult(transaction);
                                  if (balanceCheck === 'not_updated') {
                                    return (
                                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                        <span className="whitespace-nowrap">not-updated</span>
                                      </span>
                                    );
                                  } else if (balanceCheck === 'updated') {
                                    return (
                                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                        Updated
                                      </span>
                                    );
                                  } else if (balanceCheck === 'checking') {
                                    return (
                                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                                        Checking...
                                      </span>
                                    );
                                  } else if (balanceCheck === 'unknown') {
                                    return (
                                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                        Unknown
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                              {/* Actions */}
                              <div className="flex justify-center">
                                {(() => {
                                  const balanceCheck = getBalanceCheckResult(transaction);
                                  if (balanceCheck === 'not_updated') {
                                    return (
                                      <Button
                                        onClick={() => handleManualCredit(transaction)}
                                        disabled={manuallyCrediting === transaction.id}
                                        variant="outline"
                                        size="sm"
                                        className="text-xs whitespace-nowrap text-green-600 hover:text-green-700 border-green-300"
                                        title="Credit balance to user"
                                      >
                                        {manuallyCrediting === transaction.id ? 'Crediting...' : 'Credit Balance'}
                                      </Button>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {/* Pagination Controls */}
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-gray-600">
                      Showing {startTransactionIndex + 1} to {Math.min(endTransactionIndex, filteredTransactions.length)} of {filteredTransactions.length} transactions
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => setTransactionsPage(prev => Math.max(1, prev - 1))}
                        disabled={transactionsPage === 1}
                        variant="outline"
                        size="sm"
                      >
                        Previous
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalTransactionsPages) }, (_, i) => {
                          let pageNum;
                          if (totalTransactionsPages <= 5) {
                            pageNum = i + 1;
                          } else if (transactionsPage <= 3) {
                            pageNum = i + 1;
                          } else if (transactionsPage >= totalTransactionsPages - 2) {
                            pageNum = totalTransactionsPages - 4 + i;
                          } else {
                            pageNum = transactionsPage - 2 + i;
                          }
                          return (
                            <Button
                              key={pageNum}
                              onClick={() => setTransactionsPage(pageNum)}
                              variant={transactionsPage === pageNum ? "default" : "outline"}
                              size="sm"
                              className={transactionsPage === pageNum ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white" : ""}
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        onClick={() => setTransactionsPage(prev => Math.min(totalTransactionsPages, prev + 1))}
                        disabled={transactionsPage === totalTransactionsPages}
                        variant="outline"
                        size="sm"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

            {/* Support Section */}
            <TabsContent value="support" className="lg:mt-0">
            <div className="glass p-4 sm:p-6 rounded-3xl">
              <div className="flex flex-col gap-4 mb-6">
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                  <div className="flex items-center gap-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Support Tickets</h2>
                    <Button
                      onClick={() => fetchAllData(true)}
                      disabled={refreshing}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  </div>
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
                {/* Search and Date Filter */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Search by ticket ID, username, email, subject, or message..."
                      value={ticketSearch}
                      onChange={(e) => setTicketSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <div>
                    <Input
                      type="date"
                      placeholder="Filter by date"
                      value={ticketDateFilter}
                      onChange={(e) => setTicketDateFilter(e.target.value)}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {filteredTickets.length === 0 ? (
                <p className="text-gray-600 text-center py-8">No support tickets found</p>
              ) : (
                <>
                  <div className="overflow-hidden rounded-xl border border-white/20">
                    <div className="max-h-[600px] overflow-y-auto overflow-x-auto">
                      {/* Fixed Header */}
                      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white sticky top-0 z-10 min-w-[1400px]">
                        <div className="grid grid-cols-12 gap-4 p-4 font-semibold text-sm">
                          <div className="col-span-1.5">Status</div>
                          <div className="col-span-1.5">Ticket ID</div>
                          <div className="col-span-2">Time</div>
                          <div className="col-span-2">User</div>
                          <div className="col-span-1.5">Subject</div>
                          <div className="col-span-2">Message</div>
                          <div className="col-span-2">Response</div>
                          <div className="col-span-1">Actions</div>
                        </div>
                      </div>
                      {/* Scrollable List */}
                      <div className="divide-y divide-gray-200/50 min-w-[1400px]">
                        {paginatedTickets.map((ticket) => {
                    const statusConfig = {
                      open: { label: 'Open', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
                      in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-700', icon: Clock },
                      resolved: { label: 'Resolved', color: 'bg-green-100 text-green-700', icon: CheckCircle },
                      closed: { label: 'Closed', color: 'bg-gray-100 text-gray-700', icon: XCircle }
                    };
                    const status = statusConfig[ticket.status] || statusConfig.open;
                    const StatusIcon = status.icon;

                    return (
                            <div key={ticket.id} className="bg-white/50 hover:bg-white/70 transition-colors">
                              {editingTicket === ticket.id ? (
                                <div className="p-4">
                                  <div className="mb-4">
                                    <div className="grid grid-cols-12 gap-4 p-4 items-center">
                                      <div className="col-span-1.5">
                                        <span className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 w-fit ${status.color}`}>
                                          <StatusIcon className="w-3.5 h-3.5" />
                                {status.label}
                              </span>
                            </div>
                                      <div className="col-span-1.5">
                                        <p className="text-xs text-gray-700">{ticket.id.slice(0, 8)}...</p>
                              </div>
                                      <div className="col-span-2">
                                        <p className="text-sm text-gray-700">{new Date(ticket.created_at).toLocaleDateString()}</p>
                                        <p className="text-xs text-gray-500">{new Date(ticket.created_at).toLocaleTimeString()}</p>
                          </div>
                                      <div className="col-span-2">
                                        <p className="font-medium text-gray-900 text-sm">{ticket.profiles?.name || ticket.name || 'Unknown'}</p>
                                        <p className="text-xs text-gray-600 break-all">{ticket.profiles?.email || ticket.email || ''}</p>
                                      </div>
                                      <div className="col-span-1.5">
                                        <p className="text-sm text-gray-900 font-medium line-clamp-2">{ticket.subject || 'No subject'}</p>
                                      </div>
                                      <div className="col-span-2">
                                        <p className="text-xs text-gray-700 line-clamp-2">{ticket.message}</p>
                                      </div>
                                      <div className="col-span-2">
                                        <p className="text-xs text-gray-700 line-clamp-2">{ticket.admin_response || 'No response yet'}</p>
                                      </div>
                                      <div className="col-span-1">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => {
                                            setEditingTicket(null);
                                            setTicketResponse('');
                                          }}
                                          className="text-xs"
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="border-t border-gray-200 pt-4 space-y-3">
                                    <div>
                                      <Label>Status</Label>
                                <Select
                                  value={ticket.status}
                                  onValueChange={(value) => handleUpdateTicketStatus(ticket.id, value)}
                                >
                                        <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="open">Open</SelectItem>
                                    <SelectItem value="in_progress">In Progress</SelectItem>
                                    <SelectItem value="resolved">Resolved</SelectItem>
                                    <SelectItem value="closed">Closed</SelectItem>
                                  </SelectContent>
                                </Select>
                                    </div>
                                    <div>
                                      <Label>Response</Label>
                                <Textarea
                                  placeholder="Add your response..."
                                  value={ticketResponse}
                                  onChange={(e) => setTicketResponse(e.target.value)}
                                  className="min-h-[100px]"
                                />
                                    </div>
                                  <Button
                                    size="sm"
                                    onClick={() => handleAddTicketResponse(ticket.id)}
                                      className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                                  >
                                    <Send className="w-4 h-4 mr-1" />
                                    Send Response
                                  </Button>
                                </div>
                              </div>
                            ) : (
                                <div className="grid grid-cols-12 gap-4 p-4 items-center">
                                  {/* Status */}
                                  <div className="col-span-1.5">
                                    <span className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 w-fit ${status.color}`}>
                                      <StatusIcon className="w-3.5 h-3.5" />
                                      {status.label}
                                    </span>
                                  </div>
                                  {/* Ticket ID */}
                                  <div className="col-span-1.5">
                                    <p className="text-xs text-gray-700">{ticket.id.slice(0, 8)}...</p>
                                    {ticket.order_id && (
                                      <p className="text-xs text-gray-500">Order: {ticket.order_id.slice(0, 8)}</p>
                                    )}
                                  </div>
                                  {/* Time */}
                                  <div className="col-span-2">
                                    <p className="text-sm text-gray-700">{new Date(ticket.created_at).toLocaleDateString()}</p>
                                    <p className="text-xs text-gray-500">{new Date(ticket.created_at).toLocaleTimeString()}</p>
                                    {ticket.updated_at !== ticket.created_at && (
                                      <p className="text-xs text-gray-400">Updated</p>
                                    )}
                                  </div>
                                  {/* User */}
                                  <div className="col-span-2">
                                    <p className="font-medium text-gray-900 text-sm">{ticket.profiles?.name || ticket.name || 'Unknown'}</p>
                                    <p className="text-xs text-gray-600 break-all">{ticket.profiles?.email || ticket.email || ''}</p>
                                  </div>
                                  {/* Subject */}
                                  <div className="col-span-1.5">
                                    <p className="text-sm text-gray-900 font-medium line-clamp-2">{ticket.subject || 'No subject'}</p>
                                  </div>
                                  {/* Message */}
                                  <div className="col-span-2">
                                    <p className="text-xs text-gray-700 line-clamp-3 break-words">{ticket.message}</p>
                                  </div>
                                  {/* Response */}
                                  <div className="col-span-2">
                                    {ticket.admin_response ? (
                                      <p className="text-xs text-gray-700 line-clamp-3 break-words">{ticket.admin_response}</p>
                                    ) : (
                                      <p className="text-xs text-gray-400 italic">No response yet</p>
                                    )}
                                  </div>
                                  {/* Actions */}
                                  <div className="col-span-1">
                              <Button
                                size="sm"
                                onClick={() => {
                                  setEditingTicket(ticket.id);
                                  setTicketResponse(ticket.admin_response || '');
                                }}
                                      className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-xs whitespace-nowrap"
                              >
                                      <Edit className="w-3 h-3 mr-1" />
                                Respond
                              </Button>
                                  </div>
                                </div>
                            )}
                          </div>
                          );
                        })}
                        </div>
                      </div>
                  </div>
                  {/* Pagination Controls */}
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-gray-600">
                      Showing {startTicketIndex + 1} to {Math.min(endTicketIndex, filteredTickets.length)} of {filteredTickets.length} tickets
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => setTicketsPage(prev => Math.max(1, prev - 1))}
                        disabled={ticketsPage === 1}
                        variant="outline"
                        size="sm"
                      >
                        Previous
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalTicketsPages) }, (_, i) => {
                          let pageNum;
                          if (totalTicketsPages <= 5) {
                            pageNum = i + 1;
                          } else if (ticketsPage <= 3) {
                            pageNum = i + 1;
                          } else if (ticketsPage >= totalTicketsPages - 2) {
                            pageNum = totalTicketsPages - 4 + i;
                          } else {
                            pageNum = ticketsPage - 2 + i;
                          }
                          return (
                            <Button
                              key={pageNum}
                              onClick={() => setTicketsPage(pageNum)}
                              variant={ticketsPage === pageNum ? "default" : "outline"}
                              size="sm"
                              className={ticketsPage === pageNum ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white" : ""}
                            >
                              {pageNum}
                            </Button>
                    );
                  })}
                </div>
                      <Button
                        onClick={() => setTicketsPage(prev => Math.min(totalTicketsPages, prev + 1))}
                        disabled={ticketsPage === totalTicketsPages}
                        variant="outline"
                        size="sm"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

            {/* Balance Section */}
            <TabsContent value="balance" className="lg:mt-0">
            <div className="space-y-6">
              {/* User Balances List */}
              <div className="glass p-4 sm:p-6 rounded-3xl">
                <div className="flex flex-col gap-4 mb-6">
                  <div className="flex items-center gap-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900">User Balances</h2>
                    <Button
                      onClick={() => fetchAllData(true)}
                      disabled={refreshing}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  </div>
                  {/* Search and Date Filter */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input
                        placeholder="Search by username, email, or phone..."
                        value={balanceListSearch}
                        onChange={(e) => setBalanceListSearch(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <div>
                      <Input
                        type="date"
                        placeholder="Filter by date"
                        value={balanceDateFilter}
                        onChange={(e) => setBalanceDateFilter(e.target.value)}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
                {filteredBalanceUsers.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">No users found</p>
                ) : (
                  <>
                    <div className="overflow-hidden rounded-xl border border-white/20">
                      <div className="max-h-[600px] overflow-y-auto overflow-x-auto">
                        {/* Fixed Header */}
                        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white sticky top-0 z-10 min-w-[1100px]">
                          <div className="grid grid-cols-12 gap-4 p-4 font-semibold text-sm">
                            <div className="col-span-2">Name</div>
                            <div className="col-span-3">Email</div>
                            <div className="col-span-2">Phone</div>
                            <div className="col-span-1">Role</div>
                            <div className="col-span-2">Balance</div>
                            <div className="col-span-1.5">Joined Date</div>
                            <div className="col-span-0.5">Actions</div>
                          </div>
                        </div>
                        {/* Scrollable List */}
                        <div className="divide-y divide-gray-200/50 min-w-[1100px]">
                          {paginatedBalanceUsers.map((u) => (
                            <div key={u.id} className="bg-white/50 hover:bg-white/70 transition-colors">
                              <div className="grid grid-cols-12 gap-4 p-4 items-center">
                                {/* Name */}
                                <div className="col-span-2">
                                  <p className="font-medium text-gray-900 break-words">{u.name}</p>
                                </div>
                                {/* Email */}
                                <div className="col-span-3">
                                  <p className="text-sm text-gray-700 break-all">{u.email}</p>
                                </div>
                                {/* Phone */}
                                <div className="col-span-2">
                                  <p className="text-sm text-gray-700 break-words">{u.phone_number || 'N/A'}</p>
                                </div>
                                {/* Role */}
                                <div className="col-span-1">
                                  <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${
                                    u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                                  }`}>
                                    {u.role}
                                  </span>
                                </div>
                                {/* Balance */}
                                <div className="col-span-2">
                                  <p className="font-semibold text-gray-900 whitespace-nowrap">₵{u.balance.toFixed(2)}</p>
                                </div>
                                {/* Joined Date */}
                                <div className="col-span-1.5">
                                  <p className="text-sm text-gray-700 whitespace-nowrap">{new Date(u.created_at).toLocaleDateString()}</p>
                                  <p className="text-xs text-gray-500 whitespace-nowrap">{new Date(u.created_at).toLocaleTimeString()}</p>
                                </div>
                                {/* Actions */}
                                <div className="col-span-0.5">
                                  <Button
                                    onClick={() => {
                                      setBalanceAdjustment({ ...balanceAdjustment, userId: u.id });
                                      setBalanceUserSearch(u.name || u.email);
                                      // Scroll to the adjustment form
                                      setTimeout(() => {
                                        const formElement = document.querySelector('[data-balance-form]');
                                        if (formElement) {
                                          formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                        }
                                      }, 100);
                                    }}
                                    variant="outline"
                                    size="sm"
                                    className="text-xs whitespace-nowrap"
                                    title="Adjust balance"
                                  >
                                    <Edit className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    {/* Pagination Controls */}
                    <div className="flex items-center justify-between mt-4">
                      <div className="text-sm text-gray-600">
                        Showing {startBalanceIndex + 1} to {Math.min(endBalanceIndex, filteredBalanceUsers.length)} of {filteredBalanceUsers.length} users
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => setBalancePage(prev => Math.max(1, prev - 1))}
                          disabled={balancePage === 1}
                          variant="outline"
                          size="sm"
                        >
                          Previous
                        </Button>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(5, totalBalancePages) }, (_, i) => {
                            let pageNum;
                            if (totalBalancePages <= 5) {
                              pageNum = i + 1;
                            } else if (balancePage <= 3) {
                              pageNum = i + 1;
                            } else if (balancePage >= totalBalancePages - 2) {
                              pageNum = totalBalancePages - 4 + i;
                            } else {
                              pageNum = balancePage - 2 + i;
                            }
                            return (
                              <Button
                                key={pageNum}
                                onClick={() => setBalancePage(pageNum)}
                                variant={balancePage === pageNum ? "default" : "outline"}
                                size="sm"
                                className={balancePage === pageNum ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white" : ""}
                              >
                                {pageNum}
                              </Button>
                            );
                          })}
                        </div>
                        <Button
                          onClick={() => setBalancePage(prev => Math.min(totalBalancePages, prev + 1))}
                          disabled={balancePage === totalBalancePages}
                          variant="outline"
                          size="sm"
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
              
              {/* Manual Balance Adjustment Form */}
              <div className="glass p-4 sm:p-8 rounded-3xl max-w-2xl" data-balance-form>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Manual Balance Adjustment</h2>
              <div className="space-y-5">
                <div>
                  <Label>Search User</Label>
                  <div className="relative user-search-dropdown-container">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none z-20" />
                    <Input
                      type="text"
                      placeholder="Search by name, email, or phone number..."
                      value={balanceUserSearch}
                      onChange={(e) => {
                        const value = e.target.value;
                        setBalanceUserSearch(value);
                        if (value.length > 0 && users.length > 0) {
                          setBalanceUserDropdownOpen(true);
                        } else if (value.length === 0) {
                          setBalanceUserDropdownOpen(false);
                        }
                      }}
                      onFocus={() => {
                        if (users.length > 0) {
                          setBalanceUserDropdownOpen(true);
                        }
                      }}
                      onBlur={(e) => {
                        setTimeout(() => {
                          const activeElement = document.activeElement;
                          if (!activeElement || !activeElement.closest('.user-search-dropdown-container')) {
                            setBalanceUserDropdownOpen(false);
                          }
                        }, 150);
                      }}
                      className="rounded-xl bg-white/70 pl-10 z-10"
                      autoComplete="off"
                    />
                    
                    {/* Dropdown with filtered users */}
                    {balanceUserDropdownOpen && users.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                        {(() => {
                          const filteredUsers = users.filter(u => 
                            !balanceUserSearch || 
                            u.name?.toLowerCase().includes(balanceUserSearch.toLowerCase()) ||
                            u.email?.toLowerCase().includes(balanceUserSearch.toLowerCase()) ||
                            u.phone_number?.toLowerCase().includes(balanceUserSearch.toLowerCase())
                          );
                          
                          if (filteredUsers.length === 0) {
                            return (
                              <div className="p-3 text-sm text-gray-500 text-center">
                                No users found
                              </div>
                            );
                          }
                          
                          return filteredUsers.map((u) => {
                            const isSelected = balanceAdjustment.userId === u.id;
                            return (
                              <div
                                key={u.id}
                                onClick={() => {
                                  setBalanceAdjustment({ ...balanceAdjustment, userId: u.id });
                                  setBalanceUserSearch(u.name || u.email);
                                  setBalanceUserDropdownOpen(false);
                                }}
                                className={`p-3 cursor-pointer hover:bg-indigo-50 transition-colors ${
                                  isSelected ? 'bg-indigo-100' : ''
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-medium text-gray-900">{u.name}</p>
                                    <p className="text-xs text-gray-600">{u.email}</p>
                                    {u.phone_number && (
                                      <p className="text-xs text-gray-500">📱 {u.phone_number}</p>
                                    )}
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-semibold text-indigo-600">
                                      ₵{u.balance.toFixed(2)}
                                    </p>
                                    {isSelected && (
                                      <CheckCircle className="w-4 h-4 text-indigo-600 mt-1" />
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}
                  </div>
                  
                  {/* Show selected user */}
                  {balanceAdjustment.userId && (() => {
                    const selectedUser = users.find(u => u.id === balanceAdjustment.userId);
                    return selectedUser ? (
                      <div className="mt-2 p-3 bg-indigo-50 rounded-xl border border-indigo-200">
                        <p className="text-sm font-medium text-gray-900">
                          Selected: {selectedUser.name} ({selectedUser.email})
                        </p>
                        <p className="text-xs text-gray-600">
                          Current Balance: ₵{selectedUser.balance.toFixed(2)}
                        </p>
                      </div>
                    ) : null;
                  })()}
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
            </div>
          </TabsContent>
            </div>add
        </Tabs>
        </div>
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
    seller_only: service.seller_only || false,
    enabled: service.enabled === true || service.enabled === undefined ? true : false
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
      seller_only: formData.seller_only || false,
      enabled: formData.enabled === true
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
      <div className="flex items-center space-x-2 p-3 border border-gray-200 rounded-lg bg-green-50">
        <input
          type="checkbox"
          id="edit_enabled"
          checked={formData.enabled === true}
          onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
          className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
        />
        <Label htmlFor="edit_enabled" className="text-sm font-medium text-gray-900">
          Enabled (visible to users)
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
