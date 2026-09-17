import React, { memo, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAdminDeposits, useApproveDeposit, useRejectDeposit, useBanUser } from '@/hooks/useAdminDeposits';
import { useDebounce } from '@/hooks/useDebounce';
import ResponsiveTable from '@/components/admin/ResponsiveTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Search, RefreshCw, CheckCircle, XCircle, AlertCircle, Image as ImageIcon, 
  ShieldAlert, Download, TrendingUp, ExternalLink,
  Filter, ArrowUpDown, ChevronLeft, ChevronRight, Phone, Copy, UserX
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

const ITEMS_PER_PAGE = 50;
const PRESET_AMOUNTS = [200, 500, 1000, 2000, 5000];

const AdminHighDeposits = memo(({ onRefresh, refreshing = false }) => {
  const queryClient = useQueryClient();
  const [minAmount, setMinAmount] = useState(200);
  const [customMinInput, setCustomMinInput] = useState('200');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  // Dialog states
  const [approvingDeposit, setApprovingDeposit] = useState(null);
  const [verifyingDeposit, setVerifyingDeposit] = useState(null);
  const [manualRefDialog, setManualRefDialog] = useState({ open: false, deposit: null, error: null, paymentMethod: null });
  const [paymentProofDialog, setPaymentProofDialog] = useState({ open: false, imageUrl: null, deposit: null });
  const [banUserDialog, setBanUserDialog] = useState({ open: false, deposit: null, reason: 'High deposit investigation', rejectPending: true, isBanning: false });

  const debouncedSearch = useDebounce(searchTerm, 300);

  // Sync debounced threshold input
  const handleThresholdApply = useCallback((val) => {
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      setMinAmount(num);
      setCustomMinInput(String(num));
      setPage(1);
    } else {
      toast.error('Please enter a valid amount');
      setCustomMinInput(String(minAmount));
    }
  }, [minAmount]);

  // Query deposits with threshold
  const {
    data,
    isLoading,
    refetch
  } = useAdminDeposits({
    enabled: true,
    page: page,
    limit: ITEMS_PER_PAGE,
    search: debouncedSearch,
    status: statusFilter,
    date: dateFilter,
    minAmount: minAmount
  });

  const approveDepositMutation = useApproveDeposit();
  const rejectDepositMutation = useRejectDeposit();
  const banUserMutation = useBanUser();

  const allDeposits = useMemo(() => {
    return data?.data || [];
  }, [data]);

  const totalCount = useMemo(() => {
    return data?.total || 0;
  }, [data]);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE) || 1;

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, dateFilter, minAmount]);

  // Actions: Approve deposit
  const handleApproveDeposit = useCallback(async (deposit) => {
    setApprovingDeposit(deposit.id);

    queryClient.setQueryData(['admin', 'deposits'], (oldData) => {
      if (!oldData?.pages) return oldData;
      return {
        ...oldData,
        pages: oldData.pages.map(p => ({
          ...p,
          data: p.data?.map(tx => tx.id === deposit.id ? { ...tx, status: 'approved' } : tx) || []
        }))
      };
    });

    try {
      await approveDepositMutation.mutateAsync({
        transactionId: deposit.id,
        userId: deposit.user_id,
        amount: deposit.amount,
        paymentMethod: deposit.deposit_method || deposit.payment_method || 'manual'
      });
      toast.success(`Deposit of ₵${Number(deposit.amount).toFixed(2)} approved successfully`);
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to approve deposit:', error);
      toast.error(error.message || 'Failed to approve deposit');
      queryClient.invalidateQueries({ queryKey: ['admin', 'deposits'] });
    } finally {
      setApprovingDeposit(null);
    }
  }, [approveDepositMutation, onRefresh, queryClient]);

  // Actions: Reject deposit
  const handleRejectDeposit = useCallback(async (depositId) => {
    if (!window.confirm('Are you sure you want to reject this high-value deposit?')) return;

    queryClient.setQueryData(['admin', 'deposits'], (oldData) => {
      if (!oldData?.pages) return oldData;
      return {
        ...oldData,
        pages: oldData.pages.map(p => ({
          ...p,
          data: p.data?.map(tx => tx.id === depositId ? { ...tx, status: 'rejected' } : tx) || []
        }))
      };
    });

    try {
      await rejectDepositMutation.mutateAsync(depositId);
      toast.success('Deposit rejected');
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to reject deposit:', error);
      queryClient.invalidateQueries({ queryKey: ['admin', 'deposits'] });
    }
  }, [rejectDepositMutation, onRefresh, queryClient]);

  // Actions: Verify Paystack
  const handleVerifyPaystack = useCallback(async (deposit) => {
    setVerifyingDeposit(deposit.id);
    try {
      const response = await fetch('/api/manual-verify-paystack-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: deposit.id })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'Failed to verify Paystack deposit');
      }

      if (resData.updateResult?.newStatus === 'approved') {
        toast.success('Deposit verified and approved successfully');
      } else {
        toast.info(`Paystack status: ${resData.paystackStatus || 'Updated'}`);
      }

      queryClient.invalidateQueries({ queryKey: ['admin', 'deposits'] });
      refetch();
    } catch (error) {
      console.error('Verify Paystack error:', error);
      toast.error(error.message || 'Verification failed');
    } finally {
      setVerifyingDeposit(null);
    }
  }, [queryClient, refetch]);

  // Actions: Verify Moolre
  const handleVerifyMoolre = useCallback(async (deposit) => {
    setVerifyingDeposit(deposit.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('No session available');

      const response = await fetch('/api/manual-verify-moolre-deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ transactionId: deposit.id })
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || 'Verification failed');

      if (resData.updateResult?.newStatus === 'approved') {
        toast.success('Deposit verified and approved');
      } else {
        toast.info(`Moolre status: ${resData.moolreStatus || 'Updated'}`);
      }

      queryClient.invalidateQueries({ queryKey: ['admin', 'deposits'] });
      refetch();
    } catch (error) {
      console.error('Verify Moolre error:', error);
      toast.error(error.message || 'Moolre verification failed');
    } finally {
      setVerifyingDeposit(null);
    }
  }, [queryClient, refetch]);

  // Actions: Ban User
  const handleConfirmBanUser = useCallback(async () => {
    if (!banUserDialog.deposit?.user_id) return;
    setBanUserDialog(prev => ({ ...prev, isBanning: true }));
    try {
      await banUserMutation.mutateAsync({
        userId: banUserDialog.deposit.user_id,
        reason: banUserDialog.reason,
        rejectPending: banUserDialog.rejectPending,
        depositId: banUserDialog.deposit.id
      });
      toast.success('User banned and pending deposits handled');
      setBanUserDialog({ open: false, deposit: null, reason: 'High deposit investigation', rejectPending: true, isBanning: false });
      refetch();
    } catch (error) {
      console.error('Ban user error:', error);
      toast.error(error.message || 'Failed to ban user');
      setBanUserDialog(prev => ({ ...prev, isBanning: false }));
    }
  }, [banUserDialog, banUserMutation, refetch]);

  // Export CSV
  const handleExportCSV = useCallback(async () => {
    try {
      setIsExporting(true);
      toast.info('Generating high-value deposits export...');

      let query = supabase
        .from('transactions')
        .select('id, user_id, amount, status, deposit_method, payment_method, paystack_reference, manual_reference, korapay_reference, moolre_reference, created_at, profiles!transactions_user_id_fkey(name, email, phone_number)')
        .eq('type', 'deposit')
        .gt('amount', minAmount)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data: exportData, error } = await query;
      if (error) throw error;

      if (!exportData || exportData.length === 0) {
        toast.warning('No deposits found matching export criteria');
        return;
      }

      const headers = ['Transaction ID', 'User Name', 'User Email', 'User Phone', 'Amount (GHS)', 'Status', 'Payment Method', 'Reference', 'Date'];
      const rows = exportData.map(tx => {
        const method = tx.deposit_method || tx.payment_method || 'manual';
        const ref = tx.paystack_reference || tx.manual_reference || tx.korapay_reference || tx.moolre_reference || '';
        return [
          `"${tx.id}"`,
          `"${(tx.profiles?.name || 'Unknown').replace(/"/g, '""')}"`,
          `"${(tx.profiles?.email || '').replace(/"/g, '""')}"`,
          `"${(tx.profiles?.phone_number || '').replace(/"/g, '""')}"`,
          Number(tx.amount || 0).toFixed(2),
          tx.status,
          method,
          `"${ref.replace(/"/g, '""')}"`,
          `"${new Date(tx.created_at).toISOString()}"`
        ].join(',');
      });

      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `high_deposits_gt_${minAmount}ghs_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(`Exported ${exportData.length} high-value deposit records`);
    } catch (err) {
      console.error('CSV export failed:', err);
      toast.error('Failed to export CSV: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  }, [minAmount, statusFilter]);

  // Helpers for format
  const formatPaymentMethod = useCallback((method) => {
    if (!method) return 'Unknown';
    const methodMap = {
      'paystack': 'Paystack',
      'manual': 'Manual MoMo',
      'momo': 'Mobile Money',
      'hubtel': 'Hubtel/MoMo',
      'korapay': 'Korapay',
      'moolre': 'Moolre',
      'moolre_web': 'Moolre Web'
    };
    return methodMap[method.toLowerCase()] || method.toUpperCase();
  }, []);

  const getMethodBadgeClass = useCallback((method) => {
    const m = (method || '').toLowerCase();
    switch (m) {
      case 'paystack':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'hubtel':
      case 'momo':
      case 'manual':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'korapay':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'moolre':
      case 'moolre_web':
        return 'bg-teal-100 text-teal-800 border-teal-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  }, []);

  // Table header renderer
  const renderTableHeader = useCallback(() => (
    <div className="grid grid-cols-12 gap-4 p-4 font-semibold text-xs uppercase tracking-wider text-gray-500 bg-gray-50 border-b border-gray-200 min-w-[1100px]">
      <div className="col-span-3">User & Contact</div>
      <div className="col-span-2">Amount (GHS)</div>
      <div className="col-span-2">Status & Method</div>
      <div className="col-span-2">References & Date</div>
      <div className="col-span-3 text-right">Actions</div>
    </div>
  ), []);

  // Table row renderer
  const renderTableRow = useCallback((deposit) => {
    const depositMethod = deposit.deposit_method || deposit.payment_method || 'manual';
    const isPaystack = depositMethod === 'paystack';
    const isMoolre = depositMethod === 'moolre' || depositMethod === 'moolre_web';
    const isManual = depositMethod === 'manual' || depositMethod === 'momo';
    const amount = Number(deposit.amount || 0);

    return (
      <div
        key={deposit.id}
        className="grid grid-cols-12 gap-4 p-4 items-center bg-white hover:bg-amber-50/40 transition-colors border-b border-gray-200 min-w-[1100px]"
      >
        {/* User column */}
        <div className="col-span-3 flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
            {(deposit.profiles?.name || 'U').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-gray-900 text-sm truncate">
                {deposit.profiles?.name || 'Unknown User'}
              </span>
              {deposit.is_user_banned ? (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                  <ShieldAlert className="w-3 h-3 text-red-600" /> BANNED
                </span>
              ) : (
                <button
                  onClick={() => setBanUserDialog({ open: true, deposit, reason: 'High deposit exploit investigation', rejectPending: true, isBanning: false })}
                  title="Ban User"
                  className="text-red-400 hover:text-red-600 p-0.5 rounded transition-colors"
                >
                  <ShieldAlert className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-xs text-gray-600 truncate">{deposit.profiles?.email || deposit.user_id}</p>
            {deposit.profiles?.phone_number && (
              <a
                href={`tel:${deposit.profiles.phone_number}`}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-600 font-mono mt-0.5"
              >
                <Phone className="w-3 h-3 text-gray-400" />
                <span>{deposit.profiles.phone_number}</span>
              </a>
            )}
          </div>
        </div>

        {/* Amount column */}
        <div className="col-span-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
            <TrendingUp className="w-4 h-4 text-amber-600" />
            <span className="font-bold text-base text-gray-900">
              ₵{amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Status & Method */}
        <div className="col-span-2 space-y-1.5">
          <div>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              deposit.status === 'approved' ? 'bg-green-100 text-green-800' :
              deposit.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              {deposit.status}
            </span>
          </div>
          <div>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${getMethodBadgeClass(depositMethod)}`}>
              {formatPaymentMethod(depositMethod)}
            </span>
          </div>
        </div>

        {/* References & Date */}
        <div className="col-span-2 text-xs text-gray-600 space-y-0.5">
          <p className="font-medium text-gray-900">{new Date(deposit.created_at).toLocaleDateString()}</p>
          <p className="text-gray-400">{new Date(deposit.created_at).toLocaleTimeString()}</p>
          {(deposit.paystack_reference || deposit.manual_reference || deposit.korapay_reference || deposit.moolre_reference) && (
            <p className="font-mono text-[11px] text-gray-500 truncate" title={deposit.paystack_reference || deposit.manual_reference || deposit.korapay_reference || deposit.moolre_reference}>
              Ref: {deposit.paystack_reference || deposit.manual_reference || deposit.korapay_reference || deposit.moolre_reference}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="col-span-3 flex items-center justify-end gap-2">
          {deposit.status === 'pending' ? (
            <>
              {isManual && deposit.payment_proof_url && (
                <Button
                  onClick={() => setPaymentProofDialog({ open: true, imageUrl: deposit.payment_proof_url, deposit })}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs border-blue-400 text-blue-600 hover:bg-blue-50"
                >
                  <ImageIcon className="w-3.5 h-3.5 mr-1" />
                  Proof
                </Button>
              )}

              {isPaystack && (
                <Button
                  onClick={() => handleVerifyPaystack(deposit)}
                  disabled={verifyingDeposit === deposit.id}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs border-purple-400 text-purple-600 hover:bg-purple-50"
                >
                  {verifyingDeposit === deposit.id ? 'Checking...' : 'Verify'}
                </Button>
              )}

              {isMoolre && (
                <Button
                  onClick={() => handleVerifyMoolre(deposit)}
                  disabled={verifyingDeposit === deposit.id}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs border-teal-400 text-teal-600 hover:bg-teal-50"
                >
                  {verifyingDeposit === deposit.id ? 'Checking...' : 'Verify'}
                </Button>
              )}

              <Button
                onClick={() => handleApproveDeposit(deposit)}
                disabled={approvingDeposit === deposit.id}
                size="sm"
                className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
              >
                {approvingDeposit === deposit.id ? 'Approving...' : 'Approve'}
              </Button>

              <Button
                onClick={() => handleRejectDeposit(deposit.id)}
                disabled={approvingDeposit === deposit.id}
                variant="destructive"
                size="sm"
                className="h-8 text-xs"
              >
                Reject
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              {isManual && deposit.payment_proof_url && (
                <Button
                  onClick={() => setPaymentProofDialog({ open: true, imageUrl: deposit.payment_proof_url, deposit })}
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-blue-600 hover:bg-blue-50"
                >
                  <ImageIcon className="w-3.5 h-3.5 mr-1" />
                  Proof
                </Button>
              )}
              {deposit.status === 'approved' ? (
                <span className="text-xs text-green-700 bg-green-50 px-2.5 py-1 rounded border border-green-200 flex items-center gap-1 font-medium">
                  <CheckCircle className="w-3.5 h-3.5" /> Approved
                </span>
              ) : (
                <span className="text-xs text-red-700 bg-red-50 px-2.5 py-1 rounded border border-red-200 flex items-center gap-1 font-medium">
                  <XCircle className="w-3.5 h-3.5" /> Rejected
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }, [approvingDeposit, verifyingDeposit, formatPaymentMethod, getMethodBadgeClass, handleApproveDeposit, handleRejectDeposit, handleVerifyPaystack, handleVerifyMoolre]);

  // Mobile card renderer
  const renderMobileCard = useCallback((deposit) => {
    const depositMethod = deposit.deposit_method || deposit.payment_method || 'manual';
    const isPaystack = depositMethod === 'paystack';
    const isMoolre = depositMethod === 'moolre' || depositMethod === 'moolre_web';
    const isManual = depositMethod === 'manual' || depositMethod === 'momo';
    const amount = Number(deposit.amount || 0);
    const reference = deposit.paystack_reference || deposit.manual_reference || deposit.korapay_reference || deposit.moolre_reference || '';

    return (
      <div key={deposit.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3.5 my-2">
        {/* Top: User Avatar, Name, Ban Status & Amount */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm mt-0.5">
              {(deposit.profiles?.name || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="font-bold text-gray-900 text-sm truncate">
                  {deposit.profiles?.name || 'Unknown User'}
                </p>
                {deposit.is_user_banned ? (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                    <ShieldAlert className="w-3 h-3 text-red-600" /> BANNED
                  </span>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Active
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 truncate mt-0.5">{deposit.profiles?.email || deposit.user_id}</p>
              
              {/* User Phone Number on Mobile */}
              {deposit.profiles?.phone_number ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <a
                    href={`tel:${deposit.profiles.phone_number}`}
                    className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-mono font-medium bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100"
                  >
                    <Phone className="w-3 h-3 text-indigo-500" />
                    <span>{deposit.profiles.phone_number}</span>
                  </a>
                </div>
              ) : (
                <p className="text-[11px] text-gray-400 mt-0.5">No phone number</p>
              )}
            </div>
          </div>

          {/* Amount and Status Badge */}
          <div className="text-right shrink-0">
            <p className="font-extrabold text-gray-900 text-base">₵{amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <span className={`inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full font-semibold ${
              deposit.status === 'approved' ? 'bg-green-100 text-green-800' :
              deposit.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              {deposit.status}
            </span>
          </div>
        </div>

        {/* Payment Method, Date, and Reference Details */}
        <div className="bg-gray-50/80 rounded-lg p-2.5 space-y-1.5 text-xs text-gray-600 border border-gray-100">
          <div className="flex items-center justify-between">
            <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${getMethodBadgeClass(depositMethod)}`}>
              {formatPaymentMethod(depositMethod)}
            </span>
            <span className="text-gray-500 text-[11px]">
              {new Date(deposit.created_at).toLocaleDateString()} {new Date(deposit.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          {reference && (
            <div className="flex items-center justify-between text-[11px] font-mono text-gray-500 pt-1 border-t border-gray-200/60">
              <span className="truncate max-w-[220px]">Ref: {reference}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(reference);
                  toast.success('Reference copied');
                }}
                className="text-gray-400 hover:text-gray-600 p-0.5"
                title="Copy Reference"
              >
                <Copy className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Mobile Action Buttons */}
        <div className="pt-1 flex flex-wrap items-center gap-2">
          {/* Ban User Button for Mobile */}
          {!deposit.is_user_banned ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBanUserDialog({
                open: true,
                deposit,
                reason: 'High deposit exploit investigation',
                rejectPending: true,
                isBanning: false
              })}
              className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 px-2.5 flex items-center gap-1"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
              Ban User
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-red-600 bg-red-50 px-2.5 py-1 rounded border border-red-200 font-semibold">
              <ShieldAlert className="w-3.5 h-3.5" /> Account Banned
            </span>
          )}

          {/* Proof Button for Mobile */}
          {isManual && deposit.payment_proof_url && (
            <Button
              onClick={() => setPaymentProofDialog({ open: true, imageUrl: deposit.payment_proof_url, deposit })}
              variant="outline"
              size="sm"
              className="h-8 text-xs text-blue-600 border-blue-300 hover:bg-blue-50 px-2.5"
            >
              <ImageIcon className="w-3.5 h-3.5 mr-1" />
              Proof
            </Button>
          )}

          {/* Gateway Verify & Approve/Reject */}
          {deposit.status === 'pending' && (
            <>
              {isPaystack && (
                <Button
                  onClick={() => handleVerifyPaystack(deposit)}
                  disabled={verifyingDeposit === deposit.id}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs text-purple-600 border-purple-300 hover:bg-purple-50 px-2.5"
                >
                  {verifyingDeposit === deposit.id ? 'Checking...' : 'Verify'}
                </Button>
              )}

              {isMoolre && (
                <Button
                  onClick={() => handleVerifyMoolre(deposit)}
                  disabled={verifyingDeposit === deposit.id}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs text-teal-600 border-teal-300 hover:bg-teal-50 px-2.5"
                >
                  {verifyingDeposit === deposit.id ? 'Checking...' : 'Verify'}
                </Button>
              )}

              <div className="flex items-center gap-2 flex-1 min-w-[140px]">
                <Button
                  onClick={() => handleApproveDeposit(deposit)}
                  disabled={approvingDeposit === deposit.id}
                  size="sm"
                  className="flex-1 h-8 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold"
                >
                  {approvingDeposit === deposit.id ? 'Approving...' : 'Approve'}
                </Button>
                <Button
                  onClick={() => handleRejectDeposit(deposit.id)}
                  disabled={approvingDeposit === deposit.id}
                  variant="destructive"
                  size="sm"
                  className="flex-1 h-8 text-xs font-semibold"
                >
                  Reject
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }, [approvingDeposit, verifyingDeposit, formatPaymentMethod, getMethodBadgeClass, handleApproveDeposit, handleRejectDeposit, handleVerifyPaystack, handleVerifyMoolre]);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500 text-white rounded-lg shadow-sm">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">High-Value Deposits</h1>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <Button
              onClick={handleExportCSV}
              disabled={isExporting || totalCount === 0}
              variant="outline"
              size="sm"
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <Download className="w-4 h-4 mr-2 text-gray-500" />
              {isExporting ? 'Exporting...' : 'Export CSV'}
            </Button>
            <Button
              onClick={() => {
                refetch();
                if (onRefresh) onRefresh();
              }}
              disabled={refreshing || isLoading}
              variant="outline"
              size="sm"
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing || isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Threshold & Filters Toolbar */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
        {/* Row 1: Threshold presets + custom amount */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider mr-1">
              Minimum Threshold:
            </span>
            {PRESET_AMOUNTS.map((amt) => (
              <button
                key={amt}
                onClick={() => {
                  setMinAmount(amt);
                  setCustomMinInput(String(amt));
                }}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  minAmount === amt
                    ? 'bg-amber-500 text-white shadow-sm ring-2 ring-amber-200'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                &gt; ₵{amt}
              </button>
            ))}
          </div>

          {/* Custom Input */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Custom min:</span>
            <div className="relative w-28">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-semibold">₵</span>
              <Input
                type="number"
                min="1"
                step="10"
                value={customMinInput}
                onChange={(e) => setCustomMinInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleThresholdApply(customMinInput);
                }}
                className="pl-6 h-8 text-xs font-medium"
              />
            </div>
            <Button
              onClick={() => handleThresholdApply(customMinInput)}
              size="sm"
              variant="secondary"
              className="h-8 text-xs"
            >
              Apply
            </Button>
          </div>
        </div>

        {/* Row 2: Search, Status, Date Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search by name, email, phone, reference..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>

          {/* Status filter */}
          <div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending Approval</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Date filter */}
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="h-9 text-sm"
            />
            {(searchTerm || statusFilter !== 'all' || dateFilter || minAmount !== 200) && (
              <Button
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                  setDateFilter('');
                  setMinAmount(200);
                  setCustomMinInput('200');
                }}
                variant="ghost"
                size="sm"
                className="h-9 text-xs text-gray-500 hover:text-gray-900"
              >
                Reset
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Results Count & Pagination Summary */}
      <div className="flex items-center justify-between text-xs text-gray-500 px-1">
        <span>
          Showing {allDeposits.length} of {totalCount} high deposits (&gt; ₵{minAmount})
        </span>
        {totalPages > 1 && (
          <span>
            Page {page} of {totalPages}
          </span>
        )}
      </div>

      {/* Data Table */}
      <ResponsiveTable
        items={allDeposits}
        isLoading={isLoading}
        renderTableHeader={renderTableHeader}
        renderTableRow={renderTableRow}
        renderCard={renderMobileCard}
        emptyMessage={`No deposits found higher than ₵${minAmount} GHS.`}
        minTableWidth="1100px"
      />

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white px-4 py-3 border border-gray-200 rounded-xl shadow-sm">
          <Button
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page === 1 || isLoading}
            variant="outline"
            size="sm"
            className="text-xs"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <span>Page</span>
            <span className="font-semibold text-gray-900">{page}</span>
            <span>of</span>
            <span className="font-semibold text-gray-900">{totalPages}</span>
          </div>
          <Button
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={page >= totalPages || isLoading}
            variant="outline"
            size="sm"
            className="text-xs"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}

      {/* Payment Proof Modal */}
      <Dialog open={paymentProofDialog.open} onOpenChange={(open) => setPaymentProofDialog({ open, imageUrl: null, deposit: null })}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Payment Proof</DialogTitle>
            <DialogDescription>
              Proof of payment uploaded by {paymentProofDialog.deposit?.profiles?.name || 'User'} for ₵{paymentProofDialog.deposit?.amount}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-center bg-gray-50 rounded-lg p-2 max-h-[70vh] overflow-auto">
            {paymentProofDialog.imageUrl ? (
              <img
                src={paymentProofDialog.imageUrl}
                alt="Payment Proof"
                className="max-h-[60vh] object-contain rounded shadow"
              />
            ) : (
              <p className="text-gray-400 py-8">No proof image available</p>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setPaymentProofDialog({ open: false, imageUrl: null, deposit: null })}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ban User Dialog */}
      <Dialog open={banUserDialog.open} onOpenChange={(open) => !banUserDialog.isBanning && setBanUserDialog(prev => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <ShieldAlert className="w-5 h-5" />
              Ban User & Reject Pending Deposits
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to ban {banUserDialog.deposit?.profiles?.name || 'this user'} ({banUserDialog.deposit?.profiles?.email})?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-gray-700">Reason for Ban</label>
              <Input
                value={banUserDialog.reason}
                onChange={(e) => setBanUserDialog(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="Enter ban reason..."
                className="mt-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="rejectPendingCheckbox"
                checked={banUserDialog.rejectPending}
                onChange={(e) => setBanUserDialog(prev => ({ ...prev, rejectPending: e.target.checked }))}
                className="rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              <label htmlFor="rejectPendingCheckbox" className="text-sm text-gray-700">
                Reject all pending deposits for this user
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={banUserDialog.isBanning}
              onClick={() => setBanUserDialog(prev => ({ ...prev, open: false }))}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={banUserDialog.isBanning}
              onClick={handleConfirmBanUser}
            >
              {banUserDialog.isBanning ? 'Banning...' : 'Confirm Ban'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

AdminHighDeposits.displayName = 'AdminHighDeposits';
export default AdminHighDeposits;
