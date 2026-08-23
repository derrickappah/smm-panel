import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUserDetails } from '@/hooks/useUserDetails';
import { Wallet, ShoppingCart, Receipt, User, Mail, Phone, Calendar, DollarSign, Laptop, Smartphone, ShieldAlert, ShieldCheck, Ban, CheckCircle2, LogOut, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import OrderDetailsDialog from './OrderDetailsDialog';

const UserDetailsDialog = ({ userId, open, onOpenChange }) => {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useUserDetails(userId, { enabled: open && !!userId });
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isOrderDetailsOpen, setIsOrderDetailsOpen] = useState(false);
  const [deviceBanModalOpen, setDeviceBanModalOpen] = useState(false);
  const [deviceToBan, setDeviceToBan] = useState(null);
  const [deviceBanReason, setDeviceBanReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const user = data?.profile;
  const deposits = data?.deposits || [];
  const orders = data?.orders || [];
  const transactions = data?.transactions || [];
  const devices = data?.devices || [];
  const totals = data?.totals || { deposits: 0, orders: 0, balance: 0 };

  const handleRevokeSessions = async () => {
    if (!window.confirm('Are you sure you want to revoke all active sessions for this user? They will be logged out immediately.')) {
      return;
    }
    setActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/revoke-user-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({ userId })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        toast.success('All active sessions revoked successfully');
      } else {
        toast.error(result.error || 'Failed to revoke sessions');
      }
    } catch (err) {
      toast.error('Network error revoking sessions');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBanDeviceSubmit = async (e) => {
    e.preventDefault();
    if (!deviceToBan) return;
    setActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/ban-device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({
          deviceId: deviceToBan.id,
          reason: deviceBanReason || 'Restricted by admin',
          userId
        })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        toast.success('Device restricted successfully');
        setDeviceBanModalOpen(false);
        setDeviceToBan(null);
        setDeviceBanReason('');
        queryClient.invalidateQueries({ queryKey: ['admin', 'user-details', userId] });
      } else {
        toast.error(result.error || 'Failed to restrict device');
      }
    } catch (err) {
      toast.error('Error restricting device');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnbanDevice = async (device) => {
    setActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/unban-device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({
          deviceId: device.id,
          userId
        })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        toast.success('Device restriction lifted');
        queryClient.invalidateQueries({ queryKey: ['admin', 'user-details', userId] });
      } else {
        toast.error(result.error || 'Failed to unban device');
      }
    } catch (err) {
      toast.error('Error lifting device restriction');
    } finally {
      setActionLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return `₵${parseFloat(amount || 0).toFixed(2)}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusBadge = (status) => {
    const statusColors = {
      approved: 'bg-green-100 text-green-700',
      pending: 'bg-yellow-100 text-yellow-700',
      rejected: 'bg-red-100 text-red-700',
      completed: 'bg-green-100 text-green-700',
      processing: 'bg-blue-100 text-blue-700',
      cancelled: 'bg-gray-100 text-gray-700',
    };
    return (
      <span className={`text-xs px-2 py-1 rounded-full ${statusColors[status] || 'bg-gray-100 text-gray-700'}`}>
        {status}
      </span>
    );
  };

  // Helper function to get Order ID based on priority
  const getOrderId = (order) => {
    // Check if smmcost_order_id exists and is valid (not "order not placed at smmcost")
    const hasSmmcost = order.smmcost_order_id &&
      String(order.smmcost_order_id).toLowerCase() !== "order not placed at smmcost" &&
      order.smmcost_order_id > 0;

    // Check if smmgen_order_id exists and is valid (not internal UUID or "order not placed")
    const isInternalUuid = order.smmgen_order_id === order.id;
    const hasSmmgen = order.smmgen_order_id &&
      order.smmgen_order_id !== "order not placed at smm gen" &&
      !isInternalUuid;

    if (hasSmmcost) {
      return { id: order.smmcost_order_id, type: 'smmcost' };
    } else if (hasSmmgen) {
      return { id: order.smmgen_order_id, type: 'smmgen' };
    } else {
      // Fallback to truncated UUID
      return { id: order.id.slice(0, 8), type: 'uuid' };
    }
  };

  // Get Order ID display value
  const getOrderIdDisplay = (order) => {
    const orderIdInfo = getOrderId(order);
    if (orderIdInfo.type === 'uuid' && !order.smmcost_order_id && !order.smmgen_order_id) {
      return 'order not placed';
    }
    return orderIdInfo.id;
  };

  // Handle order click
  const handleOrderClick = (order) => {
    setSelectedOrder(order);
    setIsOrderDetailsOpen(true);
  };

  if (error) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
          </DialogHeader>
          <div className="p-4 text-center text-red-600">
            Error loading user details: {error.message}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-7xl max-h-[95vh] flex flex-col p-0 overflow-hidden sm:max-w-7xl">
          <DialogHeader className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50 flex-shrink-0">
            <DialogTitle className="text-xl sm:text-2xl font-bold text-gray-900">User Details</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 min-h-0">
            {isLoading ? (
              <div className="space-y-6">
                <div className="h-40 bg-gray-200 rounded-lg animate-pulse"></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-32 bg-gray-200 rounded-lg animate-pulse"></div>
                  ))}
                </div>
                <div className="h-96 bg-gray-200 rounded-lg animate-pulse"></div>
              </div>
            ) : user ? (
              <div className="space-y-6">
                {/* User Info Section */}
                <div className="bg-gradient-to-br from-indigo-50 via-white to-purple-50 rounded-xl p-4 sm:p-6 border border-indigo-100 shadow-sm">
                  <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-5">
                    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full p-3 sm:p-4 shadow-lg flex-shrink-0">
                      <User className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                    </div>
                    <div className="flex-1 w-full">
                      <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 break-words">{user.name}</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className="flex items-center gap-2 sm:gap-3 text-gray-700 bg-white/60 rounded-lg px-2 sm:px-3 py-2 text-sm sm:text-base">
                          <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 flex-shrink-0" />
                          <span className="font-medium break-all">{user.email}</span>
                        </div>
                        {user.phone_number && (
                          <div className="flex items-center gap-2 sm:gap-3 text-gray-700 bg-white/60 rounded-lg px-2 sm:px-3 py-2 text-sm sm:text-base">
                            <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 flex-shrink-0" />
                            <span className="font-medium">{user.phone_number}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 sm:gap-3 text-gray-700 bg-white/60 rounded-lg px-2 sm:px-3 py-2 text-sm sm:text-base">
                          <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 flex-shrink-0" />
                          <span className="font-medium text-xs sm:text-sm">Joined: {formatDate(user.created_at)}</span>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-3 bg-white/60 rounded-lg px-2 sm:px-3 py-2">
                          <span className="text-gray-500 font-medium text-sm sm:text-base">Role:</span>
                          <span className={`text-xs sm:text-sm font-semibold px-2 sm:px-3 py-1 rounded-full ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                            }`}>
                            {user.role}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-5">
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 sm:p-5 shadow-md hover:shadow-lg transition-shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-medium text-green-700 mb-1 sm:mb-2">Total Deposits</p>
                        <p className="text-2xl sm:text-3xl font-bold text-green-900 truncate">{formatCurrency(totals.deposits)}</p>
                      </div>
                      <div className="bg-green-100 rounded-full p-2 sm:p-3 flex-shrink-0 ml-2">
                        <Wallet className="w-5 h-5 sm:w-7 sm:h-7 text-green-600" />
                      </div>
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 rounded-xl p-4 sm:p-5 shadow-md hover:shadow-lg transition-shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-medium text-blue-700 mb-1 sm:mb-2">Total Confirmed Orders</p>
                        <p className="text-2xl sm:text-3xl font-bold text-blue-900 truncate">{formatCurrency(totals.orders)}</p>
                      </div>
                      <div className="bg-blue-100 rounded-full p-2 sm:p-3 flex-shrink-0 ml-2">
                        <ShoppingCart className="w-5 h-5 sm:w-7 sm:h-7 text-blue-600" />
                      </div>
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-4 sm:p-5 shadow-md hover:shadow-lg transition-shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-medium text-indigo-700 mb-1 sm:mb-2">Current Balance</p>
                        <p className="text-2xl sm:text-3xl font-bold text-indigo-900 truncate">{formatCurrency(totals.balance)}</p>
                      </div>
                      <div className="bg-indigo-100 rounded-full p-2 sm:p-3 flex-shrink-0 ml-2">
                        <DollarSign className="w-5 h-5 sm:w-7 sm:h-7 text-indigo-600" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tabs for Deposits, Orders, and Transactions */}
                <Tabs defaultValue="deposits" className="w-full">
                  <TabsList className="inline-flex w-full bg-gray-100 p-1 rounded-lg mb-3 sm:mb-5 h-auto overflow-x-auto">
                    <TabsTrigger value="deposits" className="flex-1 min-w-0 data-[state=active]:bg-white data-[state=active]:shadow-sm text-xs sm:text-sm px-2 sm:px-3">
                      <Wallet className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 flex-shrink-0" />
                      <span className="truncate">Deposits ({deposits.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="orders" className="flex-1 min-w-0 data-[state=active]:bg-white data-[state=active]:shadow-sm text-xs sm:text-sm px-2 sm:px-3">
                      <ShoppingCart className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 flex-shrink-0" />
                      <span className="truncate">Orders ({orders.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="transactions" className="flex-1 min-w-0 data-[state=active]:bg-white data-[state=active]:shadow-sm text-xs sm:text-sm px-2 sm:px-3">
                      <Receipt className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 flex-shrink-0" />
                      <span className="truncate">Transactions ({transactions.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="devices" className="flex-1 min-w-0 data-[state=active]:bg-white data-[state=active]:shadow-sm text-xs sm:text-sm px-2 sm:px-3">
                      <Laptop className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 flex-shrink-0" />
                      <span className="truncate">Devices ({devices.length})</span>
                    </TabsTrigger>
                  </TabsList>

                  {/* Deposits Tab */}
                  <TabsContent value="deposits" className="mt-0">
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                      {deposits.length === 0 ? (
                        <div className="p-8 sm:p-12 text-center text-gray-500">
                          <Wallet className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 text-gray-300" />
                          <p className="text-base sm:text-lg font-medium">No deposits found</p>
                        </div>
                      ) : (
                        <>
                          {/* Mobile Card View */}
                          <div className="block sm:hidden">
                            <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-200">
                              {deposits.map((deposit) => (
                                <div key={deposit.id} className="p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-bold text-gray-900">{formatCurrency(deposit.amount)}</span>
                                    {getStatusBadge(deposit.status)}
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    <p><span className="font-medium">Method:</span> {deposit.deposit_method || 'N/A'}</p>
                                    <p className="truncate"><span className="font-medium">Reference:</span> {deposit.paystack_reference || deposit.manual_reference || deposit.korapay_reference || deposit.moolre_reference || 'N/A'}</p>
                                    <p><span className="font-medium">Date:</span> {formatDate(deposit.created_at)}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* Desktop Table View */}
                          <div className="hidden sm:block overflow-x-auto max-h-[500px] overflow-y-auto">
                            <table className="w-full">
                              <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200 sticky top-0 z-20">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">Amount</th>
                                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">Status</th>
                                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">Method</th>
                                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">Reference</th>
                                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">Date</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 bg-white">
                                {deposits.map((deposit) => (
                                  <tr key={deposit.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 text-sm font-bold text-gray-900 whitespace-nowrap">
                                      {formatCurrency(deposit.amount)}
                                    </td>
                                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                                      {getStatusBadge(deposit.status)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-700 font-medium whitespace-nowrap">
                                      {deposit.deposit_method || 'N/A'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 font-mono text-xs max-w-[200px] truncate" title={deposit.paystack_reference || deposit.manual_reference || deposit.korapay_reference || deposit.moolre_reference || 'N/A'}>
                                      {deposit.paystack_reference || deposit.manual_reference || deposit.korapay_reference || deposit.moolre_reference || 'N/A'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                                      {formatDate(deposit.created_at)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  </TabsContent>

                  {/* Orders Tab */}
                  <TabsContent value="orders" className="mt-0">
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                      {orders.length === 0 ? (
                        <div className="p-8 sm:p-12 text-center text-gray-500">
                          <ShoppingCart className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 text-gray-300" />
                          <p className="text-base sm:text-lg font-medium">No orders found</p>
                        </div>
                      ) : (
                        <>
                          {/* Mobile Card View */}
                          <div className="block sm:hidden">
                            <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-200">
                              {orders.map((order) => {
                                const serviceName = order.services?.name || order.promotion_packages?.name || 'N/A';
                                const platform = order.services?.platform || order.promotion_packages?.platform || '';
                                const orderIdDisplay = getOrderIdDisplay(order);
                                return (
                                  <div
                                    key={order.id}
                                    onClick={() => handleOrderClick(order)}
                                    className="p-3 space-y-2 hover:bg-indigo-50 transition-colors cursor-pointer"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium text-gray-500 mb-1">
                                          <span className="font-semibold">Order ID:</span> {orderIdDisplay}
                                        </p>
                                        <p className="text-sm font-semibold text-gray-900 truncate">{serviceName}</p>
                                        {platform && (
                                          <p className="text-xs text-gray-500">{platform}</p>
                                        )}
                                      </div>
                                      {getStatusBadge(order.status)}
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-gray-600">
                                      <span><span className="font-medium">Quantity:</span> {order.quantity}</span>
                                      <span className="font-bold text-gray-900">{formatCurrency(order.total_cost)}</span>
                                    </div>
                                    <p className="text-xs text-gray-600"><span className="font-medium">Date:</span> {formatDate(order.created_at)}</p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          {/* Desktop Table View */}
                          <div className="hidden sm:block overflow-x-auto max-h-[500px] overflow-y-auto">
                            <table className="w-full">
                              <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200 sticky top-0 z-20">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">Order ID</th>
                                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">Service</th>
                                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">Quantity</th>
                                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">Cost</th>
                                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">Status</th>
                                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">Date</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 bg-white">
                                {orders.map((order) => {
                                  const serviceName = order.services?.name || order.promotion_packages?.name || 'N/A';
                                  const platform = order.services?.platform || order.promotion_packages?.platform || '';
                                  const orderIdDisplay = getOrderIdDisplay(order);
                                  return (
                                    <tr
                                      key={order.id}
                                      onClick={() => handleOrderClick(order)}
                                      className="hover:bg-indigo-50 transition-colors cursor-pointer"
                                    >
                                      <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                                        {orderIdDisplay}
                                      </td>
                                      <td className="px-4 py-3 text-sm">
                                        <div>
                                          <p className="font-semibold text-gray-900">{serviceName}</p>
                                          {platform && (
                                            <p className="text-xs text-gray-500 mt-1">{platform}</p>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 text-sm text-gray-700 font-medium whitespace-nowrap">
                                        {order.quantity}
                                      </td>
                                      <td className="px-4 py-3 text-sm font-bold text-gray-900 whitespace-nowrap">
                                        {formatCurrency(order.total_cost)}
                                      </td>
                                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                                        {getStatusBadge(order.status)}
                                      </td>
                                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                                        {formatDate(order.created_at)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  </TabsContent>

                  {/* Transactions Tab */}
                  <TabsContent value="transactions" className="mt-0">
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                      {transactions.length === 0 ? (
                        <div className="p-8 sm:p-12 text-center text-gray-500">
                          <Receipt className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 text-gray-300" />
                          <p className="text-base sm:text-lg font-medium">No transactions found</p>
                        </div>
                      ) : (
                        <>
                          {/* Mobile Card View */}
                          <div className="block sm:hidden">
                            <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-200">
                              {transactions.map((transaction) => (
                                <div key={transaction.id} className="p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${transaction.type === 'deposit' ? 'bg-green-100 text-green-700' :
                                        transaction.type === 'refund' ? 'bg-blue-100 text-blue-700' :
                                          'bg-red-100 text-red-700'
                                      }`}>
                                      {transaction.type}
                                    </span>
                                    <span className={`text-sm font-bold ${transaction.type === 'deposit' || transaction.type === 'refund'
                                        ? 'text-green-600'
                                        : 'text-red-600'
                                      }`}>
                                      {transaction.type === 'deposit' || transaction.type === 'refund' ? '+' : '-'}
                                      {formatCurrency(transaction.amount)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs text-gray-600">
                                    {getStatusBadge(transaction.status)}
                                    <span><span className="font-medium">Method:</span> {transaction.deposit_method || 'N/A'}</span>
                                  </div>
                                  <p className="text-xs text-gray-600"><span className="font-medium">Date:</span> {formatDate(transaction.created_at)}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* Desktop Table View */}
                          <div className="hidden sm:block overflow-x-auto max-h-[500px] overflow-y-auto">
                            <table className="w-full">
                              <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200 sticky top-0 z-20">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">Type</th>
                                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">Amount</th>
                                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">Status</th>
                                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">Method</th>
                                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">Date</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 bg-white">
                                {transactions.map((transaction) => (
                                  <tr key={transaction.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                                      <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${transaction.type === 'deposit' ? 'bg-green-100 text-green-700' :
                                          transaction.type === 'refund' ? 'bg-blue-100 text-blue-700' :
                                            'bg-red-100 text-red-700'
                                        }`}>
                                        {transaction.type}
                                      </span>
                                    </td>
                                    <td className={`px-4 py-3 text-sm font-bold whitespace-nowrap ${transaction.type === 'deposit' || transaction.type === 'refund'
                                        ? 'text-green-600'
                                        : 'text-red-600'
                                      }`}>
                                      {transaction.type === 'deposit' || transaction.type === 'refund' ? '+' : '-'}
                                      {formatCurrency(transaction.amount)}
                                    </td>
                                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                                      {getStatusBadge(transaction.status)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-700 font-medium whitespace-nowrap">
                                      {transaction.deposit_method || 'N/A'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                                      {formatDate(transaction.created_at)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  </TabsContent>

                  {/* Devices Tab */}
                  <TabsContent value="devices" className="mt-0">
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm p-4 sm:p-6 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                        <div>
                          <h4 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                            <Laptop className="w-5 h-5 text-indigo-600" />
                            Registered Browsers & Devices
                          </h4>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Persistent browser installations associated with this account.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={actionLoading}
                          onClick={handleRevokeSessions}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 flex items-center gap-1.5 self-start sm:self-auto"
                        >
                          <LogOut className="w-4 h-4" />
                          Revoke Active Sessions
                        </Button>
                      </div>

                      {devices.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                          <Laptop className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                          <p className="text-sm font-medium">No recorded devices found for this user</p>
                          <p className="text-xs text-gray-400 mt-1">Devices will appear here upon visitor login or activity</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {devices.map((device) => {
                            const isRestricted = !!device.is_banned;
                            return (
                              <div
                                key={device.id}
                                className={`rounded-xl border p-4 transition-all ${
                                  isRestricted
                                    ? 'bg-red-50/50 border-red-200'
                                    : 'bg-gray-50/70 border-gray-200 hover:border-indigo-200 hover:bg-indigo-50/20'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3 mb-2.5">
                                  <div className="flex items-center gap-2">
                                    <div className={`p-2 rounded-lg ${isRestricted ? 'bg-red-100 text-red-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                      {device.user_agent?.toLowerCase().includes('mobile') ? (
                                        <Smartphone className="w-4 h-4" />
                                      ) : (
                                        <Laptop className="w-4 h-4" />
                                      )}
                                    </div>
                                    <div>
                                      <div className="text-xs font-mono font-semibold text-gray-800">
                                        ID: {device.device_preview || device.id.slice(0, 8)}
                                      </div>
                                      <span
                                        className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full mt-0.5 ${
                                          isRestricted
                                            ? 'bg-red-100 text-red-700 border border-red-200'
                                            : 'bg-green-100 text-green-700 border border-green-200'
                                        }`}
                                      >
                                        {isRestricted ? (
                                          <>
                                            <Ban className="w-3 h-3" />
                                            Restricted
                                          </>
                                        ) : (
                                          <>
                                            <CheckCircle2 className="w-3 h-3" />
                                            Active
                                          </>
                                        )}
                                      </span>
                                    </div>
                                  </div>

                                  <div>
                                    {isRestricted ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={actionLoading}
                                        onClick={() => handleUnbanDevice(device)}
                                        className="h-8 text-xs text-green-700 border-green-300 hover:bg-green-50"
                                      >
                                        Unban Device
                                      </Button>
                                    ) : (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={actionLoading}
                                        onClick={() => {
                                          setDeviceToBan(device);
                                          setDeviceBanReason('Suspicious activity / terms violation');
                                          setDeviceBanModalOpen(true);
                                        }}
                                        className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50"
                                      >
                                        <Ban className="w-3.5 h-3.5 mr-1" />
                                        Ban Device
                                      </Button>
                                    )}
                                  </div>
                                </div>

                                <div className="space-y-1.5 text-xs text-gray-600 pt-2 border-t border-gray-200/60">
                                  <div className="flex justify-between">
                                    <span className="text-gray-400">First Seen:</span>
                                    <span className="font-medium text-gray-700">{formatDate(device.first_seen_at)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-400">Last Active:</span>
                                    <span className="font-medium text-gray-700">{formatDate(device.last_seen_at)}</span>
                                  </div>
                                  {device.ip_address && device.ip_address !== 'N/A' && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-400">Network IP:</span>
                                      <span className="font-mono text-gray-600">{device.ip_address}</span>
                                    </div>
                                  )}
                                  {device.user_agent && (
                                    <div className="pt-1">
                                      <p className="text-gray-400 text-[10px]">Browser / OS:</p>
                                      <p className="text-gray-600 text-[11px] truncate font-mono bg-white/70 rounded p-1 border border-gray-100">
                                        {device.user_agent}
                                      </p>
                                    </div>
                                  )}
                                  {isRestricted && (
                                    <div className="mt-2 p-2 bg-red-100/60 rounded border border-red-200 text-red-800 text-[11px]">
                                      <p className="font-semibold flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3 text-red-600" />
                                        Ban Reason:
                                      </p>
                                      <p className="mt-0.5">{device.ban_reason || 'Restricted by admin'}</p>
                                      {device.banned_at && (
                                        <p className="text-[10px] text-red-600 mt-1">Banned on: {formatDate(device.banned_at)}</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            ) : (
              <div className="p-12 text-center text-gray-500">
                <User className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium">User not found</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Ban Device Dialog */}
      <Dialog open={deviceBanModalOpen} onOpenChange={setDeviceBanModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Ban className="w-5 h-5" />
              Restrict Browser / Device
            </DialogTitle>
            <DialogDescription>
              Restricting this device will prevent it from accessing the application and creating new accounts.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleBanDeviceSubmit} className="space-y-4 pt-2">
            <div>
              <Label htmlFor="device-id-preview" className="text-xs text-gray-500">Device Reference</Label>
              <Input
                id="device-id-preview"
                value={deviceToBan?.device_preview || deviceToBan?.id || ''}
                readOnly
                disabled
                className="font-mono text-xs bg-gray-50 mt-1"
              />
            </div>

            <div>
              <Label htmlFor="ban-reason-input" className="text-xs font-semibold text-gray-700">Restriction Reason</Label>
              <Input
                id="ban-reason-input"
                placeholder="e.g. Account abuse, fraudulent deposits, terms violation"
                value={deviceBanReason}
                onChange={(e) => setDeviceBanReason(e.target.value)}
                required
                className="mt-1 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeviceBanModalOpen(false)}
                disabled={actionLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={actionLoading}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {actionLoading ? 'Restricting...' : 'Confirm Device Restriction'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog - Separate modal overlay */}
      {selectedOrder && (
        <OrderDetailsDialog
          order={selectedOrder}
          open={isOrderDetailsOpen}
          onOpenChange={setIsOrderDetailsOpen}
        />
      )}
    </>
  );
};

export default UserDetailsDialog;
