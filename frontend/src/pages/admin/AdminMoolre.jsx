import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { 
  RefreshCw, 
  Search,
  Loader2,
  CheckCircle,
  Clock,
  XCircle,
  Wallet,
  Filter,
  Calendar as CalendarIcon
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

  // Use serverless functions in production, backend server in development
  const apiUrls = isProduction 
    ? ['/api/moolre-list-transactions']  // Only use serverless function in production
    : [`${BACKEND_PROXY_URL}/api/moolre-list-transactions`, '/api/moolre-list-transactions'];

  let lastError = null;
  
  for (const apiUrl of apiUrls) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          limit: filters.limit || 1000,
          offset: filters.offset || 0
          // Removed API-level date and status filters - doing all filtering client-side
        })
      });

      // Check if response is HTML (404 page)
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        console.warn(`Received HTML response from ${apiUrl}, trying next endpoint...`);
        lastError = new Error(`Endpoint ${apiUrl} returned HTML (likely 404). The API endpoint may not be available.`);
        continue;
      }

      if (!response.ok) {
        // Try to parse JSON error, but handle HTML responses
        let errorData;
        try {
          errorData = await response.json();
        } catch (parseError) {
          // If JSON parsing fails, it might be HTML
          const text = await response.text();
          if (text.includes('<!DOCTYPE') || text.includes('<html')) {
            lastError = new Error(`Endpoint ${apiUrl} returned HTML page (${response.status}). Make sure the API endpoint is available.`);
            continue;
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      // If it's a network error or CORS error, try next URL
      if (error.message.includes('Failed to fetch') || error.message.includes('CORS')) {
        console.warn(`Error with ${apiUrl}:`, error.message);
        lastError = error;
        continue;
      }
      // If it's a JSON parse error or other error, throw it
      throw error;
    }
  }

  // If all URLs failed, throw the last error with helpful message
  if (lastError) {
    throw new Error(
      `Failed to connect to Moolre API. ${lastError.message}\n\n` +
      `Please ensure:\n` +
      `- In production: The serverless function is deployed\n` +
      `- In development: Either run 'vercel dev' OR start the backend server (cd backend && npm start)\n` +
      `- Backend server URL: ${BACKEND_PROXY_URL}`
    );
  }

  throw new Error('No API endpoints available');
};

