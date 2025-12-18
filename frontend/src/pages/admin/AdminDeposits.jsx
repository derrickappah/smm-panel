import React, { memo, useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAdminDeposits, useApproveDeposit, useRejectDeposit } from '@/hooks/useAdminDeposits';
import { useDebounce } from '@/hooks/useDebounce';
import VirtualizedList from '@/components/VirtualizedList';
import ResponsiveTable from '@/components/admin/ResponsiveTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, RefreshCw, Filter, CheckCircle, XCircle, AlertCircle, Image as ImageIcon, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

const ITEMS_PER_PAGE = 50;
const VIRTUAL_SCROLL_THRESHOLD = 100;

const AdminDeposits = memo(({ onRefresh, refreshing = false }) => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [approvingDeposit, setApprovingDeposit] = useState(null);
  const [verifyingDeposit, setVerifyingDeposit] = useState(null);
  const [manualRefDialog, setManualRefDialog] = useState({ open: false, deposit: null, error: null, paymentMethod: null });
  const [manualReference, setManualReference] = useState('');
  const [paymentProofDialog, setPaymentProofDialog] = useState({ open: false, imageUrl: null, deposit: null });

  const debouncedSearch = useDebounce(searchTerm, 300);

  // Fetch manual deposit details from settings
  const { data: manualDepositDetails } = useQuery({
    queryKey: ['admin', 'manual-deposit-details'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', [
          'manual_deposit_phone_number',
          'manual_deposit_account_name',
          'manual_deposit_instructions'
        ]);

      if (error) throw error;

      const details = {
        phone_number: '0559272762',
        account_name: 'MTN - APPIAH MANASSEH ATTAH',
        instructions: 'Make PAYMENT to 0559272762\nMTN - APPIAH MANASSEH ATTAH\nuse your USERNAME as reference\nsend SCREENSHOT of PAYMENT when done'
      };

      data?.forEach(item => {
        if (item.key === 'manual_deposit_phone_number') {
          details.phone_number = item.value;
        } else if (item.key === 'manual_deposit_account_name') {
          details.account_name = item.value;
        } else if (item.key === 'manual_deposit_instructions') {
          details.instructions = item.value;
        }
      });

      return details;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

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
    
    // Optimistically update the UI immediately
    queryClient.setQueryData(['admin', 'deposits'], (oldData) => {
      if (!oldData?.pages) return oldData;
      
      return {
        ...oldData,
        pages: oldData.pages.map(page => ({
          ...page,
          data: page.data?.map(tx => 
            tx.id === deposit.id 
              ? { ...tx, status: 'approved' }
              : tx
          ) || []
        }))
      };
    });
    
    try {
      await approveDepositMutation.mutateAsync({
        transactionId: deposit.id,
        userId: deposit.user_id,
        amount: deposit.amount
      });
      // Mutation's onSuccess will handle refetch and invalidation
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to approve deposit:', error);
      // Revert optimistic update on error by invalidating
      queryClient.invalidateQueries({ queryKey: ['admin', 'deposits'] });
    } finally {
      setApprovingDeposit(null);
    }
  }, [approveDepositMutation, onRefresh, queryClient]);

  const handleRejectDeposit = useCallback(async (depositId) => {
    if (!confirm('Are you sure you want to reject this deposit?')) return;
    
    // Optimistically update the UI immediately
    queryClient.setQueryData(['admin', 'deposits'], (oldData) => {
      if (!oldData?.pages) return oldData;
      
      return {
        ...oldData,
        pages: oldData.pages.map(page => ({
          ...page,
          data: page.data?.map(tx => 
            tx.id === depositId 
              ? { ...tx, status: 'rejected' }
              : tx
          ) || []
        }))
      };
    });
    
    try {
      await rejectDepositMutation.mutateAsync(depositId);
      // Mutation's onSuccess will handle refetch and invalidation
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to reject deposit:', error);
      // Revert optimistic update on error by invalidating
      queryClient.invalidateQueries({ queryKey: ['admin', 'deposits'] });
    }
  }, [rejectDepositMutation, onRefresh, queryClient]);

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

      // Get current admin user ID
      const { data: { user: authUser } } = await supabase.auth.getUser();
      
      // Create transaction record for manual adjustment (if deposit was already a transaction, this is just for tracking)
      // Note: The deposit itself is already a transaction, so we don't need to create another one
      // But we could update the existing transaction with admin_id if needed
      if (authUser?.id) {
        await supabase
          .from('transactions')
          .update({ admin_id: authUser.id })
          .eq('id', deposit.id);
      }

      toast.success('Deposit approved successfully');
      if (onRefresh) onRefresh();
    } catch (error) {
      toast.error(error.message || 'Failed to approve deposit');
    } finally {
      setApprovingDeposit(null);
    }
  }, [onRefresh]);

  const handleVerifyPaystackDeposit = useCallback(async (deposit, manualRef = null) => {
    setVerifyingDeposit(deposit.id);
    try {
      const response = await fetch('/api/manual-verify-paystack-deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          transactionId: deposit.id,
          ...(manualRef && { reference: manualRef })
        })
      });

      const data = await response.json();

      if (!response.ok) {
        // If error suggests manual reference and we don't have one, show dialog
        if (data.error && data.error.includes('No Paystack reference') && !manualRef) {
          setManualRefDialog({ 
            open: true, 
            deposit, 
            error: data.error,
            suggestions: data.suggestions || [],
            help: data.help,
            paymentMethod: 'paystack'
          });
          setVerifyingDeposit(null);
          return;
        }
        throw new Error(data.error || 'Failed to verify deposit');
      }

      if (data.updateResult?.newStatus === 'approved') {
        toast.success('Deposit verified and approved successfully');
      } else if (data.updateResult?.newStatus === 'rejected') {
        toast.warning('Deposit verified and rejected (payment failed)');
      } else {
        toast.info(`Paystack status updated: ${data.paystackStatus}`);
      }

      // Close dialog if open
      if (manualRefDialog.open && manualRefDialog.paymentMethod === 'paystack') {
        setManualRefDialog({ open: false, deposit: null, error: null, paymentMethod: null });
        setManualReference('');
      }

      // Optimistically update the transaction in cache for immediate UI update
      queryClient.setQueryData(['admin', 'deposits'], (oldData) => {
        if (!oldData?.pages) return oldData;
        
        return {
          ...oldData,
          pages: oldData.pages.map(page => ({
            ...page,
            data: page.data?.map(tx => 
              tx.id === deposit.id 
                ? { 
                    ...tx, 
                    status: data.updateResult?.newStatus || tx.status,
                    paystack_reference: data.reference || tx.paystack_reference,
                    paystack_status: data.paystackStatus || tx.paystack_status
                  }
                : tx
            ) || []
          }))
        };
      });

      // Invalidate and refetch to ensure data is in sync with server
      queryClient.invalidateQueries({ queryKey: ['admin', 'deposits'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      
      // Refetch in background to sync with server
      refetch();

      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to verify Paystack deposit:', error);
      toast.error(error.message || 'Failed to verify deposit');
    } finally {
      setVerifyingDeposit(null);
    }
  }, [onRefresh, manualRefDialog.open, queryClient, refetch]);

  const handleVerifyMoolreDeposit = useCallback(async (deposit, manualRef = null) => {
    setVerifyingDeposit(deposit.id);
    try {
      // Get JWT token for API authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No session token available. Please log in again.');
      }

      const response = await fetch('/api/manual-verify-moolre-deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ 
          transactionId: deposit.id,
          ...(manualRef && { reference: manualRef })
        })
      });

      const data = await response.json();

      if (!response.ok) {
        // If error suggests manual Moolre ID and we don't have one, show dialog
        if (data.error && data.error.includes('No Moolre ID') && !manualRef) {
          setManualRefDialog({ 
            open: true, 
            deposit, 
            error: data.error,
            paymentMethod: 'moolre'
          });
          setVerifyingDeposit(null);
          return;
        }
        throw new Error(data.error || 'Failed to verify deposit');
      }

      if (data.updateResult?.newStatus === 'approved') {
        toast.success('Deposit verified and approved successfully');
      } else if (data.updateResult?.newStatus === 'rejected') {
        toast.warning('Deposit verified and rejected (payment failed)');
      } else {
        toast.info(`Moolre status updated: ${data.moolreStatus}`);
      }

      // Optimistically update the transaction in cache for immediate UI update
      queryClient.setQueryData(['admin', 'deposits'], (oldData) => {
        if (!oldData?.pages) return oldData;
        
        return {
          ...oldData,
          pages: oldData.pages.map(page => ({
            ...page,
            data: page.data?.map(tx => 
              tx.id === deposit.id 
                ? { 
                    ...tx, 
                    status: data.updateResult?.newStatus || tx.status,
                    moolre_reference: data.reference || tx.moolre_reference,
                    moolre_status: data.moolreStatus || tx.moolre_status
                  }
                : tx
            ) || []
          }))
        };
      });

      // Invalidate and refetch to ensure data is in sync with server
      queryClient.invalidateQueries({ queryKey: ['admin', 'deposits'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      
      // Refetch in background to sync with server
      refetch();

      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to verify Moolre deposit:', error);
      toast.error(error.message || 'Failed to verify deposit');
    } finally {
      setVerifyingDeposit(null);
    }
  }, [onRefresh, manualRefDialog.open, queryClient, refetch]);

  const handleVerifyMoolreWebDeposit = useCallback(async (deposit, manualRef = null) => {
    setVerifyingDeposit(deposit.id);
    try {
      // Get JWT token for API authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No session token available. Please log in again.');
      }

      const response = await fetch('/api/manual-verify-moolre-web-deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ 
          transactionId: deposit.id,
          ...(manualRef && { reference: manualRef })
        })
      });

      const data = await response.json();

      if (!response.ok) {
        // If error suggests manual Moolre ID and we don't have one, show dialog
        if (data.error && data.error.includes('No Moolre ID') && !manualRef) {
          setManualRefDialog({ 
            open: true, 
            deposit, 
            error: data.error,
            paymentMethod: 'moolre_web'
          });
          setVerifyingDeposit(null);
          return;
        }
        throw new Error(data.error || 'Failed to verify deposit');
      }

      if (data.updateResult?.newStatus === 'approved') {
        toast.success('Deposit verified and approved successfully');
      } else if (data.updateResult?.newStatus === 'rejected') {
        toast.warning('Deposit verified and rejected (payment failed)');
      } else {
        toast.info(`Moolre Web status updated: ${data.moolreStatus}`);
      }

      // Optimistically update the transaction in cache for immediate UI update
      queryClient.setQueryData(['admin', 'deposits'], (oldData) => {
        if (!oldData?.pages) return oldData;
        
        return {
          ...oldData,
          pages: oldData.pages.map(page => ({
            ...page,
            data: page.data?.map(tx => 
              tx.id === deposit.id 
                ? { 
                    ...tx, 
                    status: data.updateResult?.newStatus || tx.status,
                    moolre_reference: data.reference || tx.moolre_reference,
                    moolre_status: data.moolreStatus || tx.moolre_status
                  }
                : tx
            ) || []
          }))
        };
      });

      // Close dialog if open
      if (manualRefDialog.open && manualRefDialog.paymentMethod === 'moolre_web') {
        setManualRefDialog({ open: false, deposit: null, error: null, paymentMethod: null });
        setManualReference('');
      }

      // Invalidate and refetch to ensure data is in sync with server
      queryClient.invalidateQueries({ queryKey: ['admin', 'deposits'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      
      // Refetch in background to sync with server
      refetch();

      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to verify Moolre Web deposit:', error);
      toast.error(error.message || 'Failed to verify deposit');
    } finally {
      setVerifyingDeposit(null);
    }
  }, [onRefresh, manualRefDialog.open, queryClient, refetch]);

  const handleManualReferenceSubmit = useCallback(async () => {
    if (!manualRefDialog.deposit || !manualReference.trim()) {
      const methodName = manualRefDialog.paymentMethod === 'moolre' ? 'Moolre' : 
                        manualRefDialog.paymentMethod === 'moolre_web' ? 'Moolre Web' : 'Paystack';
      const fieldName = (manualRefDialog.paymentMethod === 'moolre' || manualRefDialog.paymentMethod === 'moolre_web') 
                        ? 'Moolre ID' : 'reference';
      toast.error(`Please enter a ${methodName} ${fieldName}`);
      return;
    }

    const paymentMethod = manualRefDialog.paymentMethod || 'paystack';
    if (paymentMethod === 'moolre') {
      await handleVerifyMoolreDeposit(manualRefDialog.deposit, manualReference.trim());
    } else if (paymentMethod === 'moolre_web') {
      await handleVerifyMoolreWebDeposit(manualRefDialog.deposit, manualReference.trim());
    } else {
      await handleVerifyPaystackDeposit(manualRefDialog.deposit, manualReference.trim());
    }
  }, [manualRefDialog.deposit, manualRefDialog.paymentMethod, manualReference, handleVerifyPaystackDeposit, handleVerifyMoolreDeposit, handleVerifyMoolreWebDeposit]);

  // Helper function to format payment method name
  const formatPaymentMethod = useCallback((method) => {
    if (!method) return 'N/A';
    const methodMap = {
      'paystack': 'Paystack',
      'manual': 'Mobile Money',
      'momo': 'Mobile Money',
      'hubtel': 'Hubtel',
      'korapay': 'Korapay',
      'moolre': 'Moolre',
      'moolre_web': 'Moolre Web',
      'ref_bonus': 'Referral Bonus'
    };
    return methodMap[method.toLowerCase()] || method.charAt(0).toUpperCase() + method.slice(1);
  }, []);

  // Helper function to get payment method color classes
  const getPaymentMethodColors = useCallback((method) => {
    if (!method) return 'bg-gray-100 text-gray-700';
    const methodLower = method.toLowerCase();
    const colorMap = {
      'paystack': 'bg-purple-100 text-purple-700 border-purple-200',
      'manual': 'bg-blue-100 text-blue-700 border-blue-200',
      'momo': 'bg-blue-100 text-blue-700 border-blue-200',
      'hubtel': 'bg-orange-100 text-orange-700 border-orange-200',
      'korapay': 'bg-indigo-100 text-indigo-700 border-indigo-200',
      'moolre': 'bg-teal-100 text-teal-700 border-teal-200',
      'moolre_web': 'bg-cyan-100 text-cyan-700 border-cyan-200',
      'ref_bonus': 'bg-pink-100 text-pink-700 border-pink-200'
    };
    return colorMap[methodLower] || 'bg-gray-100 text-gray-700 border-gray-200';
  }, []);

  const renderTableHeader = useCallback(() => (
    <div className="grid grid-cols-12 gap-4 p-4 font-semibold text-sm min-w-[1200px]">
      <div className="col-span-2 min-w-[180px]">User</div>
      <div className="col-span-1.5 min-w-[100px]">Amount</div>
      <div className="col-span-1.5 min-w-[100px]">Status</div>
      <div className="col-span-2 min-w-[150px]">Payment Method</div>
      <div className="col-span-2 min-w-[150px]">Date</div>
      <div className="col-span-3 min-w-[200px]">Actions</div>
    </div>
  ), []);

  const renderTableRow = useCallback((deposit, index) => {
    const depositMethod = deposit.deposit_method || deposit.payment_method; // Support both for backward compatibility
    const isManual = depositMethod === 'manual' || depositMethod === 'momo';
    const isPaystack = depositMethod === 'paystack';
    const isHubtel = depositMethod === 'hubtel';
    const isKorapay = depositMethod === 'korapay';
    const isMoolre = depositMethod === 'moolre';
    const isMoolreWeb = depositMethod === 'moolre_web';

    return (
      <div className="grid grid-cols-12 gap-4 p-4 items-center bg-white hover:bg-gray-50 transition-colors border-b border-gray-200 min-w-[1200px]">
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
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${getPaymentMethodColors(depositMethod)}`}>
            {formatPaymentMethod(depositMethod)}
          </span>
          {deposit.paystack_reference && (
            <p className="text-xs text-gray-500 mt-1">Ref: {deposit.paystack_reference}</p>
          )}
          {deposit.korapay_reference && (
            <p className="text-xs text-gray-500 mt-1">Ref: {deposit.korapay_reference}</p>
          )}
          {deposit.moolre_reference && (
            <p className="text-xs text-gray-500 mt-1">Ref: {deposit.moolre_reference}</p>
          )}
        </div>
        <div className="col-span-2">
          <p className="text-sm text-gray-700">{new Date(deposit.created_at).toLocaleDateString()}</p>
          <p className="text-xs text-gray-500">{new Date(deposit.created_at).toLocaleTimeString()}</p>
        </div>
        <div className="col-span-3">
          {deposit.status === 'pending' ? (
            <div className="flex flex-col gap-2">
              {/* Payment proof button for manual deposits */}
              {isManual && deposit.payment_proof_url && (
                <Button
                  onClick={() => setPaymentProofDialog({ open: true, imageUrl: deposit.payment_proof_url, deposit })}
                  variant="outline"
                  size="sm"
                  className="text-xs min-h-[36px] border-blue-500 text-blue-600 hover:bg-blue-50"
                >
                  <ImageIcon className="w-4 h-4 mr-1" />
                  View Proof
                </Button>
              )}
              
              {/* Verify buttons for specific payment methods */}
              {isPaystack && (
                <Button
                  onClick={() => handleVerifyPaystackDeposit(deposit)}
                  disabled={verifyingDeposit === deposit.id}
                  variant="outline"
                  size="sm"
                  className="text-xs min-h-[36px] border-blue-500 text-blue-600 hover:bg-blue-50"
                >
                  {verifyingDeposit === deposit.id ? 'Verifying...' : 'Verify with Paystack'}
                </Button>
              )}
              {isMoolre && (
                <Button
                  onClick={() => handleVerifyMoolreDeposit(deposit)}
                  disabled={verifyingDeposit === deposit.id}
                  variant="outline"
                  size="sm"
                  className="text-xs min-h-[36px] border-teal-500 text-teal-600 hover:bg-teal-50"
                >
                  {verifyingDeposit === deposit.id ? 'Verifying...' : 'Verify with Moolre'}
                </Button>
              )}
              {isMoolreWeb && (
                <Button
                  onClick={() => handleVerifyMoolreWebDeposit(deposit)}
                  disabled={verifyingDeposit === deposit.id}
                  variant="outline"
                  size="sm"
                  className="text-xs min-h-[36px] border-cyan-500 text-cyan-600 hover:bg-cyan-50"
                >
                  {verifyingDeposit === deposit.id ? 'Verifying...' : 'Verify with Moolre Web'}
                </Button>
              )}
              
              {/* Manual approve/reject buttons for all pending deposits */}
              <div className="flex gap-2">
                <Button
                  onClick={() => handleApproveDeposit(deposit)}
                  disabled={approvingDeposit === deposit.id || verifyingDeposit === deposit.id}
                  variant="default"
                  size="sm"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs min-h-[36px]"
                >
                  {approvingDeposit === deposit.id ? 'Approving...' : 'Approve'}
                </Button>
                <Button
                  onClick={() => handleRejectDeposit(deposit.id)}
                  disabled={approvingDeposit === deposit.id || verifyingDeposit === deposit.id}
                  variant="destructive"
                  size="sm"
                  className="flex-1 text-xs min-h-[36px]"
                >
                  Reject
                </Button>
              </div>
            </div>
          ) : isManual && deposit.payment_proof_url ? (
            <Button
              onClick={() => setPaymentProofDialog({ open: true, imageUrl: deposit.payment_proof_url, deposit })}
              variant="outline"
              size="sm"
              className="text-xs min-h-[44px] border-blue-500 text-blue-600 hover:bg-blue-50"
            >
              <ImageIcon className="w-4 h-4 mr-1" />
              View Proof
            </Button>
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
  }, [handleApproveDeposit, handleRejectDeposit, handleApproveManualDeposit, handleVerifyPaystackDeposit, handleVerifyMoolreDeposit, handleVerifyMoolreWebDeposit, approvingDeposit, verifyingDeposit, formatPaymentMethod, getPaymentMethodColors]);

  const renderMobileCard = useCallback((deposit, index) => {
    const depositMethod = deposit.deposit_method || deposit.payment_method;
    const isManual = depositMethod === 'manual' || depositMethod === 'momo';
    const isPaystack = depositMethod === 'paystack';
    const isHubtel = depositMethod === 'hubtel';
    const isKorapay = depositMethod === 'korapay';
    const isMoolre = depositMethod === 'moolre';
    const isMoolreWeb = depositMethod === 'moolre_web';

    return (
      <div className="bg-white p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="font-semibold text-gray-900 text-base">{deposit.profiles?.name || 'Unknown'}</p>
            <p className="text-sm text-gray-600 mt-1 break-all">{deposit.profiles?.email || deposit.user_id?.slice(0, 8)}</p>
            {deposit.profiles?.phone_number && (
              <p className="text-sm text-gray-500 mt-1">📱 {deposit.profiles.phone_number}</p>
            )}
          </div>
          <div className="text-right">
            <p className="font-semibold text-gray-900 text-lg">₵{deposit.amount?.toFixed(2) || '0.00'}</p>
            <span className={`inline-block mt-1 px-2.5 py-1 rounded-full text-xs font-medium ${
              deposit.status === 'approved' ? 'bg-green-100 text-green-700' :
              deposit.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
              'bg-red-100 text-red-700'
            }`}>
              {deposit.status}
            </span>
          </div>
        </div>
        <div className="pt-2 border-t border-gray-200 space-y-2">
          <div>
            <p className="text-xs text-gray-500">Payment Method</p>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border mt-1 ${getPaymentMethodColors(depositMethod)}`}>
              {formatPaymentMethod(depositMethod)}
            </span>
            {deposit.paystack_reference && (
              <p className="text-xs text-gray-500 mt-1">Ref: {deposit.paystack_reference}</p>
            )}
            {deposit.korapay_reference && (
              <p className="text-xs text-gray-500 mt-1">Ref: {deposit.korapay_reference}</p>
            )}
            {deposit.moolre_reference && (
              <p className="text-xs text-gray-500 mt-1">Ref: {deposit.moolre_reference}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-500">Date</p>
            <p className="text-sm text-gray-700">{new Date(deposit.created_at).toLocaleDateString()} {new Date(deposit.created_at).toLocaleTimeString()}</p>
          </div>
        </div>
        {deposit.status === 'pending' && (
          <div className="pt-3 border-t border-gray-200 space-y-2">
            {/* Payment proof button for manual deposits */}
            {isManual && deposit.payment_proof_url && (
              <Button
                onClick={() => setPaymentProofDialog({ open: true, imageUrl: deposit.payment_proof_url, deposit })}
                variant="outline"
                size="sm"
                className="w-full border-blue-500 text-blue-600 hover:bg-blue-50 min-h-[44px]"
              >
                <ImageIcon className="w-4 h-4 mr-2" />
                View Payment Proof
              </Button>
            )}
            
            {/* Verify buttons for specific payment methods */}
            {isPaystack && (
              <Button
                onClick={() => handleVerifyPaystackDeposit(deposit)}
                disabled={verifyingDeposit === deposit.id}
                variant="outline"
                size="sm"
                className="w-full border-blue-500 text-blue-600 hover:bg-blue-50 min-h-[44px]"
              >
                {verifyingDeposit === deposit.id ? 'Verifying...' : 'Verify with Paystack'}
              </Button>
            )}
            {isMoolre && (
              <Button
                onClick={() => handleVerifyMoolreDeposit(deposit)}
                disabled={verifyingDeposit === deposit.id}
                variant="outline"
                size="sm"
                className="w-full border-teal-500 text-teal-600 hover:bg-teal-50 min-h-[44px]"
              >
                {verifyingDeposit === deposit.id ? 'Verifying...' : 'Verify with Moolre'}
              </Button>
            )}
            {isMoolreWeb && (
              <Button
                onClick={() => handleVerifyMoolreWebDeposit(deposit)}
                disabled={verifyingDeposit === deposit.id}
                variant="outline"
                size="sm"
                className="w-full border-cyan-500 text-cyan-600 hover:bg-cyan-50 min-h-[44px]"
              >
                {verifyingDeposit === deposit.id ? 'Verifying...' : 'Verify with Moolre Web'}
              </Button>
            )}
            
            {/* Manual approve/reject buttons for all pending deposits */}
            <div className="flex gap-2">
              <Button
                onClick={() => handleApproveDeposit(deposit)}
                disabled={approvingDeposit === deposit.id || verifyingDeposit === deposit.id}
                variant="default"
                size="sm"
                className="flex-1 bg-green-600 hover:bg-green-700 text-white min-h-[44px]"
              >
                {approvingDeposit === deposit.id ? 'Approving...' : 'Approve'}
              </Button>
              <Button
                onClick={() => handleRejectDeposit(deposit.id)}
                disabled={approvingDeposit === deposit.id || verifyingDeposit === deposit.id}
                variant="destructive"
                size="sm"
                className="flex-1 min-h-[44px]"
              >
                Reject
              </Button>
            </div>
          </div>
        )}
        {isManual && deposit.payment_proof_url && deposit.status !== 'pending' && (
          <div className="pt-3 border-t border-gray-200">
            <Button
              onClick={() => setPaymentProofDialog({ open: true, imageUrl: deposit.payment_proof_url, deposit })}
              variant="outline"
              size="sm"
              className="w-full border-blue-500 text-blue-600 hover:bg-blue-50 min-h-[44px]"
            >
              <ImageIcon className="w-4 h-4 mr-2" />
              View Payment Proof
            </Button>
          </div>
        )}
      </div>
    );
  }, [handleApproveDeposit, handleRejectDeposit, handleApproveManualDeposit, handleVerifyPaystackDeposit, handleVerifyMoolreDeposit, handleVerifyMoolreWebDeposit, approvingDeposit, verifyingDeposit, formatPaymentMethod, getPaymentMethodColors]);

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

  const useVirtualScroll = filteredDeposits.length > VIRTUAL_SCROLL_THRESHOLD;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm w-full max-w-full overflow-hidden">
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
              placeholder="Search by username, email, phone, or transaction ID..."
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
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48 min-h-[44px]">
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
        </div>
      </div>

      {filteredDeposits.length === 0 ? (
        <p className="text-gray-600 text-center py-8">No deposits found</p>
      ) : (
        <>
          <ResponsiveTable
            items={paginatedDeposits}
            renderTableHeader={renderTableHeader}
            renderTableRow={renderTableRow}
            renderCard={renderMobileCard}
            useVirtualScroll={useVirtualScroll}
            emptyMessage="No deposits found"
            minTableWidth="1200px"
            itemHeight={100}
          />

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

      {/* Manual Reference Input Dialog */}
      <Dialog open={manualRefDialog.open} onOpenChange={(open) => {
        if (!open) {
          setManualRefDialog({ open: false, deposit: null, error: null, paymentMethod: null });
          setManualReference('');
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              Manual {(() => {
                const method = manualRefDialog.paymentMethod || 'paystack';
                if (method === 'moolre') return 'Moolre';
                if (method === 'moolre_web') return 'Moolre Web';
                return 'Paystack';
              })()} Reference Required
            </DialogTitle>
            <DialogDescription>
              The system couldn't automatically find the {(() => {
                const method = manualRefDialog.paymentMethod || 'paystack';
                if (method === 'moolre') return 'Moolre';
                if (method === 'moolre_web') return 'Moolre Web';
                return 'Paystack';
              })()} reference for this transaction.
              Please enter the {(() => {
                const method = manualRefDialog.paymentMethod || 'paystack';
                if (method === 'moolre') return 'Moolre';
                if (method === 'moolre_web') return 'Moolre Web';
                return 'Paystack';
              })()} reference manually to verify the deposit.
            </DialogDescription>
          </DialogHeader>
          
          {manualRefDialog.deposit && (
            <div className="space-y-4 py-4">
              <div className="bg-gray-50 p-3 rounded-md space-y-1 text-sm">
                <p><span className="font-medium">Transaction ID:</span> {manualRefDialog.deposit.id}</p>
                <p><span className="font-medium">Amount:</span> ₵{manualRefDialog.deposit.amount?.toFixed(2) || '0.00'}</p>
                <p><span className="font-medium">Date:</span> {new Date(manualRefDialog.deposit.created_at).toLocaleString()}</p>
              </div>

              <div className="space-y-2">
                <label htmlFor="manual-ref" className="text-sm font-medium">
                  {(() => {
                    const method = manualRefDialog.paymentMethod || 'paystack';
                    if (method === 'moolre') return 'Moolre ID';
                    if (method === 'moolre_web') return 'Moolre ID';
                    if (method === 'moolre_web') return 'Moolre Web Reference';
                    return 'Paystack Reference';
                  })()}
                </label>
                <Input
                  id="manual-ref"
                  placeholder={(() => {
                    const method = manualRefDialog.paymentMethod || 'paystack';
                    if (method === 'moolre' || method === 'moolre_web') return 'e.g., MOOLRE_WEB_abc123_1234567890';
                    return 'e.g., ref_abc123xyz';
                  })()}
                  value={manualReference}
                  onChange={(e) => setManualReference(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && manualReference.trim()) {
                      handleManualReferenceSubmit();
                    }
                  }}
                  className="h-12 text-base"
                  autoFocus
                />
                <p className="text-xs text-gray-500">
                  Enter the {(() => {
                    const method = manualRefDialog.paymentMethod || 'paystack';
                    if (method === 'moolre') return 'Moolre';
                    if (method === 'moolre_web') return 'Moolre Web';
                    return 'Paystack';
                  })()} transaction reference
                </p>
              </div>

              {manualRefDialog.suggestions && manualRefDialog.suggestions.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <p className="text-sm font-medium text-blue-900 mb-2">Suggestions:</p>
                  <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
                    {manualRefDialog.suggestions.map((suggestion, idx) => (
                      <li key={idx}>{suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setManualRefDialog({ open: false, deposit: null, error: null, paymentMethod: null });
                setManualReference('');
              }}
              disabled={verifyingDeposit === manualRefDialog.deposit?.id}
            >
              Cancel
            </Button>
            <Button
              onClick={handleManualReferenceSubmit}
              disabled={!manualReference.trim() || verifyingDeposit === manualRefDialog.deposit?.id}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {verifyingDeposit === manualRefDialog.deposit?.id ? 'Verifying...' : 'Verify with Reference'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Proof Image Dialog */}
      <Dialog open={paymentProofDialog.open} onOpenChange={(open) => {
        if (!open) {
          setPaymentProofDialog({ open: false, imageUrl: null, deposit: null });
        }
      }}>
        <DialogContent className="sm:max-w-[90vw] max-w-[95vw] p-0">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-blue-600" />
              Payment Proof Screenshot
            </DialogTitle>
          </DialogHeader>
          <div className="px-6 pb-6 space-y-4">
            {/* Show current manual deposit details if this is a manual deposit */}
            {paymentProofDialog.deposit && (paymentProofDialog.deposit.deposit_method === 'manual' || paymentProofDialog.deposit.deposit_method === 'momo') && manualDepositDetails && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-2 mb-2">
                  <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-blue-900 mb-2">Current Manual Deposit Details:</p>
                    <div className="space-y-1 text-sm text-blue-800">
                      <p><span className="font-medium">Phone Number:</span> {manualDepositDetails.phone_number}</p>
                      <p><span className="font-medium">Account Name:</span> {manualDepositDetails.account_name}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {paymentProofDialog.imageUrl ? (
              <div className="relative w-full flex items-center justify-center bg-gray-100 rounded-lg overflow-hidden">
                <img
                  src={paymentProofDialog.imageUrl}
                  alt="Payment proof"
                  className="max-w-full max-h-[70vh] object-contain"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
                <div className="hidden items-center justify-center p-8 text-gray-500">
                  <div className="text-center">
                    <ImageIcon className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                    <p>Failed to load image</p>
                    <a
                      href={paymentProofDialog.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline mt-2 inline-block"
                    >
                      Open in new tab
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center p-8 text-gray-500">
                <p>No payment proof available</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});

AdminDeposits.displayName = 'AdminDeposits';

export default AdminDeposits;


