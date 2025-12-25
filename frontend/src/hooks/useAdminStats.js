import { useMemo } from 'react';
import { useAdminUsers } from './useAdminUsers';
import { useAdminOrders } from './useAdminOrders';
import { useAdminDeposits } from './useAdminDeposits';
import { useAdminServices } from './useAdminServices';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// Helper function to check if a date is within the selected date range
const isDateInRange = (dateString, dateRangeStart, dateRangeEnd) => {
  if (!dateRangeStart && !dateRangeEnd) return true;
  
  const itemDate = new Date(dateString);
  itemDate.setHours(0, 0, 0, 0);
  
  if (dateRangeStart && dateRangeEnd) {
    const start = new Date(dateRangeStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateRangeEnd);
    end.setHours(23, 59, 59, 999);
    return itemDate >= start && itemDate <= end;
  } else if (dateRangeStart) {
    const start = new Date(dateRangeStart);
    start.setHours(0, 0, 0, 0);
    return itemDate >= start;
  } else if (dateRangeEnd) {
    const end = new Date(dateRangeEnd);
    end.setHours(23, 59, 59, 999);
    return itemDate <= end;
  }
  
  return true;
};

export const useAdminStats = (options = {}) => {
  const { dateRangeStart, dateRangeEnd, enabled = true } = options;
  
  // Fetch ALL data needed for stats in parallel - no limits, optimized pagination
  // All data is fetched efficiently using batched pagination for maximum performance
  const { data: users = [], isLoading: usersLoading } = useAdminUsers({ enabled, useInfinite: false });
  const { data: orders = [], isLoading: ordersLoading } = useAdminOrders({ enabled, useInfinite: false, checkSMMGenStatus: false });
  const { data: deposits = [], isLoading: depositsLoading } = useAdminDeposits({ enabled, useInfinite: false });
  const { data: services = [], isLoading: servicesLoading } = useAdminServices({ enabled });
  
  // Fetch conversations instead of tickets
  const { data: conversations = [], isLoading: ticketsLoading } = useQuery({
    queryKey: ['admin', 'conversations', 'stats'],
    queryFn: async () => {
      // Check authentication first
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError || !session) {
        throw new Error('Authentication required');
      }

      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .order('created_at', { ascending: false });
      
      // Handle RLS permission errors (403)
      if (error) {
        if (error.code === '42501' || error.code === 'PGRST301') {
          throw new Error('Permission denied: Admin access required');
        }
        if (error.code !== '42P01') {
          throw error;
        }
      }
      return data || [];
    },
    enabled,
    staleTime: 1 * 60 * 1000,
    retry: false, // Don't retry on auth/permission errors
  });
  
  const tickets = conversations; // Use conversations as tickets for compatibility

  // Only show loading if we have no data at all - allow partial data to display
  const isLoading = (usersLoading && users.length === 0) || 
                    (ordersLoading && orders.length === 0) || 
                    (depositsLoading && deposits.length === 0) || 
                    (servicesLoading && services.length === 0) || 
                    (ticketsLoading && tickets.length === 0);

  // Calculate stats immediately using useMemo (optimized single-pass calculation)
  const stats = useMemo(() => {
      // Pre-calculate date boundaries once
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);
      
      // Pre-parse date range boundaries once
      let rangeStart = null;
      let rangeEnd = null;
      if (dateRangeStart) {
        rangeStart = new Date(dateRangeStart);
        rangeStart.setHours(0, 0, 0, 0);
      }
      if (dateRangeEnd) {
        rangeEnd = new Date(dateRangeEnd);
        rangeEnd.setHours(23, 59, 59, 999);
      }

      // Single-pass calculation for deposits (optimized)
      let pendingDeposits = 0;
      let confirmedDeposits = 0;
      let rejectedDeposits = 0;
      let totalDeposits = 0;
      let depositsToday = 0;
      let depositsAmountToday = 0;
      const currentDeposits = [];
      
      (deposits || []).forEach(d => {
        if (!isDateInRange(d.created_at, dateRangeStart, dateRangeEnd)) return;
        currentDeposits.push(d);
        
        const depositDate = new Date(d.created_at);
        const isToday = depositDate >= today && depositDate <= todayEnd;
        
        if (d.status === 'pending') pendingDeposits++;
        else if (d.status === 'approved') {
          confirmedDeposits++;
          const amount = parseFloat(d.amount || 0);
          totalDeposits += amount;
          if (isToday) depositsAmountToday += amount;
        }
        else if (d.status === 'rejected') rejectedDeposits++;
        
        if (isToday) depositsToday++;
      });

      // Single-pass calculation for orders (optimized)
      let completedOrders = 0;
      let processingOrders = 0;
      let cancelledOrders = 0;
      let refundedOrders = 0;
      let failedRefunds = 0;
      let totalRevenue = 0;
      let ordersToday = 0;
      let revenueToday = 0;
      const currentOrders = [];
      
      (orders || []).forEach(o => {
        const inRange = isDateInRange(o.created_at, dateRangeStart, dateRangeEnd);
        const orderDate = new Date(o.created_at);
        const isToday = orderDate >= today && orderDate <= todayEnd;
        
        if (inRange) {
          currentOrders.push(o);
          if (isToday) ordersToday++;
        }
        
        if (o.status === 'completed') {
          const cost = parseFloat(o.total_cost || 0);
          if (inRange) {
            completedOrders++;
            totalRevenue += cost;
            if (isToday) revenueToday += cost;
          }
        } else if (o.status === 'processing' || o.status === 'in progress') {
          if (inRange) processingOrders++;
        } else if (o.status === 'canceled' || o.status === 'cancelled') {
          if (inRange) cancelledOrders++;
        }
        
        if (o.refund_status === 'succeeded' && inRange) refundedOrders++;
        else if (o.refund_status === 'failed' && inRange) failedRefunds++;
      });

      // Single-pass calculation for conversations (optimized)
      let openTickets = 0;
      let inProgressTickets = 0;
      let resolvedTickets = 0;
      const currentTickets = [];
      
      (tickets || []).forEach(t => {
        if (!isDateInRange(t.created_at, dateRangeStart, dateRangeEnd)) return;
        currentTickets.push(t);
        
        if (t.status === 'open') openTickets++;
        else if (t.status === 'closed') resolvedTickets++;
        else if (t.status === 'resolved') resolvedTickets++;
      });

      // Single-pass calculation for users (optimized)
      let usersToday = 0;
      const currentUsers = [];
      
      (users || []).forEach(u => {
        if (!isDateInRange(u.created_at, dateRangeStart, dateRangeEnd)) return;
        currentUsers.push(u);
        
        const userDate = new Date(u.created_at);
        if (userDate >= today && userDate <= todayEnd) usersToday++;
      });

      const averageOrderValue = completedOrders > 0 ? totalRevenue / completedOrders : 0;

      // Optimized service type calculation - single pass with pre-computed checks
      const serviceTypeChecks = {
        like: (type, name) => type.includes('like') || name.includes('like'),
        follower: (type, name) => type.includes('follower') || name.includes('follower'),
        view: (type, name) => type.includes('view') || name.includes('view'),
        comment: (type, name) => type.includes('comment') || name.includes('comment'),
        share: (type, name) => type.includes('share') || name.includes('share'),
        subscriber: (type, name) => type.includes('subscriber') || name.includes('subscriber'),
      };
      
      let totalLikesSent = 0;
      let totalFollowersSent = 0;
      let totalViewsSent = 0;
      let totalCommentsSent = 0;
      let totalSharesSent = 0;
      let totalSubscribersSent = 0;
      
      // Single pass for service type calculations
      (orders || []).forEach(o => {
        if (o.status !== 'completed') return;
        
        // Check if this is a promotion package order or regular service order
        const isPromotionPackage = !!o.promotion_package_id;
        
        // Use promotion package data if available, otherwise use service data
        const serviceType = isPromotionPackage
          ? (o.promotion_packages?.service_type || '').toLowerCase()
          : (o.services?.service_type || '').toLowerCase();
        const serviceName = isPromotionPackage
          ? (o.promotion_packages?.name || '').toLowerCase()
          : (o.services?.name || '').toLowerCase();
        const quantity = parseInt(o.quantity || 0);
        
        if (serviceTypeChecks.like(serviceType, serviceName)) totalLikesSent += quantity;
        if (serviceTypeChecks.follower(serviceType, serviceName)) totalFollowersSent += quantity;
        if (serviceTypeChecks.view(serviceType, serviceName)) totalViewsSent += quantity;
        if (serviceTypeChecks.comment(serviceType, serviceName)) totalCommentsSent += quantity;
        if (serviceTypeChecks.share(serviceType, serviceName)) totalSharesSent += quantity;
        if (serviceTypeChecks.subscriber(serviceType, serviceName)) totalSubscribersSent += quantity;
      });

      return {
        total_users: currentUsers.length,
        total_orders: currentOrders.length,
        pending_deposits: pendingDeposits,
        total_revenue: totalRevenue,
        completed_orders: completedOrders,
        total_services: (services || []).length,
        confirmed_deposits: confirmedDeposits,
        total_deposits: totalDeposits,
        open_tickets: openTickets,
        users_today: usersToday,
        orders_today: ordersToday,
        deposits_today: depositsToday,
        deposits_amount_today: depositsAmountToday,
        revenue_today: revenueToday,
        processing_orders: processingOrders,
        cancelled_orders: cancelledOrders,
        failed_orders: 0,
        refunded_orders: refundedOrders,
        failed_refunds: failedRefunds,
        total_deposits_amount: totalDeposits,
        total_revenue_amount: totalRevenue,
        average_order_value: averageOrderValue,
        total_transactions: currentDeposits.length,
        rejected_deposits: rejectedDeposits,
        in_progress_tickets: inProgressTickets,
        resolved_tickets: resolvedTickets,
        total_likes_sent: totalLikesSent,
        total_followers_sent: totalFollowersSent,
        total_views_sent: totalViewsSent,
        total_comments_sent: totalCommentsSent,
        total_shares_sent: totalSharesSent,
        total_subscribers_sent: totalSubscribersSent,
      };
  }, [users, orders, deposits, services, tickets, dateRangeStart, dateRangeEnd]);

  return {
    data: stats,
    isLoading
  };
};


