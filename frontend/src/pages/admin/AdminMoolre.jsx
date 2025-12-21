import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  RefreshCw, 
  Search,
  Loader2,
  CheckCircle,
  Clock,
  XCircle,
  Wallet,
  Filter,
  Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

const POLLING_INTERVAL = 45000; // 45 seconds

// Backend proxy URL for local development
const BACKEND_PROXY_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

// Check if we're in production (Vercel)
const isProduction = process.env.NODE_ENV === 'production' || 
  (typeof window !== 'undefined' && 
   window.location.hostname !== 'localhost' && 
   window.location.hostname !== '127.0.0.1' &&
   !window.location.hostname.includes('localhost'));

// Fetch Moolre transactions from API
const fetchMoolreTransactions = async (filters = {}) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('No session token available. Please log in again.');
  }

  // Use backend proxy in development, serverless function in production
  const apiUrl = isProduction 
    ? '/api/moolre-list-transactions'
    : `${BACKEND_PROXY_URL}/api/moolre-list-transactions`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify({
      startDate: filters.startDate,
      endDate: filters.endDate,
      status: filters.status !== 'all' ? filters.status : undefined,
      limit: filters.limit || 1000,
      offset: filters.offset || 0
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data;
};

const AdminMoolre = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isPolling, setIsPolling] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  // Build filters object
  const filters = useMemo(() => ({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    status: statusFilter,
    limit: 1000
  }), [startDate, endDate, statusFilter]);

  // Fetch transactions with React Query
  const { 
    data, 
    isLoading, 
    error, 
    refetch,
    dataUpdatedAt 
  } = useQuery({
    queryKey: ['moolre', 'transactions', filters],
    queryFn: () => fetchMoolreTransactions(filters),
    enabled: true,
    refetchInterval: isPolling ? POLLING_INTERVAL : false,
    refetchIntervalInBackground: false, // Only poll when tab is active
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    onSuccess: () => {
      setLastRefresh(new Date());
    },
    onError: (err) => {
      console.error('Error fetching Moolre transactions:', err);
      toast.error(`Failed to fetch transactions: ${err.message}`);
    }
  });

  // Update last refresh time when data updates
  useEffect(() => {
    if (dataUpdatedAt) {
      setLastRefresh(new Date(dataUpdatedAt));
    }
  }, [dataUpdatedAt]);

  // Pause polling when tab is not visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPolling(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const transactions = useMemo(() => {
    return data?.transactions || [];
  }, [data]);

  // Filter transactions based on search and filters
  const filteredTransactions = useMemo(() => {
    let filtered = [...transactions];

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(tx => {
        const ref = (tx.externalref || '').toLowerCase();
        const id = (tx.id || '').toLowerCase();
        const payer = (tx.payer || '').toLowerCase();
        return ref.includes(searchLower) || 
               id.includes(searchLower) || 
               payer.includes(searchLower);
      });
    }

    // Channel filter
    if (channelFilter !== 'all') {
      filtered = filtered.filter(tx => {
        const channel = (tx.channelName || tx.channel || '').toLowerCase();
        return channel === channelFilter.toLowerCase();
      });
    }

    return filtered.sort((a, b) => {
      // Sort by created_at descending (newest first)
      const dateA = new Date(a.created_at || 0);
      const dateB = new Date(b.created_at || 0);
      return dateB - dateA;
    });
  }, [transactions, searchTerm, channelFilter]);

  const handleManualRefresh = useCallback(() => {
    refetch();
    toast.success('Refreshing transactions...');
  }, [refetch]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'success':
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
            <CheckCircle className="w-3 h-3 mr-1" />
            Success
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
            <XCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      case 'pending':
      default:
        return (
          <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  const formatAmount = (amount, currency = 'GHS') => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numAmount)) return 'N/A';
    return `${currency} ${numAmount.toFixed(2)}`;
  };

  // Get unique channels for filter
  const uniqueChannels = useMemo(() => {
    const channels = new Set();
    transactions.forEach(tx => {
      const channel = tx.channelName || tx.channel;
      if (channel) channels.add(channel);
    });
    return Array.from(channels).sort();
  }, [transactions]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Moolre Transactions</h2>
            <p className="text-sm text-gray-600">
              View and monitor all transactions from Moolre API
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="text-xs text-gray-500">
                Last refresh: {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            <Button
              onClick={handleManualRefresh}
              disabled={isLoading}
              variant="outline"
              className="flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </>
              )}
            </Button>
            <Button
              onClick={() => setIsPolling(!isPolling)}
              variant={isPolling ? "default" : "outline"}
              className="flex items-center gap-2"
            >
              {isPolling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Auto-refresh ON
                </>
              ) : (
                <>
                  <Clock className="w-4 h-4" />
                  Auto-refresh OFF
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Filter className="w-5 h-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search by reference, ID, or payer..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>

              {/* Channel Filter */}
              <Select value={channelFilter} onValueChange={setChannelFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Channels</SelectItem>
                  {uniqueChannels.map(channel => (
                    <SelectItem key={channel} value={channel}>
                      {channel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Date Range */}
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <Input
                  type="date"
                  placeholder="Start date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="flex-1"
                />
                <span className="text-gray-400">to</span>
                <Input
                  type="date"
                  placeholder="End date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>

            {/* Clear Filters */}
            {(searchTerm || statusFilter !== 'all' || channelFilter !== 'all' || startDate || endDate) && (
              <Button
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                  setChannelFilter('all');
                  setStartDate('');
                  setEndDate('');
                }}
                variant="ghost"
                size="sm"
                className="mt-4"
              >
                Clear Filters
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Error State */}
        {error && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-red-800">
                <XCircle className="w-5 h-5" />
                <p className="font-medium">Error loading transactions</p>
              </div>
              <p className="text-sm text-red-600 mt-2">{error.message}</p>
              <p className="text-xs text-red-500 mt-2">
                Note: Please verify the Moolre API endpoint for listing transactions is correct.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Transactions Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Transactions ({filteredTransactions.length})</span>
              {isPolling && (
                <Badge variant="outline" className="text-xs">
                  Auto-refreshing every {POLLING_INTERVAL / 1000}s
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {transactions.length > 0 
                ? `Showing ${filteredTransactions.length} of ${transactions.length} transactions`
                : 'No transactions found'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && transactions.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                <span className="ml-3 text-gray-600">Loading transactions...</span>
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="text-center py-12">
                <Wallet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No transactions found</p>
                {searchTerm || statusFilter !== 'all' || channelFilter !== 'all' || startDate || endDate ? (
                  <p className="text-sm text-gray-500 mt-2">Try adjusting your filters</p>
                ) : null}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left p-3 font-semibold text-sm text-gray-700">Reference</th>
                      <th className="text-left p-3 font-semibold text-sm text-gray-700">Amount</th>
                      <th className="text-left p-3 font-semibold text-sm text-gray-700">Status</th>
                      <th className="text-left p-3 font-semibold text-sm text-gray-700">Payer</th>
                      <th className="text-left p-3 font-semibold text-sm text-gray-700">Channel</th>
                      <th className="text-left p-3 font-semibold text-sm text-gray-700">Created</th>
                      <th className="text-left p-3 font-semibold text-sm text-gray-700">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((tx, index) => (
                      <tr 
                        key={tx.id || tx.externalref || index} 
                        className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                      >
                        <td className="p-3">
                          <div className="flex flex-col">
                            <span className="font-mono text-sm">{tx.externalref || tx.id || 'N/A'}</span>
                            {tx.id && tx.id !== tx.externalref && (
                              <span className="text-xs text-gray-500">ID: {tx.id}</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="font-semibold">{formatAmount(tx.amount, tx.currency)}</span>
                        </td>
                        <td className="p-3">
                          {getStatusBadge(tx.status)}
                        </td>
                        <td className="p-3">
                          <span className="text-sm">{tx.payer || 'N/A'}</span>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline">{tx.channelName || tx.channel || 'N/A'}</Badge>
                        </td>
                        <td className="p-3">
                          <span className="text-sm text-gray-600">{formatDate(tx.created_at)}</span>
                        </td>
                        <td className="p-3">
                          <span className="text-sm text-gray-600">{formatDate(tx.updated_at)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminMoolre;

