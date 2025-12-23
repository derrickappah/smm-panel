import React, { memo, useState, useMemo, useCallback, useEffect } from 'react';
import { useAdminTransactions } from '@/hooks/useAdminTransactions';
import { useDebounce } from '@/hooks/useDebounce';
import VirtualizedList from '@/components/VirtualizedList';
import ResponsiveTable from '@/components/admin/ResponsiveTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, RefreshCw, Filter, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { getPaymentStatusConfig } from '@/lib/paymentStatusHelpers';

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

  const renderTableHeader = useCallback(() => (
    <div className="grid grid-cols-[1.5fr_1.5fr_1.5fr_1.5fr_2fr_2fr_1fr_1fr] gap-4 p-4 font-semibold text-sm min-w-[1200px]">
      <div className="text-center min-w-[100px]">Type</div>
      <div className="text-center min-w-[100px]">Status</div>
      <div className="text-center min-w-[100px]">Amount</div>
      <div className="text-center min-w-[120px]">Date</div>
      <div className="text-center min-w-[150px]">User</div>
      <div className="text-center min-w-[200px]">Transaction ID</div>
      <div className="text-center min-w-[100px]">Balance</div>
      <div className="text-center min-w-[120px]">Actions</div>
    </div>
  ), []);

  const renderTableRow = useCallback((transaction, index) => {
    const balanceCheck = getBalanceCheckResult ? getBalanceCheckResult(transaction) : null;

    return (
      <div className="grid grid-cols-[1.5fr_1.5fr_1.5fr_1.5fr_2fr_2fr_1fr_1fr] gap-4 p-4 items-center bg-white hover:bg-gray-50 transition-colors border-b border-gray-200 min-w-[1200px]">
        <div className="flex flex-col items-center gap-1">
          <span className={`px-3 py-1.5 rounded-full text-xs font-medium ${
            transaction.type === 'deposit' 
              ? 'bg-blue-100 text-blue-700' 
              : transaction.type === 'refund'
              ? 'bg-green-100 text-green-700'
              : transaction.type === 'order'
              ? 'bg-purple-100 text-purple-700'
              : transaction.type === 'referral_bonus'
              ? 'bg-emerald-100 text-emerald-700'
              : transaction.type === 'manual_adjustment'
              ? 'bg-indigo-100 text-indigo-700'
              : transaction.type === 'unknown'
              ? 'bg-yellow-100 text-yellow-700'
              : 'bg-gray-100 text-gray-700'
          }`}>
            {transaction.type === 'deposit' ? 'Deposit' : 
             transaction.type === 'refund' ? 'Refund' :
             transaction.type === 'order' ? 'Order' :
             transaction.type === 'referral_bonus' ? 'Referral Bonus' :
             transaction.type === 'manual_adjustment' ? 'Manual Adjustment' :
             transaction.type === 'unknown' ? 'Unknown' :
             transaction.type}
          </span>
          {transaction.auto_classified && (
            <span className="px-1.5 py-0.5 rounded text-xs bg-amber-50 text-amber-700 border border-amber-200">
              Auto
            </span>
          )}
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
          {transaction.type === 'deposit' && transaction.paystack_status && (() => {
            const statusConfig = getPaymentStatusConfig(transaction.paystack_status, 'paystack');
            return (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}>
                {statusConfig.label}
              </span>
            );
          })()}
          {transaction.type === 'deposit' && transaction.korapay_status && (() => {
            const statusConfig = getPaymentStatusConfig(transaction.korapay_status, 'korapay');
            return (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}>
                {statusConfig.label}
              </span>
            );
          })()}
          {transaction.type === 'deposit' && transaction.moolre_status && (() => {
            const statusConfig = getPaymentStatusConfig(transaction.moolre_status, 'moolre');
            return (
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}>
                Moolre: {statusConfig.label}
              </span>
            );
          })()}
        </div>
        <div className="text-center">
          {(() => {
            const isCredit = transaction.type === 'deposit' || 
                            transaction.type === 'refund' || 
                            transaction.type === 'referral_bonus' ||
                            (transaction.type === 'manual_adjustment' && transaction.description?.toLowerCase().includes('credit'));
            const isDebit = transaction.type === 'order' ||
                           (transaction.type === 'manual_adjustment' && transaction.description?.toLowerCase().includes('debit'));
            return (
              <p className={`font-semibold ${isCredit ? 'text-green-600' : isDebit ? 'text-red-600' : 'text-gray-600'}`}>
                {isCredit ? '+' : isDebit ? '-' : ''}₵{transaction.amount?.toFixed(2) || '0.00'}
              </p>
            );
          })()}
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
            <p className="text-xs text-gray-500">Paystack Ref: {transaction.paystack_reference}</p>
          )}
          {transaction.moolre_reference && (
            <p className="text-xs text-gray-500">Moolre Ref: {transaction.moolre_reference}</p>
          )}
          {transaction.moolre_channel && (
            <p className="text-xs text-gray-500">Network: {transaction.moolre_channel}</p>
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
              className="text-xs whitespace-nowrap text-green-600 hover:text-green-700 border-green-300 min-h-[44px]"
            >
              {manuallyCrediting === transaction.id ? 'Crediting...' : 'Credit'}
            </Button>
          )}
          {(transaction.description || transaction.admin_id) && (
            <div className="pt-2 border-t border-gray-200 space-y-1">
              {transaction.description && (
                <div>
                  <p className="text-xs text-gray-500">Description</p>
                  <p className="text-xs text-gray-700">{transaction.description}</p>
                </div>
              )}
              {transaction.admin_id && (
                <div>
                  <p className="text-xs text-gray-500">Admin</p>
                  <p className="text-xs text-gray-700">{transaction.admin_id.slice(0, 8)}...</p>
                </div>
              )}
            </div>
          )}
        </div>
        {/* Description and Admin Info Row */}
        {(transaction.description || transaction.admin_id) && (
          <div className="col-span-8 px-4 pb-2 border-t border-gray-100">
            <div className="flex flex-col gap-1 pt-2">
              {transaction.description && (
                <p className="text-xs text-gray-600">
                  <span className="font-medium">Description:</span> {transaction.description}
                </p>
              )}
              {transaction.admin_id && (
                <p className="text-xs text-gray-500">
                  <span className="font-medium">Admin:</span> {transaction.admin_id.slice(0, 8)}...
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }, [getBalanceCheckResult, handleManualCredit, manuallyCrediting]);

  const renderMobileCard = useCallback((transaction, index) => {
    const balanceCheck = getBalanceCheckResult ? getBalanceCheckResult(transaction) : null;

    return (
      <div className="bg-white p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                transaction.type === 'deposit' 
                  ? 'bg-blue-100 text-blue-700' 
                  : transaction.type === 'refund'
                  ? 'bg-green-100 text-green-700'
                  : transaction.type === 'order'
                  ? 'bg-purple-100 text-purple-700'
                  : transaction.type === 'referral_bonus'
                  ? 'bg-emerald-100 text-emerald-700'
                  : transaction.type === 'manual_adjustment'
                  ? 'bg-indigo-100 text-indigo-700'
                  : transaction.type === 'unknown'
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-gray-100 text-gray-700'
              }`}>
                {transaction.type === 'deposit' ? 'Deposit' : 
                 transaction.type === 'refund' ? 'Refund' :
                 transaction.type === 'order' ? 'Order' :
                 transaction.type === 'referral_bonus' ? 'Referral Bonus' :
                 transaction.type === 'manual_adjustment' ? 'Manual Adjustment' :
                 transaction.type === 'unknown' ? 'Unknown' :
                 transaction.type}
              </span>
              {transaction.auto_classified && (
                <span className="px-1.5 py-0.5 rounded text-xs bg-amber-50 text-amber-700 border border-amber-200">
                  Auto
                </span>
              )}
              <span className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                transaction.status === 'approved' 
                  ? 'bg-green-100 text-green-700'
                  : transaction.status === 'pending'
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-red-100 text-red-700'
              }`}>
                {transaction.status}
              </span>
            </div>
            <p className="font-medium text-gray-900 text-sm">{transaction.profiles?.name || 'Unknown'}</p>
            <p className="text-xs text-gray-600 break-all">{transaction.profiles?.email || transaction.user_id?.slice(0, 8)}</p>
          </div>
          <div className="text-right">
            {(() => {
              const isCredit = transaction.type === 'deposit' || 
                              transaction.type === 'refund' || 
                              transaction.type === 'referral_bonus' ||
                              (transaction.type === 'manual_adjustment' && transaction.description?.toLowerCase().includes('credit'));
              const isDebit = transaction.type === 'order' ||
                             (transaction.type === 'manual_adjustment' && transaction.description?.toLowerCase().includes('debit'));
              return (
                <p className={`font-semibold text-lg ${isCredit ? 'text-green-600' : isDebit ? 'text-red-600' : 'text-gray-600'}`}>
                  {isCredit ? '+' : isDebit ? '-' : ''}₵{transaction.amount?.toFixed(2) || '0.00'}
                </p>
              );
            })()}
          </div>
        </div>
        <div className="pt-2 border-t border-gray-200 space-y-2">
          <div>
            <p className="text-xs text-gray-500">Transaction ID</p>
            <p className="text-xs text-gray-700 break-all">{transaction.id}</p>
            {transaction.paystack_reference && (
              <p className="text-xs text-gray-500 mt-1">Paystack Ref: {transaction.paystack_reference}</p>
            )}
            {transaction.moolre_reference && (
              <p className="text-xs text-gray-500 mt-1">Moolre Ref: {transaction.moolre_reference}</p>
            )}
            {transaction.moolre_channel && (
              <p className="text-xs text-gray-500 mt-1">Network: {transaction.moolre_channel}</p>
            )}
            {transaction.order_id && (
              <p className="text-xs text-gray-500 mt-1">Order: {transaction.order_id.slice(0, 12)}...</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-500">Date</p>
            <p className="text-sm text-gray-700">{new Date(transaction.created_at).toLocaleDateString()} {new Date(transaction.created_at).toLocaleTimeString()}</p>
          </div>
          {transaction.type === 'deposit' && transaction.paystack_status && (() => {
            const statusConfig = getPaymentStatusConfig(transaction.paystack_status, 'paystack');
            return (
              <div>
                <p className="text-xs text-gray-500">Paystack Status</p>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
              </div>
            );
          })()}
          {transaction.type === 'deposit' && transaction.korapay_status && (() => {
            const statusConfig = getPaymentStatusConfig(transaction.korapay_status, 'korapay');
            return (
              <div>
                <p className="text-xs text-gray-500">Korapay Status</p>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
              </div>
            );
          })()}
          {transaction.type === 'deposit' && transaction.moolre_status && (() => {
            const statusConfig = getPaymentStatusConfig(transaction.moolre_status, 'moolre');
            return (
              <div>
                <p className="text-xs text-gray-500">Moolre Status</p>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
              </div>
            );
          })()}
          <div>
            <p className="text-xs text-gray-500">Balance Status</p>
            {balanceCheck === 'not_updated' ? (
              <span className="inline-block mt-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                not-updated
              </span>
            ) : balanceCheck === 'updated' ? (
              <span className="inline-flex items-center gap-1 mt-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                <CheckCircle className="w-3 h-3" />
                Updated
              </span>
            ) : balanceCheck === 'checking' ? (
              <span className="inline-block mt-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                Checking...
              </span>
            ) : (
              <span className="inline-block mt-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                Unknown
              </span>
            )}
          </div>
        </div>
        {balanceCheck === 'not_updated' && (
          <div className="pt-3 border-t border-gray-200">
            <Button
              onClick={() => handleManualCredit(transaction)}
              disabled={manuallyCrediting === transaction.id}
              variant="outline"
              size="sm"
              className="w-full text-green-600 hover:text-green-700 border-green-300 min-h-[44px]"
            >
              {manuallyCrediting === transaction.id ? 'Crediting...' : 'Credit Balance'}
            </Button>
          </div>
        )}
        {(transaction.description || transaction.admin_id) && (
          <div className="pt-2 border-t border-gray-200 space-y-1">
            {transaction.description && (
              <div>
                <p className="text-xs text-gray-500">Description</p>
                <p className="text-xs text-gray-700">{transaction.description}</p>
              </div>
            )}
            {transaction.admin_id && (
              <div>
                <p className="text-xs text-gray-500">Admin</p>
                <p className="text-xs text-gray-700">{transaction.admin_id.slice(0, 8)}...</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }, [getBalanceCheckResult, handleManualCredit, manuallyCrediting]);

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
        <div className="space-y-4">
          <div className="h-8 bg-gray-200 rounded animate-pulse w-1/3"></div>
          <div className="h-12 bg-gray-200 rounded animate-pulse"></div>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded animate-pulse"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const useVirtualScroll = filteredTransactions.length > VIRTUAL_SCROLL_THRESHOLD;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm w-full max-w-full overflow-hidden">
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
              className="flex items-center gap-2 min-h-[44px]"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              placeholder="Search by transaction ID, username, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-11 h-12 text-base"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                type="date"
                placeholder="Filter by date"
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full h-12 text-base"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-40 min-h-[44px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="deposit">Deposit</SelectItem>
                <SelectItem value="order">Order</SelectItem>
                <SelectItem value="refund">Refund</SelectItem>
                <SelectItem value="referral_bonus">Referral Bonus</SelectItem>
                <SelectItem value="manual_adjustment">Manual Adjustment</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40 min-h-[44px]">
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
      </div>

      {filteredTransactions.length === 0 ? (
        <p className="text-gray-600 text-center py-8">No transactions found</p>
      ) : (
        <>
          <ResponsiveTable
            items={paginatedTransactions}
            renderTableHeader={renderTableHeader}
            renderTableRow={renderTableRow}
            renderCard={renderMobileCard}
            useVirtualScroll={useVirtualScroll}
            emptyMessage="No transactions found"
            minTableWidth="1200px"
            itemHeight={100}
          />

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


