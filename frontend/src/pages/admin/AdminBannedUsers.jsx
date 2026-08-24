import React, { memo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/useDebounce';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Search, RefreshCw, UserX, ShieldAlert, UserCheck, Shield, Mail, 
  Phone, Clock, AlertTriangle, ExternalLink, Edit3, X, CheckCircle2, User, Plus
} from 'lucide-react';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';

// Execute Banned Users Server Action
const executeBannedUsersServerAction = async ({ searchTerm }) => {
  const startTime = performance.now();

  try {
    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes.data.session?.access_token;

    if (token) {
      const response = await fetch('/api/admin/banned-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ searchTerm, limit: 100 })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          return {
            bannedUsers: result.bannedUsers || [],
            searchTimeMs: result.searchTimeMs || Math.round(performance.now() - startTime),
            total: result.total || 0
          };
        }
      }
    }
  } catch (err) {
    console.warn('Server action banned users query warning:', err);
  }

  // Direct Supabase Fallback
  const { data: banned, error } = await supabase.from('banned_users').select('*').order('banned_at', { ascending: false });
  if (error) throw error;

  const userIds = (banned || []).map(b => b.user_id);
  let profiles = [];
  if (userIds.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('*').in('id', userIds);
    profiles = profs || [];
  }

  const profMap = new Map();
  profiles.forEach(p => profMap.set(p.id, p));

  const list = (banned || []).map(b => ({
    banId: b.id,
    userId: b.user_id,
    reason: b.reason || 'No reason specified',
    bannedAt: b.banned_at,
    bannedBy: b.banned_by,
    user: profMap.get(b.user_id) || { email: 'Unknown', name: 'Unknown User' },
    stats: { totalOrders: 0, totalSpent: 0, totalDeposited: 0 }
  }));

  return {
    bannedUsers: list,
    searchTimeMs: Math.round(performance.now() - startTime),
    total: list.length
  };
};

