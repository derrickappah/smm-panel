import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  Loader, 
  RefreshCw, 
  DollarSign, 
  TrendingUp,
  AlertCircle,
  Plus,
  Search,
  Filter
} from 'lucide-react';
import { toast } from 'sonner';

const TransactionsPage = ({ user, onLogout }) => {
  const [transactions, setTransactions] = useState([]);
  const [userProfiles, setUserProfiles] = useState({}); // For admin: user_id -> profile data
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [manuallyCrediting, setManuallyCrediting] = useState(null); // Transaction ID being manually credited
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      let transactionsQuery = supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false });

      // For regular users, only fetch their own transactions
      if (!isAdmin) {
        transactionsQuery = transactionsQuery.eq('user_id', authUser.id);
      } else {
        // For admins, fetch all transactions with user profiles
        transactionsQuery = transactionsQuery.select('*, profiles(email, name, balance)');
      }

      const { data: transactionsData, error } = await transactionsQuery;

      if (error) {
        console.error('Error fetching transactions:', error);
        toast.error('Failed to load transactions');
        return;
      }

      setTransactions(transactionsData || []);

      // For admin: fetch user profiles to check balances
      if (isAdmin && transactionsData) {
        const userIds = [...new Set(transactionsData.map(t => t.user_id))];
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, email, name, balance')
          .in('id', userIds);

        if (profilesData) {
          const profilesMap = {};
          profilesData.forEach(profile => {
            profilesMap[profile.id] = profile;
          });
          setUserProfiles(profilesMap);
        }
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast.error('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTransactions();
    setRefreshing(false);
  };

  // For admin: Check if balance was updated after successful deposit
  const checkBalanceUpdated = (transaction) => {
    if (!isAdmin || transaction.type !== 'deposit' || transaction.status !== 'approved') {
      return null; // Not applicable
    }

    const userProfile = userProfiles[transaction.user_id];
    if (!userProfile) {
      return 'unknown'; // Can't check
    }

    // Calculate expected balance: sum of all approved deposits for this user
    const allApprovedDeposits = transactions
      .filter(t => 
        t.user_id === transaction.user_id &&
        t.type === 'deposit' &&
        t.status === 'approved'
      )
      .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    // Get user's current balance
    const currentBalance = parseFloat(userProfile.balance || 0);
    
    // Check if this specific transaction amount was added to balance
    // We check if current balance includes this transaction amount
    // by seeing if balance is at least equal to all approved deposits
    const expectedMinimumBalance = allApprovedDeposits;
    
    // Allow small floating point differences (0.01)
    if (Math.abs(currentBalance - expectedMinimumBalance) < 0.01) {
      return 'updated'; // Balance matches expected (was updated)
    } else if (currentBalance < expectedMinimumBalance - 0.01) {
      // Current balance is significantly less than expected
      // This means at least one deposit wasn't credited
      return 'not_updated'; // Balance wasn't fully updated
    } else {
      // Balance is more than expected (might have been manually adjusted or has other credits)
      return 'updated'; // Assume updated if balance is higher
    }
  };

  // For admin: Manually credit balance for a deposit
  const handleManualCredit = async (transaction) => {
    if (!isAdmin) return;

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

      // Update user balance
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
      
      // Refresh data
      await fetchTransactions();
    } catch (error) {
      console.error('Error manually crediting balance:', error);
      toast.error('Failed to credit balance: ' + error.message);
    } finally {
      setManuallyCrediting(null);
    }
  };

  const getStatusConfig = (status) => {
    switch (status) {
      case 'approved':
        return { 
          label: 'Approved', 
          color: 'bg-green-100 text-green-700', 
          icon: CheckCircle 
        };
      case 'pending':
        return { 
          label: 'Pending', 
          color: 'bg-yellow-100 text-yellow-700', 
          icon: Clock 
        };
      case 'rejected':
        return { 
          label: 'Rejected', 
          color: 'bg-red-100 text-red-700', 
          icon: XCircle 
        };
      default:
        return { 
          label: status || 'Unknown', 
          color: 'bg-gray-100 text-gray-700', 
          icon: AlertCircle 
        };
    }
  };

  const getTypeConfig = (type) => {
    switch (type) {
      case 'deposit':
        return { 
          label: 'Deposit', 
          color: 'bg-blue-100 text-blue-700', 
          icon: TrendingUp 
        };
      case 'order':
        return { 
          label: 'Order', 
          color: 'bg-purple-100 text-purple-700', 
          icon: DollarSign 
        };
      default:
        return { 
          label: type || 'Unknown', 
          color: 'bg-gray-100 text-gray-700', 
          icon: AlertCircle 
        };
    }
  };

  // Filter transactions
  const filteredTransactions = transactions.filter(transaction => {
    // Status filter
    if (statusFilter !== 'all' && transaction.status !== statusFilter) {
      return false;
    }

    // Type filter
    if (typeFilter !== 'all' && transaction.type !== typeFilter) {
      return false;
    }

    // Search filter (for admin: search by user email/name, for users: search by amount/date)
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      if (isAdmin) {
        const userProfile = userProfiles[transaction.user_id];
        const userName = userProfile?.name?.toLowerCase() || '';
        const userEmail = userProfile?.email?.toLowerCase() || '';
        const amount = transaction.amount?.toString() || '';
        const id = transaction.id?.toLowerCase() || '';
        return userName.includes(searchLower) || 
               userEmail.includes(searchLower) || 
               amount.includes(searchLower) ||
               id.includes(searchLower);
      } else {
        const amount = transaction.amount?.toString() || '';
        const id = transaction.id?.toLowerCase() || '';
        return amount.includes(searchLower) || id.includes(searchLower);
      }
    }

    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <Navbar user={user} onLogout={onLogout} />
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <Navbar user={user} onLogout={onLogout} />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="glass p-6 sm:p-8 rounded-3xl">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
                {isAdmin ? 'All Transactions' : 'My Transactions'}
              </h1>
              <p className="text-gray-600">
                {isAdmin 
                  ? 'View and manage all user transactions' 
                  : 'Track your deposits and payments'}
              </p>
            </div>
            <Button
              onClick={handleRefresh}
              disabled={refreshing}
              variant="outline"
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder={isAdmin ? "Search by user, amount, ID..." : "Search by amount, ID..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>

            {/* Type Filter */}
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="deposit">Deposits</SelectItem>
                <SelectItem value="order">Orders</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Transactions List */}
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 text-lg">No transactions found</p>
              {searchTerm || statusFilter !== 'all' || typeFilter !== 'all' ? (
                <Button
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                    setTypeFilter('all');
                  }}
                  variant="outline"
                  className="mt-4"
                >
                  Clear Filters
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredTransactions.map((transaction) => {
                const statusConfig = getStatusConfig(transaction.status);
                const typeConfig = getTypeConfig(transaction.type);
                const StatusIcon = statusConfig.icon;
                const TypeIcon = typeConfig.icon;
                const balanceCheck = isAdmin ? checkBalanceUpdated(transaction) : null;
                const userProfile = isAdmin ? userProfiles[transaction.user_id] : null;

                return (
                  <div key={transaction.id} className="bg-white/50 p-4 sm:p-6 rounded-xl border border-white/20">
                    <div className="flex flex-col gap-4">
                      {/* Header Row */}
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${statusConfig.color}`}>
                              <StatusIcon className="w-3 h-3" />
                              {statusConfig.label}
                            </span>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${typeConfig.color}`}>
                              <TypeIcon className="w-3 h-3" />
                              {typeConfig.label}
                            </span>
                            {transaction.paystack_reference && (
                              <span className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                                Ref: {transaction.paystack_reference.slice(0, 8)}...
                              </span>
                            )}
                          </div>
                          
                          <div className="space-y-1">
                            <p className="text-lg font-bold text-gray-900">
                              {transaction.type === 'deposit' ? '+' : '-'}₵{parseFloat(transaction.amount || 0).toFixed(2)}
                            </p>
                            {isAdmin && userProfile && (
                              <p className="text-sm text-gray-600">
                                User: {userProfile.name || userProfile.email || transaction.user_id.slice(0, 8)}
                              </p>
                            )}
                            <p className="text-xs text-gray-500">
                              {new Date(transaction.created_at).toLocaleString()}
                            </p>
                            <p className="text-xs text-gray-400 font-mono">
                              ID: {transaction.id.slice(0, 8)}...
                            </p>
                          </div>
                        </div>

                        {/* Admin Actions */}
                        {isAdmin && transaction.type === 'deposit' && transaction.status === 'approved' && (
                          <div className="flex flex-col gap-2">
                            {balanceCheck === 'not_updated' && (
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                                  <AlertCircle className="w-4 h-4" />
                                  <span>Balance not updated</span>
                                </div>
                                <Button
                                  onClick={() => handleManualCredit(transaction)}
                                  disabled={manuallyCrediting === transaction.id}
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700 text-white"
                                >
                                  {manuallyCrediting === transaction.id ? (
                                    <>
                                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                                      Crediting...
                                    </>
                                  ) : (
                                    <>
                                      <Plus className="w-4 h-4 mr-2" />
                                      Credit Balance
                                    </>
                                  )}
                                </Button>
                              </div>
                            )}
                            {balanceCheck === 'updated' && (
                              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">
                                <CheckCircle className="w-4 h-4" />
                                <span>Balance updated</span>
                              </div>
                            )}
                            {balanceCheck === 'unknown' && (
                              <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">
                                <AlertCircle className="w-4 h-4" />
                                <span>Cannot verify</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* User View: Balance Update Status */}
                        {!isAdmin && transaction.type === 'deposit' && transaction.status === 'approved' && (
                          <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">
                            <CheckCircle className="w-4 h-4" />
                            <span>Account credited successfully</span>
                          </div>
                        )}
                      </div>

                      {/* Additional Info */}
                      {transaction.status === 'pending' && (
                        <div className="flex items-center gap-2 text-sm text-yellow-600 bg-yellow-50 px-3 py-2 rounded-lg">
                          <Clock className="w-4 h-4" />
                          <span>Awaiting payment confirmation</span>
                        </div>
                      )}

                      {transaction.status === 'rejected' && (
                        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                          <XCircle className="w-4 h-4" />
                          <span>Payment was cancelled or failed</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Summary Stats */}
          {!isAdmin && filteredTransactions.length > 0 && (
            <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-white/50 p-4 rounded-xl">
                <p className="text-sm text-gray-600 mb-1">Total Deposits</p>
                <p className="text-2xl font-bold text-gray-900">
                  ₵{filteredTransactions
                    .filter(t => t.type === 'deposit' && t.status === 'approved')
                    .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0)
                    .toFixed(2)}
                </p>
              </div>
              <div className="bg-white/50 p-4 rounded-xl">
                <p className="text-sm text-gray-600 mb-1">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {filteredTransactions.filter(t => t.status === 'pending').length}
                </p>
              </div>
              <div className="bg-white/50 p-4 rounded-xl">
                <p className="text-sm text-gray-600 mb-1">Approved</p>
                <p className="text-2xl font-bold text-green-600">
                  {filteredTransactions.filter(t => t.status === 'approved').length}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransactionsPage;

