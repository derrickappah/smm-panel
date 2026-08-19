import React, { memo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/useDebounce';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Search, RefreshCw, User, Mail, Phone, Shield, ShieldAlert, ShieldCheck, 
  DollarSign, ShoppingCart, Wallet, Award, Clock, Copy, ExternalLink, X, 
  Check, AlertTriangle, UserCheck, UserX, Edit3, ArrowRight, FileText, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';

// Server Action helper to execute user search
const executeUserSearchServerAction = async ({ searchTerm, roleFilter }) => {
  if (!searchTerm || !searchTerm.trim()) {
    return { users: [], searchTimeMs: 0, total: 0 };
  }

  const startTime = performance.now();

  try {
    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes.data.session?.access_token;

    if (token) {
      const response = await fetch('/api/admin/search-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ searchTerm, roleFilter, limit: 50 })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          return {
            users: result.users || [],
            searchTimeMs: result.searchTimeMs || Math.round(performance.now() - startTime),
            total: result.total || (result.users?.length || 0)
          };
        }
      }
    }
  } catch (err) {
    console.warn('Server action user search error:', err);
  }

  // Fallback direct Supabase query if server endpoint unreachable
  const trimmed = searchTerm.trim();
  const pattern = `%${trimmed}%`;
  const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(trimmed);

  let query = supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(50);
  if (roleFilter && roleFilter !== 'all') {
    query = query.eq('role', roleFilter);
  }

  const conds = [`name.ilike.${pattern}`, `email.ilike.${pattern}`, `phone_number.ilike.${pattern}`, `referral_code.ilike.${pattern}`];
  if (isUuid) conds.push(`id.eq.${trimmed}`);
  query = query.or(conds.join(','));

  const { data: users, error } = await query;
  if (error) throw error;

  return {
    users: (users || []).map(u => ({ ...u, stats: { totalOrders: 0, totalSpent: 0, totalDeposits: 0, totalDeposited: 0 }, banInfo: { isBanned: false } })),
    searchTimeMs: Math.round(performance.now() - startTime),
    total: users?.length || 0
  };
};

