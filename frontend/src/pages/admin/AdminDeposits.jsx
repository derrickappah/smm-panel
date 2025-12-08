import React, { memo, useState, useMemo, useCallback, useEffect } from 'react';
import { useAdminDeposits, useApproveDeposit, useRejectDeposit } from '@/hooks/useAdminDeposits';
import { useDebounce } from '@/hooks/useDebounce';
import VirtualizedList from '@/components/VirtualizedList';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, RefreshCw, Filter, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

const ITEMS_PER_PAGE = 50;
const VIRTUAL_SCROLL_THRESHOLD = 100;

const AdminDeposits = memo(({ onRefresh, refreshing = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [approvingDeposit, setApprovingDeposit] = useState(null);

  const debouncedSearch = useDebounce(searchTerm, 300);

  const { 
    data, 
    isLoading, 
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch
  } = useAdminDeposits({ 
    enabled: true, 
    useInfinite: true 
  });

  const approveDepositMutation = useApproveDeposit();
  const rejectDepositMutation = useRejectDeposit();

  const allDeposits = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap(page => page.data || []);
  }, [data]);

  // Get total count from first page
  const totalCount = useMemo(() => {
    return data?.pages?.[0]?.total || allDeposits.length;
  }, [data, allDeposits.length]);

  // Load all pages when there are no filters (to show accurate total count)
  useEffect(() => {
    if (!isLoading && hasNextPage && !isFetchingNextPage && !debouncedSearch && statusFilter === 'all' && !dateFilter) {
      // Load all remaining pages to get accurate total count
      fetchNextPage();
    }
  }, [isLoading, hasNextPage, isFetchingNextPage, debouncedSearch, statusFilter, dateFilter, fetchNextPage]);

  // Load more pages when needed for pagination with filters
  useEffect(() => {
    if (!isLoading && hasNextPage && !isFetchingNextPage) {
      const currentPageData = allDeposits.length;
      const neededData = page * ITEMS_PER_PAGE;
      
      // If we need more data than we have, fetch next page
      if (neededData > currentPageData) {
        fetchNextPage();
      }
    }
  }, [page, allDeposits.length, hasNextPage, isFetchingNextPage, isLoading, fetchNextPage]);

  const filteredDeposits = useMemo(() => {
    let filtered = [...allDeposits];

    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase();
      filtered = filtered.filter(deposit => {
        const userName = (deposit.profiles?.name || '').toLowerCase();
        const userEmail = (deposit.profiles?.email || '').toLowerCase();
        const userPhone = (deposit.profiles?.phone_number || '').toLowerCase();
        const transactionId = (deposit.id || '').toLowerCase();
        return userName.includes(searchLower) || 
               userEmail.includes(searchLower) ||
               userPhone.includes(searchLower) ||
               transactionId.includes(searchLower);
      });
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(deposit => deposit.status === statusFilter);
    }

    if (dateFilter) {
      const filterDate = new Date(dateFilter);
      filterDate.setHours(0, 0, 0, 0);
      const filterDateEnd = new Date(filterDate);
      filterDateEnd.setHours(23, 59, 59, 999);
      
      filtered = filtered.filter(deposit => {
        const depositDate = new Date(deposit.created_at);
        return depositDate >= filterDate && depositDate <= filterDateEnd;
      });
    }

    return filtered;
  }, [allDeposits, debouncedSearch, statusFilter, dateFilter]);

  const paginatedDeposits = useMemo(() => {
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    return filteredDeposits.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredDeposits, page]);

  // Use total count for pagination, but show filtered count in display
  const totalPages = Math.ceil(filteredDeposits.length / ITEMS_PER_PAGE);
  const displayTotal = filteredDeposits.length;

  const handleApproveDeposit = useCallback(async (deposit) => {
    setApprovingDeposit(deposit.id);
    try {
      await approveDepositMutation.mutateAsync({
        transactionId: deposit.id,
        userId: deposit.user_id,
        amount: deposit.amount
      });
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to approve deposit:', error);
    } finally {
      setApprovingDeposit(null);
    }
  }, [approveDepositMutation, onRefresh]);

  const handleRejectDeposit = useCallback(async (depositId) => {
    if (!confirm('Are you sure you want to reject this deposit?')) return;
    
    try {
      await rejectDepositMutation.mutateAsync(depositId);
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to reject deposit:', error);
    }
  }, [rejectDepositMutation, onRefresh]);

  const handleApproveManualDeposit = useCallback(async (deposit) => {
    setApprovingDeposit(deposit.id);
    try {
      const { error: transactionError } = await supabase
        .from('transactions')
        .update({ status: 'approved' })
        .eq('id', deposit.id);

      if (transactionError) throw transactionError;

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', deposit.user_id)
        .single();

      if (profileError) throw profileError;

      const newBalance = (parseFloat(profile.balance) || 0) + parseFloat(deposit.amount);
      const { error: balanceError } = await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', deposit.user_id);

      if (balanceError) throw balanceError;

      toast.success('Deposit approved successfully');
      if (onRefresh) onRefresh();
    } catch (error) {
      toast.error(error.message || 'Failed to approve deposit');
    } finally {
      setApprovingDeposit(null);
    }
  }, [onRefresh]);

  const renderDepositRow = useCallback((deposit) => {
    const isManual = deposit.payment_method === 'manual';
    const isPaystack = deposit.payment_method === 'paystack';
    const isHubtel = deposit.payment_method === 'hubtel';
    const isKorapay = deposit.payment_method === 'korapay';

    return (
      <div className="grid grid-cols-12 gap-4 p-4 items-center bg-white hover:bg-gray-50 transition-colors border-b border-gray-200">
        <div className="col-span-2">
          <p className="font-medium text-gray-900 break-words">{deposit.profiles?.name || 'Unknown'}</p>
          <p className="text-xs text-gray-600 break-all">{deposit.profiles?.email || deposit.user_id?.slice(0, 8)}</p>
          {deposit.profiles?.phone_number && (
            <p className="text-xs text-gray-500">📱 {deposit.profiles.phone_number}</p>
          )}
        </div>
        <div className="col-span-1.5">
          <p className="font-semibold text-gray-900">₵{deposit.amount?.toFixed(2) || '0.00'}</p>
        </div>
        <div className="col-span-1.5">
          <span className={`px-3 py-1.5 rounded-full text-xs font-medium ${
            deposit.status === 'approved' ? 'bg-green-100 text-green-700' :
            deposit.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
            'bg-red-100 text-red-700'
          }`}>
            {deposit.status}
          </span>
        </div>
        <div className="col-span-2">
          <p className="text-sm text-gray-700">{deposit.payment_method || 'N/A'}</p>
          {deposit.paystack_reference && (
            <p className="text-xs text-gray-500">Ref: {deposit.paystack_reference}</p>
          )}
        </div>
        <div className="col-span-2">
          <p className="text-sm text-gray-700">{new Date(deposit.created_at).toLocaleDateString()}</p>
          <p className="text-xs text-gray-500">{new Date(deposit.created_at).toLocaleTimeString()}</p>
        </div>
        <div className="col-span-3">
          {deposit.status === 'pending' && isManual ? (
            <Button
              onClick={() => handleApproveManualDeposit(deposit)}
              disabled={approvingDeposit === deposit.id}
              variant="default"
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white text-xs"
            >
              {approvingDeposit === deposit.id ? 'Approving...' : 'Approve'}
            </Button>
          ) : deposit.status === 'pending' && (isPaystack || isHubtel || isKorapay) ? (
            <span className="text-xs text-gray-500">Auto-verify</span>
          ) : deposit.status === 'approved' ? (
            <span className="text-xs text-green-600 flex items-center gap-1">
              <CheckCircle className="w-4 h-4" />
              Approved
            </span>
          ) : (
            <span className="text-xs text-red-600 flex items-center gap-1">
              <XCircle className="w-4 h-4" />
              Rejected
            </span>
          )}
        </div>
      </div>
    );
  }, [handleApproveManualDeposit, approvingDeposit]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-600"></div>
      </div>
    );
  }

  const useVirtualScroll = filteredDeposits.length > VIRTUAL_SCROLL_THRESHOLD;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Payment Deposits</h2>
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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48 h-11">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search by username, email, phone, or transaction ID..."
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

      {filteredDeposits.length === 0 ? (
        <p className="text-gray-600 text-center py-8">No deposits found</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-200">
            {useVirtualScroll ? (
              <div className="min-w-[1200px]">
                <div className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                  <div className="grid grid-cols-12 gap-4 p-4 font-semibold text-sm">
                    <div className="col-span-2">User</div>
                    <div className="col-span-1.5">Amount</div>
                    <div className="col-span-1.5">Status</div>
                    <div className="col-span-2">Payment Method</div>
                    <div className="col-span-2">Date</div>
                    <div className="col-span-3">Actions</div>
                  </div>
                </div>
                <VirtualizedList
                  items={paginatedDeposits}
                  renderItem={renderDepositRow}
                  itemHeight={100}
                  height={600}
                />
              </div>
            ) : (
              <div className="max-h-[600px] overflow-y-auto overflow-x-auto">
                <div className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10 min-w-[1200px]">
                  <div className="grid grid-cols-12 gap-4 p-4 font-semibold text-sm">
                    <div className="col-span-2">User</div>
                    <div className="col-span-1.5">Amount</div>
                    <div className="col-span-1.5">Status</div>
                    <div className="col-span-2">Payment Method</div>
                    <div className="col-span-2">Date</div>
                    <div className="col-span-3">Actions</div>
                  </div>
                </div>
                <div className="divide-y divide-gray-200/50 min-w-[1200px]">
                  {paginatedDeposits.map((deposit) => (
                    <div key={deposit.id}>
                      {renderDepositRow(deposit)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-gray-600">
              Showing {(page - 1) * ITEMS_PER_PAGE + 1} to {Math.min(page * ITEMS_PER_PAGE, displayTotal)} of {displayTotal} deposits
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

AdminDeposits.displayName = 'AdminDeposits';

export default AdminDeposits;


