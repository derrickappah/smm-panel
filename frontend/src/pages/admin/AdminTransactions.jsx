import React, { memo, useState, useMemo, useCallback, useEffect } from 'react';
import { useAdminTransactions } from '@/hooks/useAdminTransactions';
import { useDebounce } from '@/hooks/useDebounce';
import VirtualizedList from '@/components/VirtualizedList';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, RefreshCw, Filter, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

const ITEMS_PER_PAGE = 50;
const VIRTUAL_SCROLL_THRESHOLD = 100;

const AdminTransactions = memo(({ onRefresh, refreshing = false, getBalanceCheckResult, onManualCredit }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [manuallyCrediting, setManuallyCrediting] = useState(null);

  const debouncedSearch = useDebounce(searchTerm, 300);

  const { 
    data, 
    isLoading, 
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch
  } = useAdminTransactions({ 
    enabled: true, 
    useInfinite: true 
  });

  const allTransactions = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap(page => page.data || []);
  }, [data]);

  // Get total count from first page
  const totalCount = useMemo(() => {
    return data?.pages?.[0]?.total || allTransactions.length;
  }, [data, allTransactions.length]);

  const filteredTransactions = useMemo(() => {
    let filtered = [...allTransactions];

    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase();
      filtered = filtered.filter(transaction => {
        const transactionId = (transaction.id || '').toLowerCase();
        const userName = (transaction.profiles?.name || '').toLowerCase();
        const userEmail = (transaction.profiles?.email || '').toLowerCase();
        return transactionId.includes(searchLower) || 
               userName.includes(searchLower) || 
               userEmail.includes(searchLower);
      });
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter(transaction => transaction.type === typeFilter);
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(transaction => transaction.status === statusFilter);
    }

    if (dateFilter) {
      const filterDate = new Date(dateFilter);
      filterDate.setHours(0, 0, 0, 0);
      const filterDateEnd = new Date(filterDate);
      filterDateEnd.setHours(23, 59, 59, 999);
      
      filtered = filtered.filter(transaction => {
        const transactionDate = new Date(transaction.created_at);
        return transactionDate >= filterDate && transactionDate <= filterDateEnd;
      });
    }

    return filtered;
  }, [allTransactions, debouncedSearch, typeFilter, statusFilter, dateFilter]);

  const paginatedTransactions = useMemo(() => {
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    return filteredTransactions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredTransactions, page]);

  const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);
  const displayTotal = filteredTransactions.length;

  // Load all pages when there are no filters (to show accurate total count)
  useEffect(() => {
    if (!isLoading && hasNextPage && !isFetchingNextPage && !debouncedSearch && typeFilter === 'all' && statusFilter === 'all' && !dateFilter) {
      // Load all remaining pages to get accurate total count
      fetchNextPage();
    }
  }, [isLoading, hasNextPage, isFetchingNextPage, debouncedSearch, typeFilter, statusFilter, dateFilter, fetchNextPage]);

  // Load more pages when needed for pagination with filters
  useEffect(() => {
    if (!isLoading && hasNextPage && !isFetchingNextPage) {
      const currentPageData = allTransactions.length;
      const neededData = page * ITEMS_PER_PAGE;
      
      // If we need more data than we have, fetch next page
      if (neededData > currentPageData) {
        fetchNextPage();
      }
    }
  }, [page, allTransactions.length, hasNextPage, isFetchingNextPage, isLoading, fetchNextPage]);

  const handleManualCredit = useCallback(async (transaction) => {
    if (!onManualCredit) return;
    
    setManuallyCrediting(transaction.id);
    try {
      await onManualCredit(transaction);
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to manually credit:', error);
    } finally {
      setManuallyCrediting(null);
    }
  }, [onManualCredit, onRefresh]);

  const renderTransactionRow = useCallback((transaction) => {
    const balanceCheck = getBalanceCheckResult ? getBalanceCheckResult(transaction) : null;

    return (
      <div className="grid grid-cols-[1.5fr_1.5fr_1.5fr_1.5fr_2fr_2fr_1fr_1fr] gap-4 p-4 items-center bg-white hover:bg-gray-50 transition-colors border-b border-gray-200">
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
        <div className="text-center">
          <p className={`font-semibold ${transaction.type === 'deposit' || transaction.type === 'refund' ? 'text-green-600' : 'text-red-600'}`}>
            {transaction.type === 'deposit' || transaction.type === 'refund' ? '+' : '-'}₵{transaction.amount?.toFixed(2) || '0.00'}
          </p>
        </div>
        <div className="text-center">
          <p className="text-sm text-gray-700">{new Date(transaction.created_at).toLocaleDateString()}</p>
          <p className="text-xs text-gray-500">{new Date(transaction.created_at).toLocaleTimeString()}</p>
        </div>
        <div className="text-center">
          <p className="font-medium text-gray-900 text-sm">{transaction.profiles?.name || 'Unknown'}</p>
          <p className="text-xs text-gray-600 break-all">{transaction.profiles?.email || transaction.user_id?.slice(0, 8)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-700 break-all">{transaction.id}</p>
          {transaction.paystack_reference && (
            <p className="text-xs text-gray-500">Ref: {transaction.paystack_reference}</p>
          )}
          {transaction.order_id && (
            <p className="text-xs text-gray-500">Order: {transaction.order_id.slice(0, 8)}...</p>
          )}
        </div>
        <div className="flex justify-center">
          {balanceCheck === 'not_updated' ? (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
              not-updated
            </span>
          ) : balanceCheck === 'updated' ? (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              Updated
            </span>
          ) : balanceCheck === 'checking' ? (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
              Checking...
            </span>
          ) : (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
              Unknown
            </span>
          )}
        </div>
        <div className="flex justify-center">
          {balanceCheck === 'not_updated' && (
            <Button
              onClick={() => handleManualCredit(transaction)}
              disabled={manuallyCrediting === transaction.id}
              variant="outline"
              size="sm"
              className="text-xs whitespace-nowrap text-green-600 hover:text-green-700 border-green-300"
            >
              {manuallyCrediting === transaction.id ? 'Crediting...' : 'Credit'}
            </Button>
          )}
        </div>
      </div>
    );
  }, [getBalanceCheckResult, handleManualCredit, manuallyCrediting]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-600"></div>
      </div>
    );
  }

  const useVirtualScroll = filteredTransactions.length > VIRTUAL_SCROLL_THRESHOLD;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">All Transactions</h2>
            <Button
              onClick={() => {
                refetch();
                if (onRefresh) onRefresh();
              }}
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
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-40 h-11">
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
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40 h-11">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search by transaction ID, username, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div>
            <Input
              type="date"
              placeholder="Filter by date"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setPage(1);
              }}
              className="w-full"
            />
          </div>
        </div>
      </div>

      {filteredTransactions.length === 0 ? (
        <p className="text-gray-600 text-center py-8">No transactions found</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-200">
            {useVirtualScroll ? (
              <div className="min-w-[1200px]">
                <div className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
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
                <VirtualizedList
                  items={paginatedTransactions}
                  renderItem={renderTransactionRow}
                  itemHeight={100}
                  height={600}
                />
              </div>
            ) : (
              <div className="max-h-[600px] overflow-y-auto overflow-x-auto">
                <div className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10 min-w-[1200px]">
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
                <div className="divide-y divide-gray-200/50 min-w-[1200px]">
                  {paginatedTransactions.map((transaction) => (
                    <div key={transaction.id}>
                      {renderTransactionRow(transaction)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-gray-600">
              Showing {(page - 1) * ITEMS_PER_PAGE + 1} to {Math.min(page * ITEMS_PER_PAGE, displayTotal)} of {displayTotal} transactions
              {hasNextPage && !isFetchingNextPage && (
                <span className="ml-2 text-xs text-gray-500">(Loading more...)</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                disabled={page === 1}
                variant="outline"
                size="sm"
              >
                Previous
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      variant={page === pageNum ? "default" : "outline"}
                      size="sm"
                      className={page === pageNum ? "bg-indigo-600 hover:bg-indigo-700 text-white" : ""}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                disabled={page === totalPages}
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
  );
});

AdminTransactions.displayName = 'AdminTransactions';

export default AdminTransactions;


