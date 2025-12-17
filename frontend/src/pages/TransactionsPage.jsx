import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SEO from '@/components/SEO';
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
  Filter,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';

const TransactionsPage = ({ user, onLogout }) => {
  const [transactions, setTransactions] = useState([]);
  const [userProfiles, setUserProfiles] = useState({}); // For admin: user_id -> profile data
  const [orders, setOrders] = useState([]); // For admin: orders to check refund status
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [manuallyCrediting, setManuallyCrediting] = useState(null); // Transaction ID being manually credited
  const [transactionsPage, setTransactionsPage] = useState(1);
  const transactionsPerPage = 20;
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      // For regular users, only fetch their own transactions
      if (!isAdmin) {
        const { data: transactionsData, error } = await supabase
          .from('transactions')
          .select('id, user_id, type, amount, status, deposit_method, paystack_reference, korapay_reference, created_at, updated_at')
          .eq('user_id', authUser.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching transactions:', error);
          toast.error('Failed to load transactions');
          return;
        }

        setTransactions(transactionsData || []);
      } else {
        // For admins: fetch all transactions with user profiles in one query (using join)
        const { data: transactionsData, error: transactionsError } = await supabase
          .from('transactions')
          .select('*, profiles(email, name, balance)')
          .order('created_at', { ascending: false });

        if (transactionsError) {
          console.error('Error fetching transactions:', transactionsError);
          toast.error('Failed to load transactions');
          return;
        }

        setTransactions(transactionsData || []);

        // Build user profiles map from the joined data
        if (transactionsData) {
          const profilesMap = {};
          transactionsData.forEach(transaction => {
            if (transaction.profiles && transaction.user_id) {
              profilesMap[transaction.user_id] = transaction.profiles;
            }
          });
          setUserProfiles(profilesMap);

          // Fetch orders in parallel (only refund_status needed for balance checks)
          const userIds = [...new Set(transactionsData.map(t => t.user_id))];
          const { data: ordersData } = await supabase
            .from('orders')
            .select('id, refund_status, user_id')
            .in('user_id', userIds);
          
          if (ordersData) {
            setOrders(ordersData);
          }
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
    // Don't clear verified results - only clear non-verified ones
    // This preserves the verified status of transactions
    await fetchTransactions();
    setRefreshing(false);
    // Balance checks will run automatically via useEffect when transactions/userProfiles update
    // But will skip already verified transactions
  };

  // Memoized balance check results to avoid re-checking on every render
  const [balanceCheckResults, setBalanceCheckResults] = useState({});
  const [checkingBalances, setCheckingBalances] = useState(false);
  const [balanceCheckTrigger, setBalanceCheckTrigger] = useState(0); // Trigger for re-checking
  
  // Load verified transactions from database on mount
  useEffect(() => {
    if (isAdmin) {
      loadVerifiedTransactions();
    }
  }, [isAdmin]);

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
    if (!isAdmin) return;

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

  // Save verified transactions to database whenever results change
  useEffect(() => {
    if (isAdmin && Object.keys(balanceCheckResults).length > 0) {
      // Save each verified transaction to database
      Object.keys(balanceCheckResults).forEach(transactionId => {
        const status = balanceCheckResults[transactionId];
        if (status && status !== 'checking') {
          saveVerifiedTransaction(transactionId, status);
        }
      });
    }
  }, [balanceCheckResults, isAdmin]);

  // For admin: Efficient balance check per user (not per transaction)
  // This function checks all transactions for a user at once, much faster than per-transaction checks
  const checkUserBalance = async (userId) => {
    if (!isAdmin || !userId) {
      return {};
    }

    const userProfile = userProfiles[userId];
    if (!userProfile) {
      return {}; // Can't check without profile
    }

    // Fetch fresh balance once (no triple fetch, no delays)
    let freshBalance = parseFloat(userProfile.balance || 0);
    try {
      const { data: freshProfile, error: freshError } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', userId)
        .single();

      if (!freshError && freshProfile) {
        freshBalance = parseFloat(freshProfile.balance || 0);
        // Update cached profile
        if (userProfiles[userId]) {
          userProfiles[userId].balance = freshBalance;
        }
      }
    } catch (error) {
      console.warn('Fresh balance fetch failed:', error);
      // Continue with current balance
    }

    // Get all transactions for this user
    const userTransactions = transactions.filter(t => t.user_id === userId);
    
    // Calculate expected balance from transactions
    const allApprovedDeposits = userTransactions
      .filter(t => t.type === 'deposit' && t.status === 'approved')
      .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    const allApprovedRefunds = userTransactions
      .filter(t => t.type === 'refund' && t.status === 'approved')
      .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    const allCompletedOrders = userTransactions
      .filter(t => t.type === 'order' && t.status === 'approved')
      .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    const expectedBalance = allApprovedDeposits + allApprovedRefunds - allCompletedOrders;
    const tolerance = Math.max(0.10, expectedBalance * 0.01);
    const balanceMatches = Math.abs(freshBalance - expectedBalance) <= tolerance;

    // Check each deposit transaction for this user
    const results = {};
    const depositTransactions = userTransactions.filter(
      t => t.type === 'deposit' && t.status === 'approved'
    );

    depositTransactions.forEach(transaction => {
      const transactionAmount = parseFloat(transaction.amount || 0);
      if (transactionAmount <= 0) {
        results[transaction.id] = 'unknown';
        return;
      }

      // Calculate expected balance without this specific transaction
      const balanceWithoutThis = expectedBalance - transactionAmount;
      const minExpectedWithThis = balanceWithoutThis + transactionAmount;

      // Check if balance includes this transaction
      const includesThisTransaction = freshBalance >= (minExpectedWithThis - tolerance);
      const overallBalanceMatches = balanceMatches || freshBalance >= (expectedBalance - tolerance);

      // If overall balance matches or includes this transaction, mark as updated
      if (overallBalanceMatches || includesThisTransaction) {
        results[transaction.id] = 'updated';
      } else {
        // Only mark as not_updated if balance is significantly lower
        const significantGap = expectedBalance - freshBalance;
        if (significantGap > transactionAmount * 0.9) {
          results[transaction.id] = 'not_updated';
        } else {
          results[transaction.id] = 'updated'; // Conservative default
        }
      }
    });

    return results;
  };
  
  // Perform balance checks when transactions or userProfiles change
  // Optimized: Check by user (batch all transactions for a user at once)
  useEffect(() => {
    if (!isAdmin || transactions.length === 0 || Object.keys(userProfiles).length === 0) {
      return;
    }

    let isMounted = true;

    const performBalanceChecks = async () => {
      setCheckingBalances(true);
      
      // Load previously verified transactions from database
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
      
      // Start with previously verified results
      const results = { ...previouslyVerified };
      
      // Get unique user IDs that have approved deposit transactions
      const depositTransactions = transactions.filter(
        t => t.type === 'deposit' && t.status === 'approved'
      );
      
      const userIdsWithDeposits = [...new Set(depositTransactions.map(t => t.user_id))];
      
      // Check balance for each user (batched - much faster than per-transaction)
      // Use Promise.all to check multiple users in parallel
      const userCheckPromises = userIdsWithDeposits.map(async (userId) => {
        if (!isMounted) return {};
        
        // Skip users that have all transactions already verified as "updated"
        const userDeposits = depositTransactions.filter(t => t.user_id === userId);
        const allVerified = userDeposits.every(t => previouslyVerified[t.id] === 'updated');
        if (allVerified) {
          return {}; // All transactions for this user already verified
        }
        
        return await checkUserBalance(userId);
      });
      
      // Wait for all user checks to complete (parallel execution)
      const userCheckResults = await Promise.all(userCheckPromises);
      
      // Merge all results
      userCheckResults.forEach(userResults => {
        Object.assign(results, userResults);
      });
      
      // Save verified transactions to database (batch save)
      if (isMounted) {
        const transactionsToSave = Object.entries(results)
          .filter(([id, status]) => status && status !== 'checking' && status !== previouslyVerified[id])
          .map(([transactionId, status]) => ({ transactionId, status }));
        
        // Save in parallel (batch)
        await Promise.all(
          transactionsToSave.map(({ transactionId, status }) =>
            saveVerifiedTransaction(transactionId, status)
          )
        );
        
        setBalanceCheckResults(results);
        setCheckingBalances(false);
      }
    };

    performBalanceChecks();

    return () => {
      isMounted = false;
    };
  }, [transactions, userProfiles, isAdmin, balanceCheckTrigger]);

  // Helper function to get balance check result (synchronous for rendering)
  const getBalanceCheckResult = (transaction) => {
    if (!isAdmin || transaction.type !== 'deposit' || transaction.status !== 'approved') {
      return null;
    }
    return balanceCheckResults[transaction.id] || 'checking';
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

      // Create transaction record for manual adjustment
      const { createManualAdjustmentTransaction } = await import('@/lib/transactionHelpers');
      await createManualAdjustmentTransaction(
        transaction.user_id,
        depositAmount,
        user?.id || null,
        `Manual balance credit for deposit transaction ${transaction.id}`
      );

      toast.success(`Balance credited successfully! ₵${depositAmount.toFixed(2)} added to user's account.`);
      
      // Mark this transaction as verified since we just manually credited it
      setBalanceCheckResults(prev => ({
        ...prev,
        [transaction.id]: 'updated'
      }));
      
      // Save to database immediately
      await saveVerifiedTransaction(transaction.id, 'updated');
      
      // Refresh data - verified results will be preserved
      await fetchTransactions();
      // Balance checks will run automatically via useEffect, but will skip already verified transactions
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
          color: 'bg-green-100 text-green-700 border-green-200', 
          icon: CheckCircle 
        };
      case 'pending':
        return { 
          label: 'Pending', 
          color: 'bg-yellow-100 text-yellow-700 border-yellow-200', 
          icon: Clock 
        };
      case 'rejected':
        return { 
          label: 'Rejected', 
          color: 'bg-red-100 text-red-700 border-red-200', 
          icon: XCircle 
        };
      default:
        return { 
          label: status || 'Unknown', 
          color: 'bg-gray-100 text-gray-700 border-gray-200', 
          icon: AlertCircle 
        };
    }
  };

  const getTypeConfig = (type) => {
    switch (type) {
      case 'deposit':
        return { 
          label: 'Deposit', 
          color: 'bg-blue-100 text-blue-700 border-blue-200', 
          icon: TrendingUp 
        };
      case 'order':
        return { 
          label: 'Order', 
          color: 'bg-purple-100 text-purple-700 border-purple-200', 
          icon: DollarSign 
        };
      case 'refund':
        return { 
          label: 'Refund', 
          color: 'bg-green-100 text-green-700 border-green-200', 
          icon: RefreshCw 
        };
      case 'referral_bonus':
        return { 
          label: 'Referral Bonus', 
          color: 'bg-emerald-100 text-emerald-700 border-emerald-200', 
          icon: TrendingUp 
        };
      case 'manual_adjustment':
        return { 
          label: 'Manual Adjustment', 
          color: 'bg-indigo-100 text-indigo-700 border-indigo-200', 
          icon: DollarSign 
        };
      case 'unknown':
        return { 
          label: 'Unknown', 
          color: 'bg-yellow-100 text-yellow-700 border-yellow-200', 
          icon: AlertCircle 
        };
      default:
        return { 
          label: type || 'Unknown', 
          color: 'bg-gray-100 text-gray-700 border-gray-200', 
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

  // Pagination
  const totalTransactionsPages = Math.ceil(filteredTransactions.length / transactionsPerPage);
  const startTransactionIndex = (transactionsPage - 1) * transactionsPerPage;
  const endTransactionIndex = startTransactionIndex + transactionsPerPage;
  const paginatedTransactions = filteredTransactions.slice(startTransactionIndex, endTransactionIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setTransactionsPage(1);
  }, [statusFilter, typeFilter, searchTerm]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar user={user} onLogout={onLogout} />
        <div className="flex items-center justify-center min-h-[60vh] pt-20 md:pt-0">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-indigo-600 mx-auto"></div>
            <p className="text-sm text-gray-600 mt-4">Loading transactions...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SEO
        title="Transactions"
        description="View your BoostUp GH transaction history"
        canonical="/transactions"
        noindex={true}
      />
      <Navbar user={user} onLogout={onLogout} />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 md:pt-6 pb-6 sm:pb-8">
        <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 lg:p-8 shadow-sm">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                {isAdmin ? 'All Transactions' : 'My Transactions'}
              </h1>
              <p className="text-sm sm:text-base text-gray-600">
                {isAdmin 
                  ? 'View and manage all user transactions' 
                  : 'Track your deposits and payments'}
              </p>
            </div>
            <div className="flex gap-2">
              {isAdmin && (
                <Button
                  onClick={async () => {
                    // Force re-check by deleting verified transactions from database
                    // This will cause all transactions to be re-checked
                    try {
                      const { error } = await supabase
                        .from('verified_transactions')
                        .delete()
                        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (using a condition that's always true)
                      
                      if (error) {
                        console.warn('Failed to clear verified transactions:', error);
                        toast.error('Failed to clear verified transactions. Please try again.');
                      } else {
                        toast.success('Verified transactions cleared. Re-checking all balances...');
                      }
                    } catch (error) {
                      console.warn('Error clearing verified transactions:', error);
                      toast.error('Error clearing verified transactions');
                    }
                    setBalanceCheckResults({});
                    setBalanceCheckTrigger(prev => prev + 1); // Trigger useEffect
                  }}
                  disabled={checkingBalances}
                  variant="outline"
                  className="flex items-center gap-2 h-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  title="Re-check all balances with triple verification"
                >
                  <RefreshCw className={`w-4 h-4 ${checkingBalances ? 'animate-spin' : ''}`} />
                  Re-check Balances
                </Button>
              )}
              <Button
                onClick={handleRefresh}
                disabled={refreshing}
                variant="outline"
                className="flex items-center gap-2 h-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
              <Input
                placeholder={isAdmin ? "Search by user, amount, ID..." : "Search by amount, ID..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-11 rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-11 rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
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
              <SelectTrigger className="h-11 rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="deposit">Deposits</SelectItem>
                <SelectItem value="order">Orders</SelectItem>
                <SelectItem value="refund">Refunds</SelectItem>
                <SelectItem value="referral_bonus">Referral Bonuses</SelectItem>
                <SelectItem value="manual_adjustment">Manual Adjustments</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Transactions Table */}
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 text-base sm:text-lg">
                {transactions.length === 0 ? 'No transactions yet' : 'No transactions match your filters'}
              </p>
              {searchTerm || statusFilter !== 'all' || typeFilter !== 'all' ? (
                <Button
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                    setTypeFilter('all');
                  }}
                  variant="outline"
                  className="mt-4 h-10 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                  Clear Filters
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <div className="min-w-[1200px]">
                  {/* Fixed Header */}
                  <div className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                    <div className={`grid gap-4 p-4 font-semibold text-xs sm:text-sm text-gray-700 ${isAdmin ? 'grid-cols-[1.5fr_1.5fr_1.5fr_1.5fr_2fr_2fr_1fr_1fr]' : 'grid-cols-[1.5fr_1.5fr_1.5fr_1.5fr_2fr_1fr_1fr]'}`}>
                      <div className="text-center">Type</div>
                      <div className="text-center">Status</div>
                      <div className="text-center">Amount</div>
                      <div className="text-center">Time</div>
                      {isAdmin && <div className="text-center">User</div>}
                      <div className="text-center">Transaction ID</div>
                      {isAdmin && <div className="text-center">Balance Status</div>}
                      <div className="text-center">Actions</div>
                    </div>
                  </div>

                  {/* Transactions List */}
                  <div className="divide-y divide-gray-200">
                    {paginatedTransactions.map((transaction) => {
                      const statusConfig = getStatusConfig(transaction.status);
                      const typeConfig = getTypeConfig(transaction.type);
                      const StatusIcon = statusConfig.icon;
                      const TypeIcon = typeConfig.icon;
                      const balanceCheck = isAdmin ? getBalanceCheckResult(transaction) : null;
                      const userProfile = isAdmin ? userProfiles[transaction.user_id] : null;

                      return (
                        <div key={transaction.id} className="bg-white hover:bg-gray-50 transition-colors">
                          <div className={`grid gap-4 p-4 items-center ${isAdmin ? 'grid-cols-[1.5fr_1.5fr_1.5fr_1.5fr_2fr_2fr_1fr_1fr]' : 'grid-cols-[1.5fr_1.5fr_1.5fr_1.5fr_2fr_1fr_1fr]'}`}>
                            {/* Type */}
                            <div className="flex flex-col items-center gap-1">
                              <span className={`px-2.5 py-1 rounded border text-xs font-medium flex items-center gap-1.5 ${typeConfig.color}`}>
                                <TypeIcon className="w-3 h-3" />
                                {typeConfig.label}
                              </span>
                              {transaction.auto_classified && (
                                <span className="px-1.5 py-0.5 rounded text-xs bg-amber-50 text-amber-700 border border-amber-200">
                                  Auto
                                </span>
                              )}
                            </div>
                            {/* Status */}
                            <div className="flex flex-col items-center gap-1">
                              <span className={`px-2.5 py-1 rounded border text-xs font-medium flex items-center gap-1.5 ${statusConfig.color}`}>
                                <StatusIcon className="w-3 h-3" />
                                {statusConfig.label}
                              </span>
                              {/* Show Paystack status for deposit transactions */}
                              {transaction.type === 'deposit' && transaction.paystack_status && (
                                <span className={`px-2 py-0.5 rounded border text-xs font-medium ${
                                  transaction.paystack_status === 'success' ? 'bg-green-100 text-green-700 border-green-200' :
                                  transaction.paystack_status === 'failed' ? 'bg-red-100 text-red-700 border-red-200' :
                                  transaction.paystack_status === 'abandoned' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                                  'bg-gray-100 text-gray-700 border-gray-200'
                                }`}>
                                  {transaction.paystack_status}
                                </span>
                              )}
                            </div>
                            {/* Amount */}
                            <div className="text-center">
                              <p className={`font-semibold text-gray-900 ${transaction.type === 'deposit' || transaction.type === 'refund' ? 'text-green-600' : 'text-red-600'}`}>
                                {transaction.type === 'deposit' || transaction.type === 'refund' ? '+' : '-'}₵{parseFloat(transaction.amount || 0).toFixed(2)}
                              </p>
                            </div>
                            {/* Time */}
                            <div className="text-center">
                              <p className="text-xs sm:text-sm text-gray-700">{new Date(transaction.created_at).toLocaleDateString()}</p>
                              <p className="text-xs text-gray-500">{new Date(transaction.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            </div>
                            {/* User (Admin only) */}
                            {isAdmin && (
                              <div className="text-center">
                                <p className="font-medium text-gray-900 text-sm">{userProfile?.name || 'Unknown'}</p>
                                <p className="text-xs text-gray-600 break-all">{userProfile?.email || transaction.user_id.slice(0, 8)}</p>
                              </div>
                            )}
                            {/* Transaction ID */}
                            <div className="text-center">
                              <p className="text-xs text-gray-700 break-all">{transaction.id}</p>
                              {transaction.paystack_reference && (
                                <p className="text-xs text-gray-500">Ref: {transaction.paystack_reference.slice(0, 8)}...</p>
                              )}
                            </div>
                            {/* Balance Status (Admin only) */}
                            {isAdmin && (
                              <div className="flex justify-center">
                                {(() => {
                                  if (transaction.type === 'deposit' && transaction.status === 'approved') {
                                    if (balanceCheck === 'not_updated') {
                                      return (
                                        <span className="px-2.5 py-1 rounded border text-xs font-medium bg-red-100 text-red-700 border-red-200 whitespace-nowrap">
                                          not-updated
                                        </span>
                                      );
                                    } else if (balanceCheck === 'updated') {
                                      return (
                                        <span className="px-2.5 py-1 rounded border text-xs font-medium bg-green-100 text-green-700 border-green-200 whitespace-nowrap">
                                          Updated
                                        </span>
                                      );
                                    } else if (balanceCheck === 'checking') {
                                      return (
                                        <span className="px-2.5 py-1 rounded border text-xs font-medium bg-yellow-100 text-yellow-700 border-yellow-200 whitespace-nowrap">
                                          Checking...
                                        </span>
                                      );
                                    } else if (balanceCheck === 'unknown') {
                                      return (
                                        <span className="px-2.5 py-1 rounded border text-xs font-medium bg-gray-100 text-gray-700 border-gray-200 whitespace-nowrap">
                                          Unknown
                                        </span>
                                      );
                                    }
                                  }
                                  return <span className="text-xs text-gray-400">-</span>;
                                })()}
                              </div>
                            )}
                            {/* Actions */}
                            <div className="flex justify-center">
                              {isAdmin && transaction.type === 'deposit' && transaction.status === 'approved' && balanceCheck === 'not_updated' && (
                                <Button
                                  onClick={() => handleManualCredit(transaction)}
                                  disabled={manuallyCrediting === transaction.id}
                                  variant="outline"
                                  size="sm"
                                  className="text-xs whitespace-nowrap h-8 text-green-600 hover:text-green-700 border-green-300 hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                                  title="Credit balance to user"
                                >
                                  {manuallyCrediting === transaction.id ? 'Crediting...' : 'Credit Balance'}
                                </Button>
                              )}
                              {!isAdmin && transaction.type === 'deposit' && transaction.status === 'approved' && (
                                <span className="text-xs text-green-600 flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" />
                                  Credited
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Description and Admin Info Row */}
                          {(transaction.description || transaction.admin_id) && (
                            <div className="px-4 pb-2 border-t border-gray-100">
                              <div className="flex flex-col gap-1 pt-2">
                                {transaction.description && (
                                  <p className="text-xs text-gray-600">
                                    <span className="font-medium">Description:</span> {transaction.description}
                                  </p>
                                )}
                                {transaction.admin_id && isAdmin && (
                                  <p className="text-xs text-gray-500">
                                    <span className="font-medium">Admin:</span> {transaction.admin_id.slice(0, 8)}...
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Pagination */}
              {totalTransactionsPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-gray-200">
                  <p className="text-xs sm:text-sm text-gray-600">
                    Showing {startTransactionIndex + 1} to {Math.min(endTransactionIndex, filteredTransactions.length)} of {filteredTransactions.length} transactions
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTransactionsPage(prev => Math.max(1, prev - 1))}
                      disabled={transactionsPage === 1}
                      className="h-9 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalTransactionsPages) }, (_, i) => {
                        let pageNum;
                        if (totalTransactionsPages <= 5) {
                          pageNum = i + 1;
                        } else if (transactionsPage >= totalTransactionsPages - 2) {
                          pageNum = totalTransactionsPages - 4 + i;
                        } else if (transactionsPage <= 3) {
                          pageNum = i + 1;
                        } else {
                          pageNum = transactionsPage - 2 + i;
                        }
                        return (
                          <Button
                            key={pageNum}
                            variant={transactionsPage === pageNum ? "default" : "outline"}
                            size="sm"
                            onClick={() => setTransactionsPage(pageNum)}
                            className={`w-9 h-9 p-0 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                              transactionsPage === pageNum ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : ''
                            }`}
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTransactionsPage(prev => Math.min(totalTransactionsPages, prev + 1))}
                      disabled={transactionsPage === totalTransactionsPages}
                      className="h-9 px-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Summary Stats */}
          {!isAdmin && filteredTransactions.length > 0 && (
            <div className="mt-6 sm:mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
                <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">Total Deposits</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">
                  ₵{filteredTransactions
                    .filter(t => t.type === 'deposit' && t.status === 'approved')
                    .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0)
                    .toFixed(2)}
                </p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
                <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">Pending</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-yellow-600">
                  {filteredTransactions.filter(t => t.status === 'pending').length}
                </p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
                <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">Approved</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-green-600">
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