const AdminBannedUsers = memo(() => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [banModalOpen, setBanModalOpen] = useState(false);
  const [targetUserIdentifier, setTargetUserIdentifier] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banSubmitting, setBanSubmitting] = useState(false);

  const [view360User, setView360User] = useState(null);
  const [view360Data, setView360Data] = useState(null);
  const [view360Loading, setView360Loading] = useState(false);

  const debouncedSearch = useDebounce(searchTerm, 150);

  const { data: userRole } = useUserRole();
  const isAdmin = userRole?.isAdmin ?? false;

  const {
    data: bannedResult = { bannedUsers: [], searchTimeMs: 0, total: 0 },
    isLoading,
    isFetching,
    refetch
  } = useQuery({
    queryKey: ['admin', 'banned-users-list', { searchTerm: debouncedSearch }],
    queryFn: () => executeBannedUsersServerAction({ searchTerm: debouncedSearch }),
    enabled: isAdmin,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    placeholderData: (previousData) => previousData
  });

  // Handle Ban User Action Submission
  const handleBanSubmit = async (e) => {
    e.preventDefault();
    if (!targetUserIdentifier.trim()) {
      toast.error('Please enter a User Email or User ID');
      return;
    }

    setBanSubmitting(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      const cleanIdent = targetUserIdentifier.trim();

      // Find user by email or UUID
      let targetUserId = cleanIdent;
      if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(cleanIdent)) {
        const { data: foundProf, error: findErr } = await supabase
          .from('profiles')
          .select('id')
          .ilike('email', cleanIdent)
          .maybeSingle();

        if (findErr || !foundProf) {
          throw new Error(`User with email "${cleanIdent}" not found`);
        }
        targetUserId = foundProf.id;
      }

      const res = await fetch('/api/admin/ban-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: targetUserId,
          reason: banReason.trim() || 'Banned via Banned Users Dashboard'
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to ban user');
      }

      toast.success(data.message || 'User banned successfully');
      setBanModalOpen(false);
      setTargetUserIdentifier('');
      setBanReason('');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    } catch (err) {
      console.error('Ban user submit error:', err);
      toast.error(err.message || 'Failed to ban user');
    } finally {
      setBanSubmitting(false);
    }
  };

  // Handle Unban User Action
  const handleUnbanUser = async (item) => {
    const targetName = item.user?.name || item.user?.email || item.userId;
    if (!window.confirm(`Are you sure you want to unban ${targetName}?`)) return;

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;

      const res = await fetch('/api/admin/unban-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ userId: item.userId })
      });

      if (!res.ok) {
        // Fallback direct delete
        const { error } = await supabase.from('banned_users').delete().eq('user_id', item.userId);
        if (error) throw error;
      }

      toast.success(`Successfully unbanned ${targetName}`);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    } catch (err) {
      console.error('Unban error:', err);
      toast.error(err.message || 'Failed to unban user');
    }
  };

  // Open 360 User Overview
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
      console.error('Fetch 360 details error:', err);
      toast.error('Failed to load user details');
    } finally {
      setView360Loading(false);
    }
  };

  const bannedList = bannedResult.bannedUsers || [];
  const searchTime = bannedResult.searchTimeMs || 0;

  return (
    <div className="space-y-4 sm:space-y-6 pb-12">
      {/* Search & Actions Header Card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-md space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-2 text-gray-900 font-bold text-base sm:text-lg">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
            <span>Banned Accounts Center</span>
            <span className="bg-rose-100 text-rose-800 text-xs font-extrabold px-2.5 py-0.5 rounded-full border border-rose-200">
              {bannedResult.total} Banned
            </span>
          </div>

          <Button
            onClick={() => setBanModalOpen(true)}
            className="h-10 px-4 text-xs sm:text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-md flex items-center justify-center gap-1.5 w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Ban New Account</span>
          </Button>
        </div>

        {/* Search Input */}
        <div className="relative flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              type="text"
              placeholder="Search banned accounts by Name, Email, Phone, UUID, or Ban Reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 pr-10 h-12 text-sm sm:text-base border-gray-200 focus:border-rose-500 rounded-xl"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-12 px-5 text-xs font-semibold border-gray-200 hover:bg-gray-50 flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Metric Badge */}
      {debouncedSearch && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-rose-50/80 border border-rose-100 rounded-xl p-3 sm:px-4 sm:py-2.5 text-xs text-rose-900 font-medium gap-2">
          <span>Search for "<strong className="font-semibold">{debouncedSearch}</strong>" returned <strong>{bannedResult.total}</strong> banned accounts</span>
          <div className="flex items-center gap-1.5 font-mono text-[11px] bg-white px-2.5 py-1 rounded-md border border-rose-200">
            <Clock className="w-3 h-3 text-rose-500" />
            <span>Server Action: <strong>{searchTime}ms</strong></span>
          </div>
        </div>
      )}

      {/* Banned Users Cards List */}
      {isLoading ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-3">
          <div className="flex items-center gap-2 text-rose-600 text-sm font-semibold">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Loading banned user records...</span>
          </div>
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse"></div>
          ))}
        </div>
      ) : bannedList.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
          <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <UserCheck className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">
            {debouncedSearch ? 'No Matching Banned Users' : 'No Banned Accounts'}
          </h3>
          <p className="text-gray-500 text-xs sm:text-sm max-w-md mx-auto">
            {debouncedSearch ? `No banned records matched "${debouncedSearch}".` : 'There are currently no banned users in the system.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {bannedList.map((item) => {
            const user = item.user || {};
            const stats = item.stats || { totalOrders: 0, totalSpent: 0, totalDeposited: 0 };

            return (
              <div
                key={item.banId || item.userId}
                className="bg-white border border-rose-100 hover:border-rose-300 rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all space-y-4"
              >
                {/* Top User Info Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-rose-100 text-rose-700 font-bold flex items-center justify-center text-base sm:text-lg border border-rose-200 shrink-0">
                      {user.name ? user.name.charAt(0).toUpperCase() : (user.email ? user.email.charAt(0).toUpperCase() : 'U')}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-bold text-gray-900 text-sm sm:text-base truncate">{user.name || 'Unknown User'}</h4>
                        <span className="bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <ShieldAlert className="w-3 h-3" /> BANNED
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-gray-500 mt-0.5">
                        <span className="flex items-center gap-1 truncate">
                          <Mail className="w-3 h-3 text-gray-400 shrink-0" /> {user.email}
                        </span>
                        {user.phone_number && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-gray-400 shrink-0" /> {user.phone_number}
                          </span>
                        )}
                        <span className="font-mono text-[10px] sm:text-[11px] text-gray-400 break-all">ID: {item.userId}</span>
                      </div>
                    </div>
                  </div>

                  {/* Wallet Balance Badge */}
                  <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 self-start sm:self-auto">
                    <span className="text-[10px] font-bold uppercase text-gray-500 tracking-wider block">Wallet Balance</span>
                    <span className="text-base font-extrabold text-gray-900">₵{Number(user.balance || 0).toFixed(2)}</span>
                  </div>
                </div>

                {/* Ban Reason Box */}
                <div className="bg-rose-50/80 border border-rose-200 rounded-xl p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between text-rose-900 font-bold">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      Reason for Ban:
                    </span>
                    {item.bannedAt && (
                      <span className="text-[11px] font-normal text-rose-700">
                        Banned: {new Date(item.bannedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <p className="text-rose-950 font-medium pl-5">{item.reason}</p>
                </div>

                {/* Management Action Buttons */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-gray-100 text-xs">
                  <Button
                    size="sm"
                    onClick={() => handleUnbanUser(item)}
                    className="h-9 sm:h-8 px-4 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-xs flex items-center justify-center gap-1.5 w-full sm:w-auto"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Unban Account</span>
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpen360Details(user)}
                    className="h-9 sm:h-8 text-xs font-semibold border-gray-300 hover:bg-gray-50 w-full sm:w-auto justify-center"
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1" />
                    View 360 User Overview
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* BAN USER MODAL */}
      {banModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-rose-600" />
                  <span>Ban User Account</span>
                </h3>
                <p className="text-xs text-gray-500">Prevent user from accessing services or placing orders</p>
              </div>
              <button onClick={() => setBanModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleBanSubmit} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">User Email or User UUID:</label>
                <Input
                  type="text"
                  placeholder="e.g. user@gmail.com or UUID"
                  value={targetUserIdentifier}
                  onChange={(e) => setTargetUserIdentifier(e.target.value)}
                  className="h-11 border-gray-300 font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Ban Reason:</label>
                <textarea
                  rows={3}
                  placeholder="Explain why this account is being banned (e.g. Chargeback, Spamming, TOS Violation)..."
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 p-3 text-xs focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <Button type="button" variant="outline" onClick={() => setBanModalOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={banSubmitting} className="bg-rose-600 hover:bg-rose-700 text-white font-bold">
                  {banSubmitting ? <RefreshCw className="w-4 h-4 animate-spin mr-1" /> : null}
                  Confirm & Ban Account
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 360 FULL OVERVIEW MODAL */}
      {view360User && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div>
                <h3 className="text-xl font-bold text-gray-900">User 360 Overview</h3>
                <p className="text-xs text-gray-500 font-mono">{view360User.name || view360User.email} ({view360User.id})</p>
              </div>
              <button onClick={() => setView360User(null)} className="text-gray-400 hover:text-gray-600 p-2 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>

            {view360Loading ? (
              <div className="p-8 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
                <p className="text-sm font-semibold text-gray-600">Loading user 360 breakdown...</p>
              </div>
            ) : view360Data ? (
              <div className="space-y-6 text-sm">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 grid grid-cols-2 gap-3">
                  <div><strong>Name:</strong> <span className="block text-gray-900">{view360Data.profile?.name || 'N/A'}</span></div>
                  <div><strong>Email:</strong> <span className="block text-gray-900">{view360Data.profile?.email}</span></div>
                  <div><strong>Phone:</strong> <span className="block text-gray-900">{view360Data.profile?.phone_number || 'N/A'}</span></div>
                  <div><strong>Balance:</strong> <span className="block font-extrabold text-emerald-700">₵{Number(view360Data.profile?.balance || 0).toFixed(2)}</span></div>
                </div>

                <div>
                  <h4 className="font-bold text-gray-900 mb-2">Raw JSON Profile Data:</h4>
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

export default AdminBannedUsers;
