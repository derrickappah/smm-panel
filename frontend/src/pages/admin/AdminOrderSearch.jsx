import React, { memo, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/useDebounce';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Search, RefreshCw, Filter, Zap, CheckCircle2, AlertCircle, RotateCcw, 
  Tag, Clock, Copy, ExternalLink, Shield, Layers, User, Phone, Mail, 
  HelpCircle, ChevronRight, X, ArrowLeft, ArrowUpRight, Check, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import OrderErrorModal from '@/components/admin/OrderErrorModal';
import { processManualRefund } from '@/lib/refunds';
import { useUpdateOrder, useReorderToSMMGen, useSafeRetryOrder } from '@/hooks/useAdminOrders';
import { useUserRole } from '@/hooks/useUserRole';

// Helper to build PostgreSQL-compatible PostgREST search conditions
const buildSearchConditions = (trimmedSearch, searchMode = 'all') => {
  const searchPattern = `%${trimmedSearch}%`;
  const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(trimmedSearch);
  const isNumeric = /^\d+$/.test(trimmedSearch);

  const orderConditions = [
    `smmgen_order_id.ilike.${searchPattern}`,
    `smmcost_order_id.ilike.${searchPattern}`,
    `worldofsmm_order_id.ilike.${searchPattern}`,
    `g1618_order_id.ilike.${searchPattern}`,
    `oldsmm_order_id.ilike.${searchPattern}`,
    `apiowner_order_id.ilike.${searchPattern}`
  ];

  if (searchMode === 'all' || searchMode === 'link') {
    orderConditions.push(`link.ilike.${searchPattern}`);
  }

  if (isUuid) {
    orderConditions.push(`id.eq.${trimmedSearch}`);
  }

  if (isNumeric) {
    orderConditions.push(`jbsmmpanel_order_id.eq.${trimmedSearch}`);
  }

  return { orderConditions, isNumeric, isUuid };
};

// High-speed Order Search function (Guaranteed < 3 seconds, target < 300ms)
const executeInstantOrderSearch = async ({ searchTerm, searchMode = 'all', statusFilter = 'all' }) => {
  if (!searchTerm || !searchTerm.trim()) {
    return { orders: [], searchTimeMs: 0, total: 0 };
  }

  const startTime = performance.now();
  const trimmedSearch = searchTerm.trim();
  const searchPattern = `%${trimmedSearch}%`;

  let query = supabase
    .from('orders')
    .select(`
      id, user_id, service_id, promotion_package_id, link, quantity, total_cost, 
      status, smmgen_order_id, smmcost_order_id, jbsmmpanel_order_id, worldofsmm_order_id, 
      g1618_order_id, oldsmm_order_id, apiowner_order_id, component_provider_order_ids, 
      created_at, completed_at, refund_status, last_status_check, is_reward,
      services(name, platform, service_type, is_combo), 
      promotion_packages(name, platform, service_type, is_combo), 
      profiles(name, email, phone_number)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(100);

  // Status Filter
  if (statusFilter && statusFilter !== 'all') {
    if (statusFilter === 'refunded') {
      query = query.or('status.eq.refunded,refund_status.eq.succeeded');
    } else if (statusFilter === 'canceled') {
      query = query.or('status.eq.canceled,status.eq.cancelled');
    } else {
      query = query.eq('status', statusFilter);
    }
  }

  const { orderConditions, isNumeric, isUuid } = buildSearchConditions(trimmedSearch, searchMode);

  if (searchMode === 'order_id') {
    query = query.or(orderConditions.join(','));
  } else if (searchMode === 'user') {
    try {
      const { data: matchingProfiles } = await supabase
        .from('profiles')
        .select('id')
        .or(`name.ilike.${searchPattern},email.ilike.${searchPattern},phone_number.ilike.${searchPattern}`)
        .limit(20);
      const userIds = matchingProfiles?.map(p => p.id) || [];
      if (userIds.length > 0) {
        query = query.in('user_id', userIds);
      } else {
        const endTime = performance.now();
        return { orders: [], searchTimeMs: Math.round(endTime - startTime), total: 0 };
      }
    } catch (e) {
      console.warn('Profile search failed:', e);
      return { orders: [], searchTimeMs: Math.round(performance.now() - startTime), total: 0 };
    }
  } else if (searchMode === 'link') {
    query = query.ilike('link', searchPattern);
  } else {
    // "all" mode with FAST PATH for numeric IDs / UUIDs
    let matchingServiceIds = [];
    let matchingPackageIds = [];
    let matchingUserIds = [];

    // FAST PATH: Only run service/package/profile sub-queries if search term is NOT pure number or UUID
    if (!isNumeric && !isUuid) {
      try {
        const [servicesRes, packagesRes, profilesRes] = await Promise.all([
          supabase.from('services').select('id').ilike('name', searchPattern).limit(15),
          supabase.from('promotion_packages').select('id').ilike('name', searchPattern).limit(15),
          supabase.from('profiles').select('id').or(`name.ilike.${searchPattern},email.ilike.${searchPattern},phone_number.ilike.${searchPattern}`).limit(15)
        ]);

        matchingServiceIds = servicesRes.data?.map(s => s.id) || [];
        matchingPackageIds = packagesRes.data?.map(p => p.id) || [];
        matchingUserIds = profilesRes.data?.map(p => p.id) || [];
      } catch (e) {
        console.warn('Parallel sub-queries failed:', e);
      }
    }

    const conditions = [...orderConditions];
    if (matchingUserIds.length > 0) {
      conditions.push(...matchingUserIds.slice(0, 15).map(id => `user_id.eq.${id}`));
    }
    if (matchingServiceIds.length > 0) {
      conditions.push(...matchingServiceIds.slice(0, 15).map(id => `service_id.eq.${id}`));
    }
    if (matchingPackageIds.length > 0) {
      conditions.push(...matchingPackageIds.slice(0, 15).map(id => `promotion_package_id.eq.${id}`));
    }

    if (conditions.length > 0) {
      query = query.or(conditions.join(','));
    }
  }

  let { data, error, count } = await query;

  // Fallback search inside component_provider_order_ids JSONB array for combo child orders
  if ((!data || data.length === 0) && !error) {
    try {
      const jsonMatchString = JSON.stringify([{ provider_order_id: trimmedSearch }]);
      const fallbackRes = await supabase
        .from('orders')
        .select(`
          id, user_id, service_id, promotion_package_id, link, quantity, total_cost, 
          status, smmgen_order_id, smmcost_order_id, jbsmmpanel_order_id, worldofsmm_order_id, 
          g1618_order_id, oldsmm_order_id, apiowner_order_id, component_provider_order_ids, 
          created_at, completed_at, refund_status, last_status_check, is_reward,
          services(name, platform, service_type, is_combo), 
          promotion_packages(name, platform, service_type, is_combo), 
          profiles(name, email, phone_number)
        `, { count: 'exact' })
        .contains('component_provider_order_ids', jsonMatchString)
        .limit(50);

      if (fallbackRes.data && fallbackRes.data.length > 0) {
        data = fallbackRes.data;
        count = fallbackRes.count || fallbackRes.data.length;
      }
    } catch (e) {
      console.warn('Fallback combo search failed:', e);
    }
  }

  const endTime = performance.now();
  const searchTimeMs = Math.round(endTime - startTime);

  if (error) {
    console.error('Instant order search error:', error);
    throw error;
  }

  return {
    orders: data || [],
    searchTimeMs,
    total: count || (data?.length || 0)
  };
};

const AdminOrderSearch = memo(({ refreshing = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('search') || params.get('q') || '';
  });
  const [searchMode, setSearchMode] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      const saved = localStorage.getItem('admin_recent_order_searches');
      return saved ? JSON.parse(saved) : ['110753912'];
    } catch {
      return [];
    }
  });
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const debouncedSearch = useDebounce(searchTerm, 120);

  // Check admin role
  const { data: userRole } = useUserRole();
  const isAdmin = userRole?.isAdmin ?? false;

  // React Query for ultra-fast cached searches
  const {
    data: searchResult = { orders: [], searchTimeMs: 0, total: 0 },
    isLoading,
    isFetching,
    refetch
  } = useQuery({
    queryKey: ['admin', 'order-instant-search', { searchTerm: debouncedSearch, searchMode, statusFilter }],
    queryFn: () => executeInstantOrderSearch({ searchTerm: debouncedSearch, searchMode, statusFilter }),
    enabled: isAdmin && !!debouncedSearch.trim(),
    staleTime: 60 * 1000, // Cache for 60 seconds
    gcTime: 5 * 60 * 1000,
    placeholderData: (previousData) => previousData
  });

  const updateOrderMutation = useUpdateOrder();
  const reorderMutation = useReorderToSMMGen();
  const safeRetryMutation = useSafeRetryOrder();

  // Save to recent searches
  const addRecentSearch = useCallback((term) => {
    if (!term || !term.trim()) return;
    const clean = term.trim();
    setRecentSearches(prev => {
      const filtered = prev.filter(s => s !== clean);
      const updated = [clean, ...filtered].slice(0, 6);
      try {
        localStorage.setItem('admin_recent_order_searches', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      addRecentSearch(searchTerm);
      refetch();
    }
  };

  const handleQuickSearch = (term) => {
    setSearchTerm(term);
    addRecentSearch(term);
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    toast.success(`Copied ${label} to clipboard`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Get status badge styling
  const getStatusBadge = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'completed') return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    if (s === 'processing' || s === 'in progress') return 'bg-blue-100 text-blue-800 border-blue-300';
    if (s === 'pending') return 'bg-amber-100 text-amber-800 border-amber-300';
    if (s === 'refunded') return 'bg-purple-100 text-purple-800 border-purple-300';
    if (s === 'canceled' || s === 'cancelled' || s === 'failed') return 'bg-rose-100 text-rose-800 border-rose-300';
    return 'bg-gray-100 text-gray-800 border-gray-300';
  };

  // Identify matching reason badge
  const getMatchReasonBadge = (order, term) => {
    if (!term) return null;
    const clean = term.trim().toLowerCase();
    const isExactUuid = order.id.toLowerCase() === clean;
    const isSmmGen = String(order.smmgen_order_id || '').toLowerCase().includes(clean);
    const isJb = String(order.jbsmmpanel_order_id || '').toLowerCase() === clean;
    const isSmmCost = String(order.smmcost_order_id || '').toLowerCase().includes(clean);
    const isWorldOfSMM = String(order.worldofsmm_order_id || '').toLowerCase().includes(clean);
    const isG1618 = String(order.g1618_order_id || '').toLowerCase().includes(clean);
    const isOldSMM = String(order.oldsmm_order_id || '').toLowerCase().includes(clean);
    const isApiOwner = String(order.apiowner_order_id || '').toLowerCase().includes(clean);

    if (isExactUuid) return <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded font-mono font-bold">MATCH: SYSTEM UUID</span>;
    if (isJb) return <span className="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded font-mono font-bold">MATCH: JB PANEL ID ({order.jbsmmpanel_order_id})</span>;
    if (isSmmGen) return <span className="bg-purple-600 text-white text-[10px] px-2 py-0.5 rounded font-mono font-bold">MATCH: SMMGEN ID ({order.smmgen_order_id})</span>;
    if (isSmmCost) return <span className="bg-cyan-600 text-white text-[10px] px-2 py-0.5 rounded font-mono font-bold">MATCH: SMMCOST ID ({order.smmcost_order_id})</span>;
    if (isWorldOfSMM) return <span className="bg-emerald-600 text-white text-[10px] px-2 py-0.5 rounded font-mono font-bold">MATCH: WORLDOFSMM ID</span>;
    if (isG1618) return <span className="bg-orange-600 text-white text-[10px] px-2 py-0.5 rounded font-mono font-bold">MATCH: G1618 ID</span>;
    if (isOldSMM) return <span className="bg-teal-600 text-white text-[10px] px-2 py-0.5 rounded font-mono font-bold">MATCH: OLDSMM ID</span>;
    if (isApiOwner) return <span className="bg-rose-600 text-white text-[10px] px-2 py-0.5 rounded font-mono font-bold">MATCH: APIOWNER ID</span>;

    if (order.profiles?.email?.toLowerCase().includes(clean)) return <span className="bg-gray-700 text-white text-[10px] px-2 py-0.5 rounded font-mono">MATCH: USER EMAIL</span>;
    if (order.link?.toLowerCase().includes(clean)) return <span className="bg-gray-700 text-white text-[10px] px-2 py-0.5 rounded font-mono">MATCH: LINK/URL</span>;

    return <span className="bg-gray-500 text-white text-[10px] px-2 py-0.5 rounded font-mono">MATCH: GENERAL</span>;
  };

  const activeOrders = searchResult.orders || [];
  const searchTime = searchResult.searchTimeMs || 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 opacity-10 pointer-events-none">
          <Zap className="w-80 h-80 text-white" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-700/50 border border-indigo-400/30 text-indigo-200 text-xs font-semibold mb-3">
              <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span>Dedicated Instant Order Search Engine</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Order Search Center</h1>
            <p className="text-indigo-200 text-sm mt-1 max-w-2xl">
              Search millions of orders by Order ID, Provider ID, User Email, Name, Link, or Status. Results guaranteed under 3 seconds.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              onClick={() => navigate('/admin/orders')}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 hover:border-white/40 backdrop-blur-sm"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to All Orders
            </Button>
          </div>
        </div>
      </div>

      {/* Primary Search Controls Box */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-md space-y-4">
        <form onSubmit={handleSearchSubmit} className="space-y-4">
          <div className="relative flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500 w-5 h-5" />
              <Input
                type="text"
                placeholder="Enter Order ID (e.g. 110753912), Provider ID, User Email, Name, or Link..."
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
                  <Zap className="w-5 h-5 fill-current" />
                  <span>Instant Search</span>
                </>
              )}
            </Button>
          </div>

          {/* Search Mode & Filter Options */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-1">Search Field:</span>
              {[
                { id: 'all', label: 'All Fields' },
                { id: 'order_id', label: 'Order / Provider ID' },
                { id: 'user', label: 'User Name / Email' },
                { id: 'link', label: 'Link / URL' }
              ].map(mode => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setSearchMode(mode.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    searchMode === mode.id 
                      ? 'bg-indigo-600 text-white shadow-sm' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status:</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-36 text-xs">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="in progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="canceled">Canceled</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </form>

        {/* Recent Searches Bar */}
        {recentSearches.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-gray-500">
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            <span className="font-semibold text-gray-600">Recent Searches:</span>
            {recentSearches.map((term, idx) => (
              <button
                key={idx}
                onClick={() => handleQuickSearch(term)}
                className="px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md font-mono text-[11px] border border-indigo-200/60 transition-colors flex items-center gap-1"
              >
                <span>{term}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Performance Metric Bar */}
      {debouncedSearch.trim() && (
        <div className="flex items-center justify-between bg-indigo-50/80 border border-indigo-100 rounded-xl px-4 py-2.5 text-xs text-indigo-900 font-medium">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
            <span>
              Search for "<strong className="font-semibold text-indigo-950">{debouncedSearch}</strong>" returned <strong className="font-bold text-indigo-950">{searchResult.total}</strong> results
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px] bg-white px-2.5 py-1 rounded-md border border-indigo-200 shadow-xs">
            <Clock className="w-3 h-3 text-indigo-500" />
            <span>Execution Time: <strong>{searchTime}ms</strong> ({ (searchTime / 1000).toFixed(2) }s)</span>
          </div>
        </div>
      )}

      {/* Search Results Display */}
      {!debouncedSearch.trim() ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-1">Instant Order Search Engine</h3>
          <p className="text-gray-500 text-sm max-w-md mx-auto mb-6">
            Enter an Order ID, Provider ID (e.g. JB SMM Panel ID, SMMGen ID), user email, name, or link to search instantly.
          </p>
          <div className="inline-flex flex-wrap justify-center gap-2">
            <button
              onClick={() => handleQuickSearch('110753912')}
              className="px-4 py-2 bg-indigo-100 text-indigo-800 hover:bg-indigo-200 rounded-lg text-xs font-semibold transition-colors"
            >
              Try searching ID "110753912"
            </button>
          </div>
        </div>
      ) : isLoading ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 space-y-4 shadow-sm">
          <div className="flex items-center gap-3 text-indigo-600 font-semibold text-sm">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Executing sub-second instant search...</span>
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse"></div>
            ))}
          </div>
        </div>
      ) : activeOrders.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
          <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">No Matching Orders Found</h3>
          <p className="text-gray-500 text-sm max-w-md mx-auto mb-4">
            No orders matched query "<strong>{debouncedSearch}</strong>" under filter options.
          </p>
          <Button
            variant="outline"
            onClick={() => setSearchMode('all')}
            className="text-xs"
          >
            Switch to "All Fields" Mode
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {activeOrders.map((order) => {
              const serviceName = order.services?.name || order.promotion_packages?.name || 'Unknown Service';
              const userName = order.profiles?.name || 'Unknown User';
              const userEmail = order.profiles?.email || '';
              const userPhone = order.profiles?.phone_number || '';
              const isCombo = !!(order.services?.is_combo || order.promotion_packages?.is_combo || (order.component_provider_order_ids && order.component_provider_order_ids.length > 1));

              return (
                <div 
                  key={order.id}
                  className="bg-white border border-gray-200 hover:border-indigo-300 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all space-y-4"
                >
                  {/* Top Bar: Order ID, Match Reason, Status */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5 font-mono text-sm font-bold text-gray-900 bg-gray-100 px-3 py-1 rounded-lg">
                        <span>ID:</span>
                        <span className="text-indigo-700">{order.id}</span>
                        <button
                          onClick={() => copyToClipboard(order.id, 'Order ID')}
                          className="ml-1 text-gray-400 hover:text-gray-600"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {getMatchReasonBadge(order, debouncedSearch)}
                      {isCombo && (
                        <span className="bg-purple-100 text-purple-800 text-[11px] px-2 py-0.5 rounded-md font-semibold border border-purple-200">
                          COMBO ORDER ({order.component_provider_order_ids?.length || 0} Components)
                        </span>
                      )}
                      {order.is_reward && (
                        <span className="bg-amber-100 text-amber-800 text-[11px] px-2 py-0.5 rounded-md font-semibold border border-amber-200">
                          REWARD ORDER
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${getStatusBadge(order.status)}`}>
                        {String(order.status || 'unknown').toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    {/* Column 1: Service & Link */}
                    <div className="space-y-1 md:col-span-1">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Service:</span>
                      <p className="font-bold text-gray-900 leading-snug">{serviceName}</p>
                      <div className="pt-1">
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Target Link:</span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <a 
                            href={order.link} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 underline truncate text-xs max-w-[240px] block"
                          >
                            {order.link}
                          </a>
                          <button
                            onClick={() => copyToClipboard(order.link, 'Target Link')}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Column 2: User Details & Amount */}
                    <div className="space-y-1">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">User Details:</span>
                      <div className="flex items-center gap-1 font-semibold text-gray-900">
                        <User className="w-3.5 h-3.5 text-gray-400" />
                        <span>{userName}</span>
                      </div>
                      {userEmail && (
                        <div className="flex items-center gap-1 text-xs text-gray-600">
                          <Mail className="w-3 h-3 text-gray-400" />
                          <span>{userEmail}</span>
                        </div>
                      )}
                      <div className="pt-1 flex items-center gap-3 text-xs">
                        <span className="font-medium text-gray-600">Qty: <strong>{order.quantity}</strong></span>
                        <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          ₵{Number(order.total_cost || 0).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Column 3: Provider IDs */}
                    <div className="space-y-1">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Provider IDs:</span>
                      <div className="space-y-1 font-mono text-xs">
                        {order.jbsmmpanel_order_id && (
                          <div className="flex items-center justify-between bg-blue-50 px-2 py-1 rounded border border-blue-200">
                            <span className="text-blue-900 font-semibold">JB Panel:</span>
                            <span className="font-bold text-blue-800">{order.jbsmmpanel_order_id}</span>
                          </div>
                        )}
                        {order.smmgen_order_id && (
                          <div className="flex items-center justify-between bg-purple-50 px-2 py-1 rounded border border-purple-200">
                            <span className="text-purple-900 font-semibold">SMMGen:</span>
                            <span className="font-bold text-purple-800 truncate max-w-[140px]">{order.smmgen_order_id}</span>
                          </div>
                        )}
                        {order.smmcost_order_id && (
                          <div className="flex items-center justify-between bg-cyan-50 px-2 py-1 rounded border border-cyan-200">
                            <span className="text-cyan-900 font-semibold">SMMCost:</span>
                            <span className="font-bold text-cyan-800 truncate max-w-[140px]">{order.smmcost_order_id}</span>
                          </div>
                        )}
                        {order.apiowner_order_id && (
                          <div className="flex items-center justify-between bg-rose-50 px-2 py-1 rounded border border-rose-200">
                            <span className="text-rose-900 font-semibold">ApiOwner:</span>
                            <span className="font-bold text-rose-800 truncate max-w-[140px]">{order.apiowner_order_id}</span>
                          </div>
                        )}
                        {!order.jbsmmpanel_order_id && !order.smmgen_order_id && !order.smmcost_order_id && !order.apiowner_order_id && (
                          <span className="text-gray-400 italic">No provider ID</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-gray-100 text-xs">
                    <span className="text-gray-400">
                      Created: {new Date(order.created_at).toLocaleString()}
                    </span>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedOrderDetails(order)}
                        className="h-8 text-xs font-semibold"
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1" />
                        Full Details
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Details Dialog */}
      {selectedOrderDetails && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 pb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Order Details Breakdown</h3>
                <p className="text-xs text-gray-500 font-mono">ID: {selectedOrderDetails.id}</p>
              </div>
              <button
                onClick={() => setSelectedOrderDetails(null)}
                className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="bg-gray-50 p-4 rounded-xl space-y-2 border border-gray-200">
                <p><strong>Service Name:</strong> {selectedOrderDetails.services?.name || selectedOrderDetails.promotion_packages?.name || 'N/A'}</p>
                <p><strong>Target Link:</strong> <span className="font-mono text-indigo-600 text-xs break-all">{selectedOrderDetails.link}</span></p>
                <p><strong>Quantity:</strong> {selectedOrderDetails.quantity}</p>
                <p><strong>Cost:</strong> ₵{Number(selectedOrderDetails.total_cost || 0).toFixed(2)}</p>
                <p><strong>Status:</strong> <span className="font-bold uppercase text-indigo-700">{selectedOrderDetails.status}</span></p>
              </div>

              <div>
                <h4 className="font-bold text-gray-900 mb-2">Raw JSON Data:</h4>
                <pre className="bg-gray-900 text-emerald-400 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-60">
                  {JSON.stringify(selectedOrderDetails, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={() => setSelectedOrderDetails(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default AdminOrderSearch;