const AdminUserSearch = memo(() => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('search') || params.get('q') || '';
  });
  const [roleFilter, setRoleFilter] = useState('all');
  const [copiedId, setCopiedId] = useState(null);

  // Modals state
  const [balanceModalUser, setBalanceModalUser] = useState(null);
  const [balanceAction, setBalanceAction] = useState('add'); // 'add', 'deduct', 'set'
  const [balanceAmount, setBalanceAmount] = useState('');
  const [balanceReason, setBalanceReason] = useState('');
  const [balanceSubmitting, setBalanceSubmitting] = useState(false);

  const [roleModalUser, setRoleModalUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState('user');
  const [roleSubmitting, setRoleSubmitting] = useState(false);

  const [view360User, setView360User] = useState(null);
  const [view360Data, setView360Data] = useState(null);
  const [view360Loading, setView360Loading] = useState(false);

  const debouncedSearch = useDebounce(searchTerm, 120);

  const { data: userRole } = useUserRole();
  const isAdmin = userRole?.isAdmin ?? false;

  const {
    data: searchResult = { users: [], searchTimeMs: 0, total: 0 },
    isLoading,
    isFetching,
    refetch
  } = useQuery({
    queryKey: ['admin', 'user-instant-search', { searchTerm: debouncedSearch, roleFilter }],
    queryFn: () => executeUserSearchServerAction({ searchTerm: debouncedSearch, roleFilter }),
    enabled: isAdmin && !!debouncedSearch.trim(),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    placeholderData: (previousData) => previousData
  });

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    toast.success(`Copied ${label} to clipboard`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Balance Update Server Action Handler
  const handleUpdateBalanceSubmit = async (e) => {
    e.preventDefault();
    if (!balanceModalUser || !balanceAmount || parseFloat(balanceAmount) < 0) {
      toast.error('Please enter a valid non-negative amount');
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
          reason: balanceReason
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Balance update failed');
      }

      toast.success(data.message || `Successfully updated balance for ${balanceModalUser.name || balanceModalUser.email}`);
      setBalanceModalUser(null);
      setBalanceAmount('');
      setBalanceReason('');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    } catch (err) {
      console.error('Balance update error:', err);
      toast.error(err.message || 'Failed to update balance');
    } finally {
      setBalanceSubmitting(false);
    }
  };

  // Role Update Server Action Handler
  const handleUpdateRoleSubmit = async (e) => {
    e.preventDefault();
    if (!roleModalUser || !selectedRole) return;

    setRoleSubmitting(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;

      const res = await fetch('/api/admin/update-user-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: roleModalUser.id,
          newRole: selectedRole
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Role update failed');
      }

      toast.success(data.message || 'Role updated successfully');
      setRoleModalUser(null);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    } catch (err) {
      console.error('Role update error:', err);
      toast.error(err.message || 'Failed to update role');
    } finally {
      setRoleSubmitting(false);
    }
  };

  // Ban / Unban Toggle Action
  const handleToggleBanUser = async (user) => {
    const isCurrentlyBanned = user.banInfo?.isBanned;
    const actionText = isCurrentlyBanned ? 'unban' : 'ban';
    if (!window.confirm(`Are you sure you want to ${actionText} ${user.name || user.email}?`)) {
      return;
    }

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;

      if (isCurrentlyBanned) {
        // Unban
        const { error } = await supabase.from('banned_users').delete().eq('user_id', user.id);
        if (error) throw error;
        toast.success(`Unbanned ${user.name || user.email}`);
      } else {
        // Ban via API or DB
        const res = await fetch('/api/admin/ban-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ userId: user.id, reason: 'Banned via User Search Page' })
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.message || 'Failed to ban user');
        }
        toast.success(`Banned ${user.name || user.email}`);
      }
      refetch();
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    } catch (err) {
      console.error('Ban toggle error:', err);
      toast.error(err.message || 'Ban toggle failed');
    }
  };

  // Open 360 Full User Breakdown Modal
  const handleOpen360Details = async (user) => {
    setView360User(user);
    setView360Loading(true);
    setView360Data(null);

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;

      const res = await fetch('/api/admin/user-details-full', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId: user.id })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setView360Data(data);
        }
      }
    } catch (err) {
      console.error('Fetch 360 user details error:', err);
      toast.error('Failed to load full user details');
    } finally {
      setView360Loading(false);
    }
  };

  const usersList = searchResult.users || [];
  const searchTime = searchResult.searchTimeMs || 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Search Input Controls */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-md space-y-4">
        <form onSubmit={(e) => { e.preventDefault(); if (searchTerm.trim()) refetch(); }} className="space-y-4">
          <div className="relative flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500 w-5 h-5" />
              <Input
                type="text"
                placeholder="Search user by Name, Email, Phone number, User ID (UUID), or Referral Code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 pr-10 h-14 text-base sm:text-lg border-2 border-indigo-100 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 rounded-xl shadow-inner font-medium text-gray-900"
                autoFocus
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <Button 
              type="submit" 
              disabled={isFetching || !searchTerm.trim()}
              className="h-14 px-8 text-base font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg hover:shadow-indigo-200 transition-all flex items-center justify-center gap-2"
            >
              {isFetching ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  <span>Search</span>
                </>
              )}
            </Button>
          </div>

          {/* Role Filter Pills */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-1">Role:</span>
              {[
                { id: 'all', label: 'All Roles' },
                { id: 'user', label: 'Users' },
                { id: 'admin', label: 'Admins' },
                { id: 'reseller', label: 'Resellers' },
                { id: 'support', label: 'Support' }
              ].map(role => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setRoleFilter(role.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    roleFilter === role.id 
                      ? 'bg-indigo-600 text-white shadow-sm' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {role.label}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>

      {/* Performance Metric Meter */}
      {debouncedSearch.trim() && (
        <div className="flex items-center justify-between bg-indigo-50/80 border border-indigo-100 rounded-xl px-4 py-2.5 text-xs text-indigo-900 font-medium">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-indigo-600" />
            <span>
              Search for "<strong className="font-semibold text-indigo-950">{debouncedSearch}</strong>" returned <strong className="font-bold text-indigo-950">{searchResult.total}</strong> users
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] bg-white px-2.5 py-1 rounded-md border border-indigo-200 shadow-xs">
            <Clock className="w-3 h-3 text-indigo-500" />
            <span>Server Action: <strong>{searchTime}ms</strong> ({ (searchTime / 1000).toFixed(2) }s)</span>
          </div>
        </div>
      )}

      {/* User Search Results */}
      {!debouncedSearch.trim() ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-1">Search Users</h3>
          <p className="text-gray-500 text-sm max-w-md mx-auto mb-6">
            Enter a user's name, email, phone number, UUID, or referral code to search instantly with full management actions.
          </p>
        </div>
      ) : isLoading ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 space-y-4 shadow-sm">
          <div className="flex items-center gap-3 text-indigo-600 font-semibold text-sm">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Executing server action user search...</span>
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse"></div>
            ))}
          </div>
        </div>
      ) : usersList.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
          <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <UserX className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">No Users Found</h3>
          <p className="text-gray-500 text-sm max-w-md mx-auto mb-4">
            No user profiles matched query "<strong>{debouncedSearch}</strong>".
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {usersList.map((user) => {
            const isBanned = user.banInfo?.isBanned;
            const stats = user.stats || { totalOrders: 0, totalSpent: 0, totalDeposited: 0 };

            return (
              <div 
                key={user.id}
                className="bg-white border border-gray-200 hover:border-indigo-300 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all space-y-4"
              >
                {/* User Top Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold flex items-center justify-center text-lg shadow-sm">
                      {user.name ? user.name.charAt(0).toUpperCase() : (user.email ? user.email.charAt(0).toUpperCase() : 'U')}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-gray-900 text-base">{user.name || 'No Name'}</h4>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          user.role === 'admin' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                          user.role === 'reseller' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                          'bg-gray-100 text-gray-700 border border-gray-200'
                        }`}>
                          {user.role || 'USER'}
                        </span>
                        {isBanned && (
                          <span className="bg-red-100 text-red-800 border border-red-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                            <ShieldAlert className="w-3 h-3" /> BANNED
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-gray-400" /> {user.email}
                        </span>
                        {user.phone_number && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-gray-400" /> {user.phone_number}
                          </span>
                        )}
                        <span className="font-mono text-[11px] text-gray-400">ID: {user.id}</span>
                      </div>
                    </div>
                  </div>

                  {/* Balance Display Box */}
                  <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-emerald-800 tracking-wider block">Wallet Balance</span>
                      <span className="text-xl font-extrabold text-emerald-900">₵{Number(user.balance || 0).toFixed(2)}</span>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        setBalanceModalUser(user);
                        setBalanceAmount('');
                        setBalanceReason('');
                        setBalanceAction('add');
                      }}
                      className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm"
                    >
                      <Edit3 className="w-3.5 h-3.5 mr-1" /> Adjust
                    </Button>
                  </div>
                </div>

                {/* User Statistics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <span className="text-gray-400 font-semibold block">Total Orders</span>
                    <span className="font-bold text-gray-900 text-sm mt-0.5 block">{stats.totalOrders} Orders</span>
                    <span className="text-indigo-600 font-semibold text-[11px]">Spent: ₵{stats.totalSpent.toFixed(2)}</span>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <span className="text-gray-400 font-semibold block">Total Deposits</span>
                    <span className="font-bold text-gray-900 text-sm mt-0.5 block">{stats.approvedDeposits} Approved</span>
                    <span className="text-emerald-600 font-semibold text-[11px]">Deposited: ₵{stats.totalDeposited.toFixed(2)}</span>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <span className="text-gray-400 font-semibold block">Referral Info</span>
                    <span className="font-mono text-gray-900 font-bold block">{user.referral_code || 'None'}</span>
                    <span className="text-purple-600 font-semibold text-[11px]">Earned: ₵{(stats.referralTotalEarned || 0).toFixed(2)}</span>
                  </div>

                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <span className="text-gray-400 font-semibold block">Joined Date</span>
                    <span className="font-semibold text-gray-900 block mt-0.5">{new Date(user.created_at).toLocaleDateString()}</span>
                    <span className="text-gray-400 text-[11px]">{new Date(user.created_at).toLocaleTimeString()}</span>
                  </div>
                </div>

                {/* Management Action Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100 text-xs">
                  <div className="flex items-center gap-2">
                    {/* Change Role Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRoleModalUser(user);
                        setSelectedRole(user.role || 'user');
                      }}
                      className="h-8 text-xs font-semibold border-gray-300 hover:bg-gray-100"
                    >
                      <Shield className="w-3.5 h-3.5 mr-1 text-purple-600" />
                      Role ({user.role || 'user'})
                    </Button>

                    {/* Ban / Unban Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleBanUser(user)}
                      className={`h-8 text-xs font-semibold ${
                        isBanned 
                          ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50' 
                          : 'border-rose-300 text-rose-700 hover:bg-rose-50'
                      }`}
                    >
                      {isBanned ? (
                        <>
                          <UserCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                          Unban User
                        </>
                      ) : (
                        <>
                          <UserX className="w-3.5 h-3.5 mr-1 text-rose-600" />
                          Ban User
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleOpen360Details(user)}
                      className="h-8 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      <ExternalLink className="w-3.5 h-3.5 mr-1" />
                      View 360 Everything
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: Adjust Balance Modal */}
      {balanceModalUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Adjust User Balance</h3>
                <p className="text-xs text-gray-500">{balanceModalUser.name || balanceModalUser.email}</p>
              </div>
              <button onClick={() => setBalanceModalUser(null)} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateBalanceSubmit} className="space-y-4 text-sm">
              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-xs">
                <span className="text-emerald-800 font-semibold block">Current Wallet Balance:</span>
                <span className="text-xl font-extrabold text-emerald-950">₵{Number(balanceModalUser.balance || 0).toFixed(2)}</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Action Type:</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'add', label: 'Credit (+)' },
                    { id: 'deduct', label: 'Debit (-)' },
                    { id: 'set', label: 'Set (=)' }
                  ].map(act => (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => setBalanceAction(act.id)}
                      className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                        balanceAction === act.id
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {act.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Amount (GHS ₵):</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 50.00"
                  value={balanceAmount}
                  onChange={(e) => setBalanceAmount(e.target.value)}
                  className="h-11 border-gray-300 font-bold text-base"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Reason / Note (Optional):</label>
                <Input
                  type="text"
                  placeholder="e.g. Manual top-up / Refund credit"
                  value={balanceReason}
                  onChange={(e) => setBalanceReason(e.target.value)}
                  className="h-10 border-gray-300 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <Button type="button" variant="outline" onClick={() => setBalanceModalUser(null)}>Cancel</Button>
                <Button type="submit" disabled={balanceSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                  {balanceSubmitting ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : null}
                  Confirm Balance Update
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Change Role Modal */}
      {roleModalUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Change User Role</h3>
                <p className="text-xs text-gray-500">{roleModalUser.name || roleModalUser.email}</p>
              </div>
              <button onClick={() => setRoleModalUser(null)} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateRoleSubmit} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Select Target Role:</label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger className="h-11 text-sm font-semibold">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User (Standard Customer)</SelectItem>
                    <SelectItem value="admin">Admin (Full Control)</SelectItem>
                    <SelectItem value="reseller">Reseller (API Partner)</SelectItem>
                    <SelectItem value="support">Support Agent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-purple-50 p-3 rounded-xl border border-purple-200 text-xs text-purple-900">
                <p><strong>Note:</strong> Changing a user to <strong>Admin</strong> grants access to the admin dashboard, user management, and order control panels.</p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <Button type="button" variant="outline" onClick={() => setRoleModalUser(null)}>Cancel</Button>
                <Button type="submit" disabled={roleSubmitting} className="bg-purple-600 hover:bg-purple-700 text-white font-bold">
                  {roleSubmitting ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : null}
                  Update Role
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: 360 View Everything Modal */}
      {view360User && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 pb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">User 360 Overview</h3>
                <p className="text-xs text-gray-500 font-mono">{view360User.name || view360User.email} (ID: {view360User.id})</p>
              </div>
              <button onClick={() => setView360User(null)} className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            {view360Loading ? (
              <div className="p-8 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
                <p className="text-sm font-semibold text-gray-600">Fetching complete 360 data...</p>
              </div>
            ) : view360Data ? (
              <div className="space-y-6 text-sm">
                {/* Profile Overview */}
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div><strong>Name:</strong> <span className="block text-gray-900">{view360Data.profile?.name || 'N/A'}</span></div>
                  <div><strong>Email:</strong> <span className="block text-gray-900">{view360Data.profile?.email}</span></div>
                  <div><strong>Phone:</strong> <span className="block text-gray-900">{view360Data.profile?.phone_number || 'N/A'}</span></div>
                  <div><strong>Role:</strong> <span className="block font-bold text-purple-700 uppercase">{view360Data.profile?.role}</span></div>
                  <div><strong>Balance:</strong> <span className="block font-extrabold text-emerald-700">₵{Number(view360Data.profile?.balance || 0).toFixed(2)}</span></div>
                  <div><strong>Referral Code:</strong> <span className="block font-mono text-indigo-700">{view360Data.profile?.referral_code || 'None'}</span></div>
                </div>

                {/* Orders Section */}
                <div>
                  <h4 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-indigo-600" /> Recent Orders ({view360Data.orders?.length || 0})
                  </h4>
                  {view360Data.orders?.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No orders placed yet.</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-2 border border-gray-200 rounded-xl p-2">
                      {view360Data.orders?.map(o => (
                        <div key={o.id} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded-lg">
                          <span className="font-mono text-gray-700 font-semibold">{o.id.slice(0, 8)}...</span>
                          <span className="font-bold text-gray-900">{o.services?.name?.slice(0, 30)}...</span>
                          <span className="font-bold text-emerald-700">₵{Number(o.total_cost || 0).toFixed(2)}</span>
                          <span className="uppercase font-semibold text-[10px] px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">{o.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Raw JSON Data */}
                <div>
                  <h4 className="font-bold text-gray-900 mb-2">Raw User JSON Object:</h4>
                  <pre className="bg-gray-900 text-emerald-400 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-60">
                    {JSON.stringify(view360Data, null, 2)}
                  </pre>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end pt-2 border-t border-gray-100">
              <Button onClick={() => setView360User(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default AdminUserSearch;
