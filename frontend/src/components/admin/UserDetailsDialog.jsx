import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUserDetails } from '@/hooks/useUserDetails';
import { Wallet, ShoppingCart, Receipt, User, Mail, Phone, Calendar, DollarSign } from 'lucide-react';

const UserDetailsDialog = ({ userId, open, onOpenChange }) => {
  const { data, isLoading, error } = useUserDetails(userId, { enabled: open && !!userId });

  const user = data?.profile;
  const deposits = data?.deposits || [];
  const orders = data?.orders || [];
  const transactions = data?.transactions || [];
  const totals = data?.totals || { deposits: 0, orders: 0, balance: 0 };

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[95vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50 flex-shrink-0">
          <DialogTitle className="text-2xl font-bold text-gray-900">User Details</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
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
              <div className="bg-gradient-to-br from-indigo-50 via-white to-purple-50 rounded-xl p-6 border border-indigo-100 shadow-sm">
                <div className="flex items-start gap-5">
                  <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full p-4 shadow-lg">
                    <User className="w-8 h-8 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-gray-900 mb-3">{user.name}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center gap-3 text-gray-700 bg-white/60 rounded-lg px-3 py-2">
                        <Mail className="w-5 h-5 text-indigo-600" />
                        <span className="font-medium">{user.email}</span>
                      </div>
                      {user.phone_number && (
                        <div className="flex items-center gap-3 text-gray-700 bg-white/60 rounded-lg px-3 py-2">
                          <Phone className="w-5 h-5 text-indigo-600" />
                          <span className="font-medium">{user.phone_number}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-3 text-gray-700 bg-white/60 rounded-lg px-3 py-2">
                        <Calendar className="w-5 h-5 text-indigo-600" />
                        <span className="font-medium">Joined: {formatDate(user.created_at)}</span>
                      </div>
                      <div className="flex items-center gap-3 bg-white/60 rounded-lg px-3 py-2">
                        <span className="text-gray-500 font-medium">Role:</span>
                        <span className={`text-sm font-semibold px-3 py-1 rounded-full ${
                          user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {user.role}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5 shadow-md hover:shadow-lg transition-shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-green-700 mb-2">Total Deposits</p>
                      <p className="text-3xl font-bold text-green-900">{formatCurrency(totals.deposits)}</p>
                    </div>
                    <div className="bg-green-100 rounded-full p-3">
                      <Wallet className="w-7 h-7 text-green-600" />
                    </div>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 rounded-xl p-5 shadow-md hover:shadow-lg transition-shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-blue-700 mb-2">Total Confirmed Orders</p>
                      <p className="text-3xl font-bold text-blue-900">{formatCurrency(totals.orders)}</p>
                    </div>
                    <div className="bg-blue-100 rounded-full p-3">
                      <ShoppingCart className="w-7 h-7 text-blue-600" />
                    </div>
                  </div>
                </div>
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-5 shadow-md hover:shadow-lg transition-shadow">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-indigo-700 mb-2">Current Balance</p>
                      <p className="text-3xl font-bold text-indigo-900">{formatCurrency(totals.balance)}</p>
                    </div>
                    <div className="bg-indigo-100 rounded-full p-3">
                      <DollarSign className="w-7 h-7 text-indigo-600" />
                    </div>
                  </div>
                </div>
              </div>

            {/* Tabs for Deposits, Orders, and Transactions */}
            <Tabs defaultValue="deposits" className="w-full">
              <TabsList className="inline-flex w-full bg-gray-100 p-1 rounded-lg mb-5 h-auto">
                <TabsTrigger value="deposits" className="flex-1 data-[state=active]:bg-white data-[state=active]:shadow-sm whitespace-nowrap">
                  <Wallet className="w-4 h-4 mr-2" />
                  Deposits ({deposits.length})
                </TabsTrigger>
                <TabsTrigger value="orders" className="flex-1 data-[state=active]:bg-white data-[state=active]:shadow-sm whitespace-nowrap">
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Orders ({orders.length})
                </TabsTrigger>
                <TabsTrigger value="transactions" className="flex-1 data-[state=active]:bg-white data-[state=active]:shadow-sm whitespace-nowrap">
                  <Receipt className="w-4 h-4 mr-2" />
                  Transactions ({transactions.length})
                </TabsTrigger>
              </TabsList>

              {/* Deposits Tab */}
              <TabsContent value="deposits" className="mt-0">
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  {deposits.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                      <Wallet className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                      <p className="text-lg font-medium">No deposits found</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
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
                  )}
                </div>
              </TabsContent>

              {/* Orders Tab */}
              <TabsContent value="orders" className="mt-0">
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  {orders.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                      <ShoppingCart className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                      <p className="text-lg font-medium">No orders found</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                      <table className="w-full">
                        <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b-2 border-gray-200 sticky top-0 z-20">
                          <tr>
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
                            return (
                              <tr key={order.id} className="hover:bg-gray-50 transition-colors">
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
                  )}
                </div>
              </TabsContent>

              {/* Transactions Tab */}
              <TabsContent value="transactions" className="mt-0">
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  {transactions.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                      <Receipt className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                      <p className="text-lg font-medium">No transactions found</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
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
                                <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${
                                  transaction.type === 'deposit' ? 'bg-green-100 text-green-700' :
                                  transaction.type === 'refund' ? 'bg-blue-100 text-blue-700' :
                                  'bg-red-100 text-red-700'
                                }`}>
                                  {transaction.type}
                                </span>
                              </td>
                              <td className={`px-4 py-3 text-sm font-bold whitespace-nowrap ${
                                transaction.type === 'deposit' || transaction.type === 'refund' 
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
  );
};

export default UserDetailsDialog;