const AdminMoolre = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ from: undefined, to: undefined });
  const [isPolling, setIsPolling] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  // Convert date range to string format for API
  const startDate = dateRange.from ? format(dateRange.from, 'yyyy-MM-dd') : '';
  const endDate = dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : '';

  // Build filters object - Don't filter at API level, do all filtering client-side
  // This ensures we have all data to work with and filters work properly
  const filters = useMemo(() => ({
    limit: 1000
    // Removed API-level filtering - we'll do all filtering client-side
  }), []);

  // Fetch transactions with React Query
  // Note: We fetch all transactions and filter client-side for better UX
  const { 
    data, 
    isLoading, 
    error, 
    refetch,
    dataUpdatedAt 
  } = useQuery({
    queryKey: ['moolre', 'transactions'],
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
        const username = (tx.username || '').toLowerCase();
        const email = (tx.email || '').toLowerCase();
        return ref.includes(searchLower) || 
               id.includes(searchLower) || 
               payer.includes(searchLower) ||
               username.includes(searchLower) ||
               email.includes(searchLower);
      });
    }

    // Status filter (client-side)
    if (statusFilter !== 'all') {
      filtered = filtered.filter(tx => {
        // Normalize status for comparison
        const txStatus = (tx.status || '').toLowerCase().trim();
        const filterStatus = statusFilter.toLowerCase().trim();
        return txStatus === filterStatus;
      });
    }

    // Channel filter
    if (channelFilter !== 'all') {
      filtered = filtered.filter(tx => {
        const channel = (tx.channelName || tx.channel || '').toLowerCase().trim();
        const filterChannel = channelFilter.toLowerCase().trim();
        // Allow partial matching for channel names
        return channel === filterChannel || channel.includes(filterChannel) || filterChannel.includes(channel);
      });
    }

    // Date range filter (client-side)
    if (dateRange.from) {
      const start = new Date(dateRange.from);
      start.setHours(0, 0, 0, 0); // Start of day
      filtered = filtered.filter(tx => {
        if (!tx.created_at && !tx.updated_at) return false;
        try {
          const txDate = new Date(tx.created_at || tx.updated_at);
          // Check if date is valid
          if (isNaN(txDate.getTime())) return false;
          return txDate >= start;
        } catch (e) {
          return false;
        }
      });
    }

    if (dateRange.to) {
      const end = new Date(dateRange.to);
      end.setHours(23, 59, 59, 999); // End of day
      filtered = filtered.filter(tx => {
        if (!tx.created_at && !tx.updated_at) return false;
        try {
          const txDate = new Date(tx.created_at || tx.updated_at);
          // Check if date is valid
          if (isNaN(txDate.getTime())) return false;
          return txDate <= end;
        } catch (e) {
          return false;
        }
      });
    }

    return filtered.sort((a, b) => {
      // Sort by created_at descending (newest first)
      const dateA = new Date(a.created_at || 0);
      const dateB = new Date(b.created_at || 0);
      return dateB - dateA;
    });
  }, [transactions, searchTerm, statusFilter, channelFilter, dateRange]);

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

  const getTransactionType = (tx) => {
    // Check txtype field from Moolre API
    // txtype: 1 = Payment/Deposit (money coming in), 2 = Payout/Withdrawal (money going out)
    const txtype = tx.txtype || tx.type;
    
    // If txtype is explicitly 2, it's a payout
    if (txtype === 2 || txtype === '2' || txtype === 'payout' || txtype === 'withdrawal') {
      return 'payout';
    }
    
    // If txtype is 1 or 'payment' or 'deposit', it's a deposit
    if (txtype === 1 || txtype === '1' || txtype === 'payment' || txtype === 'deposit') {
      return 'deposit';
    }
    
    // Fallback: If there's a payee (money going out), it's likely a payout
    // If there's a payer (money coming in), it's likely a deposit
    if (tx.payee && !tx.payer) {
      return 'payout';
    }
    
    // Default to deposit (most common case for our use case)
    return 'deposit';
  };

  const getTypeBadge = (tx) => {
    const type = getTransactionType(tx);
    if (type === 'payout') {
      return (
        <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">
          Payout
        </Badge>
      );
    }
    return (
      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
        Deposit
      </Badge>
    );
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

  // Calculate statistics from filtered transactions
  const statistics = useMemo(() => {
    const stats = {
      totalTransactions: filteredTransactions.length,
      totalDeposits: 0,
      totalPayouts: 0,
      totalDepositAmount: 0,
      totalPayoutAmount: 0,
      successCount: 0,
      pendingCount: 0,
      failedCount: 0,
      successAmount: 0,
      pendingAmount: 0,
      failedAmount: 0
    };

    filteredTransactions.forEach(tx => {
      const amount = parseFloat(tx.amount || 0);
      const type = getTransactionType(tx);
      const status = tx.status || 'pending';

      // Count by type
      if (type === 'deposit') {
        stats.totalDeposits++;
        stats.totalDepositAmount += amount;
      } else if (type === 'payout') {
        stats.totalPayouts++;
        stats.totalPayoutAmount += amount;
      }

      // Count by status
      if (status === 'success') {
        stats.successCount++;
        stats.successAmount += amount;
      } else if (status === 'pending') {
        stats.pendingCount++;
        stats.pendingAmount += amount;
      } else if (status === 'failed') {
        stats.failedCount++;
        stats.failedAmount += amount;
      }
    });

    stats.netAmount = stats.totalDepositAmount - stats.totalPayoutAmount;

    return stats;
  }, [filteredTransactions]);

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

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Transactions</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{statistics.totalTransactions}</p>
                </div>
                <Wallet className="w-8 h-8 text-gray-400" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">Total Deposits</p>
                  <p className="text-2xl font-bold text-blue-600 mt-1">{formatAmount(statistics.totalDepositAmount)}</p>
                  <p className="text-xs text-gray-500 mt-1">{statistics.totalDeposits} transaction{statistics.totalDeposits !== 1 ? 's' : ''}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 font-bold text-lg">+</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-600">Total Payouts</p>
                  <p className="text-2xl font-bold text-orange-600 mt-1">{formatAmount(statistics.totalPayoutAmount)}</p>
                  <p className="text-xs text-gray-500 mt-1">{statistics.totalPayouts} transaction{statistics.totalPayouts !== 1 ? 's' : ''}</p>
                </div>
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                  <span className="text-orange-600 font-bold text-lg">-</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Net Amount</p>
                  <p className={`text-2xl font-bold mt-1 ${statistics.netAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatAmount(statistics.netAmount)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {statistics.netAmount >= 0 ? 'Positive' : 'Negative'}
                  </p>
                </div>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${statistics.netAmount >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                  <span className={`font-bold text-lg ${statistics.netAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {statistics.netAmount >= 0 ? '↑' : '↓'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Status Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Successful</p>
                  <p className="text-xl font-bold text-green-600 mt-1">{statistics.successCount}</p>
                  <p className="text-xs text-gray-500 mt-1">{formatAmount(statistics.successAmount)}</p>
                </div>
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pending</p>
                  <p className="text-xl font-bold text-yellow-600 mt-1">{statistics.pendingCount}</p>
                  <p className="text-xs text-gray-500 mt-1">{formatAmount(statistics.pendingAmount)}</p>
                </div>
                <Clock className="w-6 h-6 text-yellow-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Failed</p>
                  <p className="text-xl font-bold text-red-600 mt-1">{statistics.failedCount}</p>
                  <p className="text-xs text-gray-500 mt-1">{formatAmount(statistics.failedAmount)}</p>
                </div>
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
            </CardContent>
          </Card>
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
            <div className="space-y-4">
              {/* First Row: Search and Dropdowns */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Search by reference, ID, payer, username, or email..."
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
              </div>

              {/* Date Range - Calendar Picker */}
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
                <div className="flex items-center gap-2 mb-3">
                  <CalendarIcon className="w-4 h-4 text-gray-500" />
                  <label className="text-sm font-medium text-gray-700">Date Range</label>
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal bg-white hover:bg-gray-50"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, 'MMM dd, yyyy')} - {format(dateRange.to, 'MMM dd, yyyy')}
                          </>
                        ) : (
                          format(dateRange.from, 'MMM dd, yyyy')
                        )
                      ) : (
                        <span className="text-gray-500">Pick a date range</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      defaultMonth={dateRange.from}
                      selected={dateRange}
                      onSelect={setDateRange}
                      numberOfMonths={2}
                      className="rounded-md border"
                    />
                  </PopoverContent>
                </Popover>
                {(dateRange.from || dateRange.to) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-xs"
                    onClick={() => setDateRange({ from: undefined, to: undefined })}
                  >
                    Clear dates
                  </Button>
                )}
              </div>
            </div>

            {/* Clear Filters */}
            {(searchTerm || statusFilter !== 'all' || channelFilter !== 'all' || dateRange.from || dateRange.to) && (
              <Button
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                  setChannelFilter('all');
                  setDateRange({ from: undefined, to: undefined });
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
              <p className="text-sm text-red-600 mt-2 whitespace-pre-line">{error.message}</p>
              {error.message.includes('Failed to connect') && (
                <div className="mt-4 p-3 bg-red-100 rounded border border-red-200">
                  <p className="text-xs font-semibold text-red-800 mb-2">Quick Fix:</p>
                  <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
                    <li>For local development: Run <code className="bg-red-200 px-1 rounded">vercel dev</code> in the root directory, OR</li>
                    <li>Start the backend server: <code className="bg-red-200 px-1 rounded">cd backend && npm start</code></li>
                    <li>Make sure Moolre credentials are set in environment variables</li>
                  </ul>
                </div>
              )}
              {error.message.includes('404') && (
                <div className="mt-4 p-3 bg-yellow-100 rounded border border-yellow-200">
                  <p className="text-xs font-semibold text-yellow-800 mb-2">Deployment Issue:</p>
                  <ul className="text-xs text-yellow-700 space-y-1 list-disc list-inside">
                    <li>The serverless function needs to be deployed to Vercel</li>
                    <li>Trigger a new deployment: Push a commit or redeploy from Vercel dashboard</li>
                    <li>Verify the file <code className="bg-yellow-200 px-1 rounded">api/moolre-list-transactions.js</code> exists in your repository</li>
                    <li>After deployment, the endpoint should be available at <code className="bg-yellow-200 px-1 rounded">/api/moolre-list-transactions</code></li>
                  </ul>
                </div>
              )}
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
                {searchTerm || statusFilter !== 'all' || channelFilter !== 'all' || dateRange.from || dateRange.to ? (
                  <p className="text-sm text-gray-500 mt-2">Try adjusting your filters</p>
                ) : null}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left p-3 font-semibold text-sm text-gray-700">Reference</th>
                      <th className="text-left p-3 font-semibold text-sm text-gray-700">Type</th>
                      <th className="text-left p-3 font-semibold text-sm text-gray-700">Amount</th>
                      <th className="text-left p-3 font-semibold text-sm text-gray-700">Status</th>
                      <th className="text-left p-3 font-semibold text-sm text-gray-700">Username</th>
                      <th className="text-left p-3 font-semibold text-sm text-gray-700">Email</th>
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
                          {getTypeBadge(tx)}
                        </td>
                        <td className="p-3">
                          <span className="font-semibold">{formatAmount(tx.amount, tx.currency)}</span>
                        </td>
                        <td className="p-3">
                          {getStatusBadge(tx.status)}
                        </td>
                        <td className="p-3">
                          <span className="text-sm">{tx.username || 'N/A'}</span>
                        </td>
                        <td className="p-3">
                          <span className="text-sm break-all">{tx.email || 'N/A'}</span>
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

