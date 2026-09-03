import React, { memo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/useDebounce';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Search, RefreshCw, User, Mail, Phone, Clock, CreditCard, ShoppingCart, 
  Receipt, MessageSquare, ShieldAlert, Shield, CheckCircle2, AlertCircle, 
  ExternalLink, Edit3, X, Download, ArrowUpRight, ArrowDownLeft, DollarSign, Calendar
} from 'lucide-react';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';

// Execute User Transactions Search Server Action
const executeUserTransactionsSearchAction = async ({ searchTerm, selectedUserId }) => {
  const startTime = performance.now();

  try {
    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes.data.session?.access_token;

    if (token) {
      const response = await fetch('/api/admin/user-transactions-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ searchTerm, selectedUserId })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          return {
            multipleMatches: result.multipleMatches || false,
            candidates: result.candidates || [],
            user: result.user || null,
            summary: result.summary || null,
            transactions: result.transactions || [],
            orders: result.orders || [],
            tickets: result.tickets || [],
            timeline: result.timeline || [],
            searchTimeMs: result.searchTimeMs || Math.round(performance.now() - startTime)
          };
        }
      }
    }
  } catch (err) {
    console.warn('Server Action user transactions search warning:', err);
  }

  return {
    multipleMatches: false,
    candidates: [],
    user: null,
    summary: null,
    transactions: [],
    orders: [],
    tickets: [],
    timeline: [],
    searchTimeMs: Math.round(performance.now() - startTime)
  };
};

