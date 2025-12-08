import React, { memo, useMemo, useRef, useEffect, useCallback } from 'react';
import { useAdminStats } from '@/hooks/useAdminStats';
import { useAdminOrders } from '@/hooks/useAdminOrders';
import { useAdminDeposits } from '@/hooks/useAdminDeposits';
import AnimatedNumber from '@/components/admin/AnimatedNumber';
import { Button } from '@/components/ui/button';
import { 
  Users, ShoppingCart, DollarSign, Package, CheckCircle, Clock, AlertCircle,
  MessageSquare, UserPlus, Receipt, BarChart3, XCircle, CreditCard, Heart,
  Eye, MessageCircle, Share2, UserCheck, Activity, Bell
} from 'lucide-react';

const AdminStats = memo(({ 
  dateRangeStart, 
  dateRangeEnd, 
  referralStats = { total_referrals: 0, pending_bonuses: 0 },
  orders = [],
  deposits = [],
  allTransactions = [],
  getBalanceCheckResult = () => null,
  onSectionChange,
  paymentMethodSettings = {}
}) => {
  const { data: stats = {}, isLoading } = useAdminStats({ 
    dateRangeStart, 
    dateRangeEnd,
    enabled: true
  });

  const previousStatsRef = useRef(stats);

  useEffect(() => {
    previousStatsRef.current = stats;
  }, [stats]);

  const previousStats = previousStatsRef.current;

  const activePaymentMethods = useMemo(() => {
    return Object.values(paymentMethodSettings).filter(enabled => enabled === true).length;
  }, [paymentMethodSettings]);

  const handleSectionClick = useCallback((section) => {
    if (onSectionChange) {
      onSectionChange(section);
    }
  }, [onSectionChange]);

  const recentOrders = useMemo(() => orders.slice(0, 5), [orders]);
  const recentDeposits = useMemo(() => deposits.slice(0, 5), [deposits]);

  const balanceNotUpdatedCount = useMemo(() => {
    return allTransactions.filter(t => 
      t.type === 'deposit' && 
      t.status === 'approved' && 
      getBalanceCheckResult(t) === 'not_updated'
    ).length;
  }, [allTransactions, getBalanceCheckResult]);

  const statsWithPaymentMethods = {
    ...stats,
    active_payment_methods: activePaymentMethods
  };

  // Don't block rendering - show cards immediately with current data
  // Stats will update as data loads in the background
  return (
    <div className="space-y-6">
      <style>{`
        @keyframes pulse-update {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        .animate-pulse-on-update {
          animation: pulse-update 0.6s ease-in-out;
        }
      `}</style>

      {/* Enhanced Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3 sm:gap-4">
        {/* Users Today */}
        <div 
          className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer animate-pulse-on-update" 
          onClick={() => handleSectionClick('users')}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Users className="w-4 h-4 text-indigo-600" />
            </div>
            <span className="text-base sm:text-lg font-bold text-gray-900">
              <AnimatedNumber value={statsWithPaymentMethods.users_today || 0} previousValue={previousStats?.users_today} />
            </span>
          </div>
          <p className="text-xs sm:text-[10px] font-medium text-gray-600">Users Today</p>
          <p className="text-[10px] sm:text-[9px] text-gray-500 mt-0.5">{statsWithPaymentMethods.total_users || 0} Total</p>
        </div>

        {/* Deposits Today */}
        <div 
          className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer animate-pulse-on-update" 
          onClick={() => handleSectionClick('deposits')}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-emerald-600" />
            </div>
            <span className="text-base sm:text-lg font-bold text-gray-900">
              ₵<AnimatedNumber 
                value={statsWithPaymentMethods.deposits_amount_today || 0} 
                previousValue={previousStats?.deposits_amount_today} 
                formatter={(v) => Math.floor(v).toLocaleString()} 
              />
            </span>
          </div>
          <p className="text-xs sm:text-[10px] font-medium text-gray-600">Deposits Today</p>
        </div>

        {/* Total Deposits */}
        <div 
          className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer" 
          onClick={() => handleSectionClick('deposits')}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
              <Receipt className="w-4 h-4 text-emerald-600" />
            </div>
            <span className="text-base sm:text-lg font-bold text-gray-900">
              ₵<AnimatedNumber 
                value={statsWithPaymentMethods.total_deposits_amount || 0} 
                previousValue={previousStats?.total_deposits_amount} 
                formatter={(v) => Math.floor(v).toLocaleString()} 
              />
            </span>
          </div>
          <p className="text-xs sm:text-[10px] font-medium text-gray-600">Total Deposits</p>
          <p className="text-[10px] sm:text-[9px] text-gray-500 mt-0.5">{statsWithPaymentMethods.confirmed_deposits || 0} Confirmed</p>
        </div>

        {/* Orders Today */}
        <div 
          className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer animate-pulse-on-update" 
          onClick={() => handleSectionClick('orders')}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <ShoppingCart className="w-4 h-4 text-blue-600" />
            </div>
            <span className="text-base sm:text-lg font-bold text-gray-900">
              <AnimatedNumber value={statsWithPaymentMethods.orders_today || 0} previousValue={previousStats?.orders_today} />
            </span>
          </div>
          <p className="text-xs sm:text-[10px] font-medium text-gray-600">Orders Today</p>
          <p className="text-[10px] sm:text-[9px] text-gray-500 mt-0.5">{statsWithPaymentMethods.total_orders || 0} Total</p>
        </div>

        {/* Completed Orders */}
        <div 
          className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer" 
          onClick={() => handleSectionClick('orders')}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-green-600" />
            </div>
            <span className="text-base sm:text-lg font-bold text-gray-900">
              <AnimatedNumber value={statsWithPaymentMethods.completed_orders || 0} previousValue={previousStats?.completed_orders} />
            </span>
          </div>
          <p className="text-xs sm:text-[10px] font-medium text-gray-600">Completed</p>
          <p className="text-[10px] sm:text-[9px] text-gray-500 mt-0.5">{statsWithPaymentMethods.processing_orders || 0} Processing</p>
        </div>

        {/* Pending Deposits */}
        <div 
          className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer" 
          onClick={() => handleSectionClick('deposits')}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-yellow-600" />
            </div>
            <span className="text-base sm:text-lg font-bold text-gray-900">{statsWithPaymentMethods.pending_deposits || 0}</span>
          </div>
          <p className="text-xs sm:text-[10px] font-medium text-gray-600">Pending</p>
          <p className="text-[10px] sm:text-[9px] text-gray-500 mt-0.5">{statsWithPaymentMethods.confirmed_deposits || 0} Confirmed</p>
        </div>

        {/* Processing Orders */}
        <div 
          className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer" 
          onClick={() => handleSectionClick('orders')}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <span className="text-base sm:text-lg font-bold text-gray-900">{statsWithPaymentMethods.processing_orders || 0}</span>
          </div>
          <p className="text-xs sm:text-[10px] font-medium text-gray-600">Processing</p>
          <p className="text-[10px] sm:text-[9px] text-gray-500 mt-0.5">{statsWithPaymentMethods.cancelled_orders || 0} Cancelled</p>
        </div>

        {/* Open Support Tickets */}
        <div 
          className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer" 
          onClick={() => handleSectionClick('support')}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-blue-600" />
            </div>
            <span className="text-base sm:text-lg font-bold text-gray-900">{statsWithPaymentMethods.open_tickets || 0}</span>
          </div>
          <p className="text-xs sm:text-[10px] font-medium text-gray-600">Open Tickets</p>
          <p className="text-[10px] sm:text-[9px] text-gray-500 mt-0.5">{statsWithPaymentMethods.in_progress_tickets || 0} In Progress</p>
        </div>

        {/* Referrals */}
        <div 
          className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer" 
          onClick={() => handleSectionClick('referrals')}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-purple-600" />
            </div>
            <span className="text-base sm:text-lg font-bold text-gray-900">{referralStats.total_referrals || 0}</span>
          </div>
          <p className="text-xs sm:text-[10px] font-medium text-gray-600">Referrals</p>
          <p className="text-[10px] sm:text-[9px] text-gray-500 mt-0.5">{referralStats.pending_bonuses || 0} Pending</p>
        </div>

        {/* Total Services */}
        <div 
          className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer" 
          onClick={() => handleSectionClick('services')}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
              <Package className="w-4 h-4 text-purple-600" />
            </div>
            <span className="text-base sm:text-lg font-bold text-gray-900">{statsWithPaymentMethods.total_services || 0}</span>
          </div>
          <p className="text-xs sm:text-[10px] font-medium text-gray-600">Services</p>
          <p className="text-[10px] sm:text-[9px] text-gray-500 mt-0.5">Active</p>
        </div>

        {/* Total Transactions */}
        <div 
          className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer" 
          onClick={() => handleSectionClick('transactions')}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Receipt className="w-4 h-4 text-indigo-600" />
            </div>
            <span className="text-base sm:text-lg font-bold text-gray-900">{statsWithPaymentMethods.total_transactions || 0}</span>
          </div>
          <p className="text-xs sm:text-[10px] font-medium text-gray-600">Transactions</p>
          <p className="text-[10px] sm:text-[9px] text-gray-500 mt-0.5">All Time</p>
        </div>

        {/* Average Order Value */}
        <div 
          className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer" 
          onClick={() => handleSectionClick('orders')}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-purple-600" />
            </div>
            <span className="text-base sm:text-lg font-bold text-gray-900">
              ₵{(statsWithPaymentMethods.average_order_value || 0).toFixed(0)}
            </span>
          </div>
          <p className="text-xs sm:text-[10px] font-medium text-gray-600">Avg Order</p>
          <p className="text-[10px] sm:text-[9px] text-gray-500 mt-0.5">Per Order</p>
        </div>

        {/* Cancelled Orders */}
        <div 
          className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer" 
          onClick={() => handleSectionClick('orders')}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
              <XCircle className="w-4 h-4 text-orange-600" />
            </div>
            <span className="text-base sm:text-lg font-bold text-gray-900">{statsWithPaymentMethods.cancelled_orders || 0}</span>
          </div>
          <p className="text-xs sm:text-[10px] font-medium text-gray-600">Cancelled</p>
          <p className="text-[10px] sm:text-[9px] text-gray-500 mt-0.5">Orders</p>
        </div>

        {/* Rejected Deposits */}
        <div 
          className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer" 
          onClick={() => handleSectionClick('deposits')}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
              <XCircle className="w-4 h-4 text-red-600" />
            </div>
            <span className="text-base sm:text-lg font-bold text-gray-900">{statsWithPaymentMethods.rejected_deposits || 0}</span>
          </div>
          <p className="text-xs sm:text-[10px] font-medium text-gray-600">Rejected</p>
          <p className="text-[10px] sm:text-[9px] text-gray-500 mt-0.5">Deposits</p>
        </div>

        {/* Refunded Orders */}
        <div 
          className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer" 
          onClick={() => handleSectionClick('orders')}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
              <Receipt className="w-4 h-4 text-orange-600" />
            </div>
            <span className="text-base sm:text-lg font-bold text-gray-900">{statsWithPaymentMethods.refunded_orders || 0}</span>
          </div>
          <p className="text-xs sm:text-[10px] font-medium text-gray-600">Refunded</p>
          <p className="text-[10px] sm:text-[9px] text-gray-500 mt-0.5">{statsWithPaymentMethods.failed_refunds || 0} Failed</p>
        </div>

        {/* Active Payment Methods */}
        <div 
          className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer" 
          onClick={() => handleSectionClick('payment-methods')}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-teal-600" />
            </div>
            <span className="text-base sm:text-lg font-bold text-gray-900">
              <AnimatedNumber 
                value={activePaymentMethods} 
                previousValue={previousStats?.active_payment_methods} 
              />
            </span>
          </div>
          <p className="text-xs sm:text-[10px] font-medium text-gray-600">Payment Methods</p>
          <p className="text-[10px] sm:text-[9px] text-gray-500 mt-0.5">Active</p>
        </div>
      </div>

      {/* Service Type Stats Cards */}
      <div className="mt-6">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Service Statistics</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
          {/* Total Likes Sent */}
          <div 
            className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer animate-pulse-on-update" 
            onClick={() => handleSectionClick('orders')}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-pink-100 rounded-lg flex items-center justify-center">
                <Heart className="w-4 h-4 text-pink-600" />
              </div>
              <span className="text-base sm:text-lg font-bold text-gray-900">
                <AnimatedNumber value={statsWithPaymentMethods.total_likes_sent || 0} previousValue={previousStats?.total_likes_sent} />
              </span>
            </div>
            <p className="text-xs sm:text-[10px] font-medium text-gray-600">Likes Sent</p>
            <p className="text-[10px] sm:text-[9px] text-gray-500 mt-0.5">Total</p>
          </div>

          {/* Total Followers Sent */}
          <div 
            className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer animate-pulse-on-update" 
            onClick={() => handleSectionClick('orders')}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-base sm:text-lg font-bold text-gray-900">
                <AnimatedNumber value={statsWithPaymentMethods.total_followers_sent || 0} previousValue={previousStats?.total_followers_sent} />
              </span>
            </div>
            <p className="text-xs sm:text-[10px] font-medium text-gray-600">Followers Sent</p>
            <p className="text-[10px] sm:text-[9px] text-gray-500 mt-0.5">Total</p>
          </div>

          {/* Total Views Sent */}
          <div 
            className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer animate-pulse-on-update" 
            onClick={() => handleSectionClick('orders')}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-cyan-100 rounded-lg flex items-center justify-center">
                <Eye className="w-4 h-4 text-cyan-600" />
              </div>
              <span className="text-base sm:text-lg font-bold text-gray-900">
                <AnimatedNumber value={statsWithPaymentMethods.total_views_sent || 0} previousValue={previousStats?.total_views_sent} />
              </span>
            </div>
            <p className="text-xs sm:text-[10px] font-medium text-gray-600">Views Sent</p>
            <p className="text-[10px] sm:text-[9px] text-gray-500 mt-0.5">Total</p>
          </div>

          {/* Total Comments Sent */}
          <div 
            className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer" 
            onClick={() => handleSectionClick('orders')}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <MessageCircle className="w-4 h-4 text-green-600" />
              </div>
              <span className="text-base sm:text-lg font-bold text-gray-900">
                <AnimatedNumber value={statsWithPaymentMethods.total_comments_sent || 0} previousValue={previousStats?.total_comments_sent} />
              </span>
            </div>
            <p className="text-xs sm:text-[10px] font-medium text-gray-600">Comments Sent</p>
            <p className="text-[10px] sm:text-[9px] text-gray-500 mt-0.5">Total</p>
          </div>

          {/* Total Shares Sent */}
          <div 
            className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer" 
            onClick={() => handleSectionClick('orders')}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                <Share2 className="w-4 h-4 text-orange-600" />
              </div>
              <span className="text-base sm:text-lg font-bold text-gray-900">
                <AnimatedNumber value={statsWithPaymentMethods.total_shares_sent || 0} previousValue={previousStats?.total_shares_sent} />
              </span>
            </div>
            <p className="text-xs sm:text-[10px] font-medium text-gray-600">Shares Sent</p>
            <p className="text-[10px] sm:text-[9px] text-gray-500 mt-0.5">Total</p>
          </div>

          {/* Total Subscribers Sent */}
          <div 
            className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer" 
            onClick={() => handleSectionClick('orders')}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                <UserCheck className="w-4 h-4 text-red-600" />
              </div>
              <span className="text-base sm:text-lg font-bold text-gray-900">
                <AnimatedNumber value={statsWithPaymentMethods.total_subscribers_sent || 0} previousValue={previousStats?.total_subscribers_sent} />
              </span>
            </div>
            <p className="text-xs sm:text-[10px] font-medium text-gray-600">Subscribers Sent</p>
            <p className="text-[10px] sm:text-[9px] text-gray-500 mt-0.5">Total</p>
          </div>
        </div>
      </div>

      {/* Quick Actions & Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Quick Actions */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 sm:p-6 shadow-sm">
          <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-600" />
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => handleSectionClick('deposits')}
              variant="outline"
              className="flex flex-col items-center gap-2 h-auto py-4 hover:bg-indigo-50"
            >
              <DollarSign className="w-5 h-5 text-indigo-600" />
              <span className="text-xs">Review Deposits</span>
              {statsWithPaymentMethods.pending_deposits > 0 && (
                <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {statsWithPaymentMethods.pending_deposits}
                </span>
              )}
            </Button>
            <Button
              onClick={() => handleSectionClick('support')}
              variant="outline"
              className="flex flex-col items-center gap-2 h-auto py-4 hover:bg-indigo-50"
            >
              <MessageSquare className="w-5 h-5 text-indigo-600" />
              <span className="text-xs">Support Tickets</span>
              {statsWithPaymentMethods.open_tickets > 0 && (
                <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {statsWithPaymentMethods.open_tickets}
                </span>
              )}
            </Button>
            <Button
              onClick={() => handleSectionClick('orders')}
              variant="outline"
              className="flex flex-col items-center gap-2 h-auto py-4 hover:bg-indigo-50"
            >
              <ShoppingCart className="w-5 h-5 text-indigo-600" />
              <span className="text-xs">View Orders</span>
            </Button>
            <Button
              onClick={() => handleSectionClick('users')}
              variant="outline"
              className="flex flex-col items-center gap-2 h-auto py-4 hover:bg-indigo-50"
            >
              <Users className="w-5 h-5 text-indigo-600" />
              <span className="text-xs">Manage Users</span>
            </Button>
          </div>
        </div>

        {/* Alerts & Notifications */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 sm:p-6 shadow-sm">
          <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Bell className="w-5 h-5 text-yellow-600" />
            Alerts & Notifications
          </h3>
          <div className="space-y-3">
            {statsWithPaymentMethods.pending_deposits > 0 && (
              <div className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {statsWithPaymentMethods.pending_deposits} Pending Deposit{statsWithPaymentMethods.pending_deposits > 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-gray-600">Requires your attention</p>
                </div>
                <Button
                  onClick={() => handleSectionClick('deposits')}
                  size="sm"
                  variant="outline"
                  className="text-xs h-8"
                >
                  Review
                </Button>
              </div>
            )}
            {statsWithPaymentMethods.open_tickets > 0 && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <MessageSquare className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {statsWithPaymentMethods.open_tickets} Open Ticket{statsWithPaymentMethods.open_tickets > 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-gray-600">Awaiting response</p>
                </div>
                <Button
                  onClick={() => handleSectionClick('support')}
                  size="sm"
                  variant="outline"
                  className="text-xs h-8"
                >
                  View
                </Button>
              </div>
            )}
            {balanceNotUpdatedCount > 0 && (
              <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {balanceNotUpdatedCount} Balance{balanceNotUpdatedCount > 1 ? 's' : ''} Not Updated
                  </p>
                  <p className="text-xs text-gray-600">Requires manual credit</p>
                </div>
                <Button
                  onClick={() => handleSectionClick('transactions')}
                  size="sm"
                  variant="outline"
                  className="text-xs"
                >
                  Fix
                </Button>
              </div>
            )}
            {statsWithPaymentMethods.pending_deposits === 0 && 
             statsWithPaymentMethods.open_tickets === 0 && 
             balanceNotUpdatedCount === 0 && (
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Recent Orders */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 sm:p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-blue-600" />
              Recent Orders
            </h3>
            <Button
              onClick={() => handleSectionClick('orders')}
              variant="ghost"
              size="sm"
              className="text-xs h-8"
            >
              View All
            </Button>
          </div>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {recentOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{order.services?.name || 'Unknown Service'}</p>
                  <div className="flex flex-col gap-1 mt-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2.5 py-1 rounded border ${
                        order.status === 'completed' ? 'bg-green-100 text-green-700 border-green-200' :
                        order.status === 'processing' || order.status === 'in progress' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                        order.status === 'partial' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                        order.status === 'canceled' || order.status === 'cancelled' ? 'bg-red-100 text-red-700 border-red-200' :
                        order.status === 'refunds' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                        'bg-yellow-100 text-yellow-700 border-yellow-200'
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
                  <p className="text-sm font-semibold text-gray-900">₵{order.total_cost?.toFixed(2) || '0.00'}</p>
                  <p className="text-xs text-gray-500">Qty: {order.quantity}</p>
                </div>
              </div>
            ))}
            {recentOrders.length === 0 && (
              <p className="text-center text-gray-500 text-sm py-4">No orders yet</p>
            )}
          </div>
        </div>

        {/* Recent Deposits */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 sm:p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              Recent Deposits
            </h3>
            <Button
              onClick={() => handleSectionClick('deposits')}
              variant="ghost"
              size="sm"
              className="text-xs h-8"
            >
              View All
            </Button>
          </div>
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {recentDeposits.map((deposit) => (
              <div key={deposit.id} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{deposit.profiles?.name || deposit.profiles?.email || 'Unknown User'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-2.5 py-1 rounded border ${
                      deposit.status === 'approved' ? 'bg-green-100 text-green-700 border-green-200' :
                      deposit.status === 'pending' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                      'bg-red-100 text-red-700 border-red-200'
                    }`}>
                      {deposit.status}
                    </span>
                    <span className="text-xs text-gray-500">{new Date(deposit.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="text-right ml-4">
                  <p className="text-sm font-semibold text-gray-900">₵{deposit.amount?.toFixed(2) || '0.00'}</p>
                </div>
              </div>
            ))}
            {recentDeposits.length === 0 && (
              <p className="text-center text-gray-500 text-sm py-4">No deposits yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

AdminStats.displayName = 'AdminStats';

export default AdminStats;


