import { useMemo } from 'react';
import { useAdminUsers } from './useAdminUsers';
import { useAdminOrders } from './useAdminOrders';
import { useAdminDeposits } from './useAdminDeposits';
import { useAdminServices } from './useAdminServices';
import { useAdminTickets } from './useAdminTickets';

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

  // For stats, we only need recent data (last 90 days) to calculate today's metrics and totals
  // This is much faster than fetching all records
  const limitForStats = 5000; // Limit to 5000 most recent records for stats calculation
  
  // Fetch data needed for stats in parallel - use limited queries for faster loading
  const { data: users = [], isLoading: usersLoading } = useAdminUsers({ enabled, useInfinite: false });
  const { data: orders = [], isLoading: ordersLoading } = useAdminOrders({ enabled, useInfinite: false, checkSMMGenStatus: false });
  const { data: deposits = [], isLoading: depositsLoading } = useAdminDeposits({ enabled, useInfinite: false });
  const { data: services = [], isLoading: servicesLoading } = useAdminServices({ enabled });
  const { data: tickets = [], isLoading: ticketsLoading } = useAdminTickets({ enabled });

  // Only show loading if we have no data at all - allow partial data to display
  const isLoading = (usersLoading && users.length === 0) || 
                    (ordersLoading && orders.length === 0) || 
                    (depositsLoading && deposits.length === 0) || 
                    (servicesLoading && services.length === 0) || 
                    (ticketsLoading && tickets.length === 0);

  // Calculate stats immediately using useMemo (no blocking query)
  const stats = useMemo(() => {
      // Filter by date range if specified
      const currentDeposits = (deposits || []).filter(d => isDateInRange(d.created_at, dateRangeStart, dateRangeEnd));
      const currentOrders = (orders || []).filter(o => isDateInRange(o.created_at, dateRangeStart, dateRangeEnd));
      const currentTickets = (tickets || []).filter(t => isDateInRange(t.created_at, dateRangeStart, dateRangeEnd));
      const currentUsers = (users || []).filter(u => isDateInRange(u.created_at, dateRangeStart, dateRangeEnd));
      
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

      const usersToday = currentUsers.filter(u => {
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

      const depositsAmountToday = currentDeposits
        .filter(d => {
          const depositDate = new Date(d.created_at);
          return depositDate >= today && depositDate <= todayEnd && d.status === 'approved';
        })
        .reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);

      const revenueToday = currentOrders
        .filter(o => {
          const orderDate = new Date(o.created_at);
          return orderDate >= today && orderDate <= todayEnd && o.status === 'completed';
        })
        .reduce((sum, o) => sum + parseFloat(o.total_cost || 0), 0);

      const processingOrders = currentOrders.filter(o => o.status === 'processing' || o.status === 'in progress').length;
      const cancelledOrders = currentOrders.filter(o => o.status === 'canceled' || o.status === 'cancelled').length;
      const refundedOrders = currentOrders.filter(o => o.refund_status === 'succeeded').length;
      const failedRefunds = currentOrders.filter(o => o.refund_status === 'failed').length;
      const rejectedDeposits = currentDeposits.filter(d => d.status === 'rejected').length;
      const inProgressTickets = currentTickets.filter(t => t.status === 'in_progress').length;
      const resolvedTickets = currentTickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;
      const averageOrderValue = completedOrders > 0 ? totalRevenue / completedOrders : 0;

      // Calculate service type totals from ALL completed orders (not filtered by date range)
      const completedOrdersList = (orders || []).filter(o => o.status === 'completed');
      
      const totalLikesSent = completedOrdersList
        .filter(o => {
          const serviceType = (o.services?.service_type || '').toLowerCase();
          const serviceName = (o.services?.name || '').toLowerCase();
          return serviceType.includes('like') || serviceName.includes('like');
        })
        .reduce((sum, o) => sum + parseInt(o.quantity || 0), 0);

      const totalFollowersSent = completedOrdersList
        .filter(o => {
          const serviceType = (o.services?.service_type || '').toLowerCase();
          const serviceName = (o.services?.name || '').toLowerCase();
          return serviceType.includes('follower') || serviceName.includes('follower');
        })
        .reduce((sum, o) => sum + parseInt(o.quantity || 0), 0);

      const totalViewsSent = completedOrdersList
        .filter(o => {
          const serviceType = (o.services?.service_type || '').toLowerCase();
          const serviceName = (o.services?.name || '').toLowerCase();
          return serviceType.includes('view') || serviceName.includes('view');
        })
        .reduce((sum, o) => sum + parseInt(o.quantity || 0), 0);

      const totalCommentsSent = completedOrdersList
        .filter(o => {
          const serviceType = (o.services?.service_type || '').toLowerCase();
          const serviceName = (o.services?.name || '').toLowerCase();
          return serviceType.includes('comment') || serviceName.includes('comment');
        })
        .reduce((sum, o) => sum + parseInt(o.quantity || 0), 0);

      const totalSharesSent = completedOrdersList
        .filter(o => {
          const serviceType = (o.services?.service_type || '').toLowerCase();
          const serviceName = (o.services?.name || '').toLowerCase();
          return serviceType.includes('share') || serviceName.includes('share');
        })
        .reduce((sum, o) => sum + parseInt(o.quantity || 0), 0);

      const totalSubscribersSent = completedOrdersList
        .filter(o => {
          const serviceType = (o.services?.service_type || '').toLowerCase();
          const serviceName = (o.services?.name || '').toLowerCase();
          return serviceType.includes('subscriber') || serviceName.includes('subscriber');
        })
        .reduce((sum, o) => sum + parseInt(o.quantity || 0), 0);

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