const AdminUserTransactionsSearch = memo(() => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [activeTab, setActiveTab] = useState('timeline'); // timeline | transactions | orders | tickets

  // Balance Adjustment Modal state
  const [balanceModalUser, setBalanceModalUser] = useState(null);
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceReason, setBalanceReason] = useState('');
  const [balanceAction, setBalanceAction] = useState('add');
  const [balanceSubmitting, setBalanceSubmitting] = useState(false);

  const debouncedSearch = useDebounce(searchTerm, 200);
  const { data: userRole } = useUserRole();
  const isAdmin = userRole?.isAdmin ?? false;

  const {
    data: searchData = { multipleMatches: false, candidates: [], user: null, summary: null, transactions: [], orders: [], tickets: [], timeline: [], searchTimeMs: 0 },
    isLoading,
    isFetching,
    refetch
  } = useQuery({
    queryKey: ['admin', 'user-transactions-search', { searchTerm: debouncedSearch, selectedUserId }],
    queryFn: () => executeUserTransactionsSearchAction({ searchTerm: debouncedSearch, selectedUserId }),
    enabled: isAdmin && (!!debouncedSearch.trim() || !!selectedUserId),
    staleTime: 15 * 1000,
    gcTime: 5 * 60 * 1000,
    placeholderData: (previousData) => previousData
  });

  const handleSelectCandidate = (candidate) => {
    setSelectedUserId(candidate.id);
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setSelectedUserId('');
  };

  // Submit Balance Adjustment
  const handleBalanceSubmit = async (e) => {
    e.preventDefault();
    if (!balanceAmount || isNaN(balanceAmount) || Number(balanceAmount) <= 0) {
      toast.error('Please enter a valid amount greater than 0');
      return;
    }

    setBalanceSubmitting(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;

      const res = await fetch('/api/admin/update-user-balance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: balanceModalUser.id,
          action: balanceAction,
          amount: parseFloat(balanceAmount),
          reason: balanceReason.trim() || 'Admin User Transactions Search Balance Update'
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to update balance');
      }

      toast.success(data.message || 'Balance updated successfully');
      setBalanceModalUser(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['admin', 'user-transactions-search'] });
    } catch (err) {
      console.error('Balance update submit error:', err);
      toast.error(err.message || 'Failed to update user balance');
    } finally {
      setBalanceSubmitting(false);
    }
  };

  // Download User Timeline Export
  const handleExportTimeline = () => {
    if (!searchData.user) return;
    const exportObject = {
      user: searchData.user,
      summary: searchData.summary,
      timeline: searchData.timeline,
      transactions: searchData.transactions,
      orders: searchData.orders,
      exportedAt: new Date().toISOString()
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportObject, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `user_transactions_${searchData.user.email || searchData.user.id}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast.success('Downloaded user transaction timeline JSON');
  };

  const { user, summary, timeline = [], transactions = [], orders = [], tickets = [], searchTimeMs = 0 } = searchData;

  return (
    <div className="space-y-4 sm:space-y-6 pb-12">
      {/* Header Search Box Card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-2 text-gray-900 font-bold text-base sm:text-lg">
            <Clock className="w-5 h-5 text-indigo-600 shrink-0" />
            <span>Timeline</span>
          </div>

          {user && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportTimeline}
              className="h-9 text-xs font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50 flex items-center justify-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>Export Timeline JSON</span>
            </Button>
          )}
        </div>

        {/* Search Input */}
        <div className="relative flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              type="text"
              placeholder="Search user transactions by Email, User Name, Phone, UUID, Deposit Ref, or Order ID..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setSelectedUserId('');
              }}
              className="pl-12 pr-10 h-12 text-sm sm:text-base border-gray-200 focus:border-indigo-500 rounded-xl"
            />
            {(searchTerm || selectedUserId) && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching || (!searchTerm.trim() && !selectedUserId)}
            className="h-12 px-5 text-xs font-semibold border-gray-200 hover:bg-gray-50 flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Performance Meter */}
      {(debouncedSearch || selectedUserId) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-indigo-50/80 border border-indigo-100 rounded-xl p-3 sm:px-4 sm:py-2.5 text-xs text-indigo-900 font-medium gap-2">
          <div className="flex items-center gap-2 truncate">
            <Receipt className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="truncate">
              {user 
                ? `Loaded complete transaction timeline for "${user.name || user.email}" (${timeline.length} actions)`
                : `Searching user transactions for "${debouncedSearch}"...`}
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[11px] bg-white px-2.5 py-1 rounded-md border border-indigo-200 shrink-0">
            <Clock className="w-3 h-3 text-indigo-500" />
            <span>Server Action: <strong>{searchTimeMs}ms</strong></span>
          </div>
        </div>
      )}

      {/* Candidate Selector Grid (Multiple Profiles Match) */}
      {searchData.multipleMatches && searchData.candidates?.length > 0 && (
        <div className="bg-white border border-amber-200 rounded-2xl p-4 sm:p-6 shadow-sm space-y-3">
          <h4 className="font-bold text-amber-900 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <span>Multiple Users Match Query - Select a Profile:</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {searchData.candidates.map((cand) => (
              <button
                key={cand.id}
                onClick={() => handleSelectCandidate(cand)}
                className={`p-3 rounded-xl border text-left transition-all space-y-1 ${
                  selectedUserId === cand.id 
                    ? 'bg-indigo-50 border-indigo-500 shadow-xs ring-2 ring-indigo-200' 
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <div className="font-bold text-gray-900 text-sm truncate">{cand.name || 'No Name'}</div>
                <div className="text-xs text-gray-500 truncate">{cand.email}</div>
                <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1 border-t border-gray-200">
                  <span>Balance: ₵{Number(cand.balance || 0).toFixed(2)}</span>
                  <span className="uppercase font-semibold text-indigo-600">{cand.role || 'user'}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Content View */}
      {isLoading ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 space-y-4 shadow-sm">
          <div className="flex items-center gap-3 text-indigo-600 font-semibold text-sm">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Fetching user account transactions history server-side...</span>
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse"></div>
            ))}
          </div>
        </div>
      ) : !user ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 sm:p-12 text-center shadow-sm">
          <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Receipt className="w-7 h-7" />
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-1">
            {debouncedSearch ? 'No Transactions Found for Query' : 'Search User Transactions'}
          </h3>
          <p className="text-gray-500 text-xs sm:text-sm max-w-md mx-auto">
            {debouncedSearch 
              ? `No user profiles or transaction records matched "${debouncedSearch}".`
              : 'Enter a user\'s email, name, phone, UUID, or transaction reference to view their complete financial history since account creation.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {/* User Overview Profile Card */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold flex items-center justify-center text-lg shadow-sm shrink-0">
                  {user.name ? user.name.charAt(0).toUpperCase() : (user.email ? user.email.charAt(0).toUpperCase() : 'U')}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-extrabold text-gray-900 text-base sm:text-lg truncate">{user.name || 'No Name'}</h3>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase ${
                      user.role === 'admin' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                      user.role === 'reseller' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                      'bg-gray-100 text-gray-700 border border-gray-200'
                    }`}>
                      {user.role || 'USER'}
                    </span>
                    {user.isBanned && (
                      <span className="bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" /> BANNED
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-gray-500 mt-1">
                    <span className="flex items-center gap-1 truncate">
                      <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" /> {user.email}
                    </span>
                    {user.phone_number && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" /> {user.phone_number}
                      </span>
                    )}
                    <span className="flex items-center gap-1 font-mono text-[11px] text-gray-400">
                      <Calendar className="w-3 h-3 text-gray-400 shrink-0" /> Joined: {new Date(user.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Wallet Balance Badge */}
              <div className="flex items-center justify-between sm:justify-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3 sm:px-4 sm:py-2.5 w-full sm:w-auto">
                <div>
                  <span className="text-[10px] font-bold uppercase text-emerald-800 tracking-wider block">Wallet Balance</span>
                  <span className="text-xl sm:text-2xl font-extrabold text-emerald-950">₵{Number(user.balance || 0).toFixed(2)}</span>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setBalanceModalUser(user);
                    setBalanceAmount('');
                    setBalanceReason('');
                    setBalanceAction('add');
                  }}
                  className="h-9 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-xs shrink-0"
                >
                  <Edit3 className="w-3.5 h-3.5 mr-1" /> Adjust
                </Button>
              </div>
            </div>

            {/* Financial Lifetime Summary Grid */}
            {summary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-100">
                  <span className="text-emerald-800 font-bold block text-[11px] uppercase tracking-wider">Lifetime Deposits</span>
                  <span className="font-extrabold text-emerald-950 text-base sm:text-lg block mt-0.5">₵{summary.totalDeposited.toFixed(2)}</span>
                  <span className="text-emerald-700 font-semibold text-[11px]">{summary.approvedDepositsCount} Approved Deposits</span>
                </div>

                <div className="bg-indigo-50/70 p-3 rounded-xl border border-indigo-100">
                  <span className="text-indigo-800 font-bold block text-[11px] uppercase tracking-wider">Lifetime Orders Spend</span>
                  <span className="font-extrabold text-indigo-950 text-base sm:text-lg block mt-0.5">₵{summary.totalSpent.toFixed(2)}</span>
                  <span className="text-indigo-700 font-semibold text-[11px]">{summary.totalOrdersCount} Total Orders ({summary.completedOrdersCount} Completed)</span>
                </div>

                <div className="bg-purple-50/70 p-3 rounded-xl border border-purple-100">
                  <span className="text-purple-800 font-bold block text-[11px] uppercase tracking-wider">Lifetime Refunds</span>
                  <span className="font-extrabold text-purple-950 text-base sm:text-lg block mt-0.5">₵{summary.totalRefundsAmount.toFixed(2)}</span>
                  <span className="text-purple-700 font-semibold text-[11px]">{summary.refundedCount} Orders Refunded</span>
                </div>

                <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-100">
                  <span className="text-amber-800 font-bold block text-[11px] uppercase tracking-wider">Support & Referral</span>
                  <span className="font-extrabold text-amber-950 text-base sm:text-lg block mt-0.5">₵{summary.referralBalance.toFixed(2)}</span>
                  <span className="text-amber-700 font-semibold text-[11px]">{summary.totalTicketsCount} Support Tickets Opened</span>
                </div>
              </div>
            )}
          </div>

          {/* Interactive Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-gray-200 overflow-x-auto pb-1">
            {[
              { id: 'timeline', label: `Chronological Timeline (${timeline.length})`, icon: Clock },
              { id: 'transactions', label: `Transactions (${transactions.length})`, icon: CreditCard },
              { id: 'orders', label: `Orders (${orders.length})`, icon: ShoppingCart },
              { id: 'tickets', label: `Support Tickets (${tickets.length})`, icon: MessageSquare }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2.5 rounded-t-xl text-xs sm:text-sm font-bold border-b-2 transition-all flex items-center gap-2 shrink-0 ${
                    activeTab === tab.id
                      ? 'border-indigo-600 text-indigo-600 bg-white shadow-xs'
                      : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: CHRONOLOGICAL ACTION TIMELINE */}
          {activeTab === 'timeline' && (
            <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-md space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <h4 className="font-bold text-gray-900 text-base flex items-center gap-2">
                  <Clock className="w-5 h-5 text-indigo-600" />
                  <span>All Account Actions Since Registration ({timeline.length} events)</span>
                </h4>
              </div>

              {timeline.length === 0 ? (
                <p className="text-xs text-gray-500 py-6 text-center">No action events recorded for this user.</p>
              ) : (
                <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-2.5 sm:before:left-3.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-gray-200">
                  {timeline.map((ev, idx) => (
                    <div key={ev.id || idx} className="relative group">
                      {/* Timeline Dot */}
                      <div className={`absolute -left-6 sm:-left-8 top-1 w-5 h-5 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs shadow-xs border ${
                        ev.eventType === 'ACCOUNT_CREATED' ? 'bg-blue-600 text-white border-blue-700' :
                        ev.eventType === 'DEPOSIT' ? 'bg-emerald-600 text-white border-emerald-700' :
                        ev.eventType === 'ORDER' ? 'bg-indigo-600 text-white border-indigo-700' :
                        ev.eventType === 'TICKET' ? 'bg-amber-600 text-white border-amber-700' :
                        ev.eventType === 'BAN' ? 'bg-rose-600 text-white border-rose-700' :
                        'bg-gray-600 text-white border-gray-700'
                      }`}>
                        {ev.eventType === 'ACCOUNT_CREATED' ? <User className="w-3 h-3" /> :
                         ev.eventType === 'DEPOSIT' ? <DollarSign className="w-3 h-3" /> :
                         ev.eventType === 'ORDER' ? <ShoppingCart className="w-3 h-3" /> :
                         ev.eventType === 'TICKET' ? <MessageSquare className="w-3 h-3" /> :
                         ev.eventType === 'BAN' ? <ShieldAlert className="w-3 h-3" /> :
                         <Clock className="w-3 h-3" />}
                      </div>

                      {/* Event Box */}
                      <div className="bg-gray-50 hover:bg-white border border-gray-200 hover:border-indigo-300 rounded-2xl p-4 shadow-2xs hover:shadow-sm transition-all space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-200/60 pb-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <h5 className="font-bold text-gray-900 text-sm sm:text-base">{ev.title}</h5>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${ev.badgeColor}`}>
                              {ev.badge}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 self-start sm:self-auto">
                            {/* Prominent Price / Amount Badge */}
                            {(ev.priceDisplay || (ev.amount !== undefined && ev.amount !== null && ev.amount > 0)) && (
                              <span className={`text-xs font-extrabold px-3 py-1 rounded-xl border shadow-2xs font-mono ${
                                ev.eventType === 'REFUND' || ev.eventType === 'REFUNDED_ORDER'
                                  ? 'bg-purple-100 text-purple-900 border-purple-300'
                                  : ev.eventType === 'DEPOSIT'
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                  : ev.eventType === 'ORDER'
                                  ? 'bg-indigo-100 text-indigo-900 border-indigo-300'
                                  : 'bg-gray-100 text-gray-900 border-gray-300'
                              }`}>
                                {ev.priceDisplay || `₵${Number(ev.amount).toFixed(2)}`}
                              </span>
                            )}
                            <span className="text-xs font-mono text-gray-500">
                              {new Date(ev.timestamp).toLocaleString()}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-gray-700 font-medium">{ev.description}</p>

                        {/* Metadata Details */}
                        {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                          <div className="bg-white/80 border border-gray-200/70 rounded-xl p-2.5 text-[11px] font-mono text-gray-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                            {Object.entries(ev.metadata).map(([k, v]) => (
                              v ? <span key={k}><strong>{k}:</strong> {String(v)}</span> : null
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TRANSACTIONS LIST */}
          {activeTab === 'transactions' && (
            <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-md space-y-4">
              <h4 className="font-bold text-gray-900 text-base flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-600" />
                <span>Transactions History ({transactions.length})</span>
              </h4>

              {transactions.length === 0 ? (
                <p className="text-xs text-gray-500 py-6 text-center">No deposit or transaction records found for this user.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider">
                        <th className="p-3">ID / Reference</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Amount</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Description</th>
                        <th className="p-3">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {transactions.map(t => (
                        <tr key={t.id} className="hover:bg-gray-50">
                          <td className="p-3 font-mono font-semibold text-gray-900 break-all">{t.id}</td>
                          <td className="p-3 uppercase font-bold text-indigo-700">{t.type}</td>
                          <td className="p-3 font-extrabold text-emerald-700">₵{Number(t.amount || 0).toFixed(2)}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                              t.status === 'approved' || t.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                : t.status === 'pending'
                                ? 'bg-amber-100 text-amber-800 border-amber-200'
                                : 'bg-rose-100 text-rose-800 border-rose-200'
                            }`}>
                              {t.status || 'completed'}
                            </span>
                          </td>
                          <td className="p-3 text-gray-600 max-w-xs truncate">{t.description || 'N/A'}</td>
                          <td className="p-3 text-gray-500 font-mono text-[11px]">{new Date(t.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ORDERS HISTORY */}
          {activeTab === 'orders' && (
            <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-md space-y-4">
              <h4 className="font-bold text-gray-900 text-base flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-indigo-600" />
                <span>Orders History ({orders.length})</span>
              </h4>

              {orders.length === 0 ? (
                <p className="text-xs text-gray-500 py-6 text-center">No order records found for this user.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-bold uppercase tracking-wider">
                        <th className="p-3">Order ID</th>
                        <th className="p-3">Service Name</th>
                        <th className="p-3">Quantity</th>
                        <th className="p-3">Cost</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {orders.map(o => (
                        <tr key={o.id} className="hover:bg-gray-50">
                          <td className="p-3 font-mono font-semibold text-gray-900">{o.id}</td>
                          <td className="p-3 font-semibold text-gray-800 max-w-xs truncate">{o.services?.name || o.promotion_packages?.name || 'SMM Service'}</td>
                          <td className="p-3 font-bold text-gray-900">{o.quantity?.toLocaleString()}</td>
                          <td className="p-3 font-bold text-indigo-700">₵{Number(o.total_cost || 0).toFixed(2)}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                              o.status === 'completed' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                              o.status === 'refunded' ? 'bg-purple-100 text-purple-800 border-purple-200' :
                              o.status === 'canceled' ? 'bg-rose-100 text-rose-800 border-rose-200' :
                              'bg-amber-100 text-amber-800 border-amber-200'
                            }`}>
                              {o.status}
                            </span>
                          </td>
                          <td className="p-3 text-gray-500 font-mono text-[11px]">{new Date(o.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SUPPORT TICKETS */}
          {activeTab === 'tickets' && (
            <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-md space-y-4">
              <h4 className="font-bold text-gray-900 text-base flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-amber-600" />
                <span>Support Tickets ({tickets.length})</span>
              </h4>

              {tickets.length === 0 ? (
                <p className="text-xs text-gray-500 py-6 text-center">No support tickets opened by this user.</p>
              ) : (
                <div className="space-y-3">
                  {tickets.map(tk => (
                    <div key={tk.id} className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between font-bold text-gray-900">
                        <span>Ticket #{tk.id}: {tk.subject}</span>
                        <span className="font-mono text-gray-400">{new Date(tk.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-500">
                        <span>Priority: <strong>{tk.priority || 'normal'}</strong></span>
                        <span>•</span>
                        <span>Status: <strong>{tk.status || 'open'}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* BALANCE ADJUSTMENT MODAL */}
      {balanceModalUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Adjust Wallet Balance</h3>
                <p className="text-xs text-gray-500">{balanceModalUser.email}</p>
              </div>
              <button onClick={() => setBalanceModalUser(null)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleBalanceSubmit} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Adjustment Action:</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'add', label: 'Credit (+)' },
                    { id: 'deduct', label: 'Deduct (-)' },
                    { id: 'set', label: 'Set Exact' }
                  ].map(act => (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => setBalanceAction(act.id)}
                      className={`p-2.5 rounded-xl text-xs font-bold border transition-all ${
                        balanceAction === act.id
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-gray-50 text-gray-700 border-gray-200'
                      }`}
                    >
                      {act.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Amount (₵):</label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 50.00"
                  value={balanceAmount}
                  onChange={(e) => setBalanceAmount(e.target.value)}
                  className="h-11 border-gray-300 font-bold text-base"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Reason / Note:</label>
                <Input
                  type="text"
                  placeholder="Reason for balance update..."
                  value={balanceReason}
                  onChange={(e) => setBalanceReason(e.target.value)}
                  className="h-10 border-gray-300 text-xs"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <Button type="button" variant="outline" onClick={() => setBalanceModalUser(null)}>Cancel</Button>
                <Button type="submit" disabled={balanceSubmitting} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                  {balanceSubmitting ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : null}
                  Update Balance
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
});

export default AdminUserTransactionsSearch;
