import React, { useState, useMemo, useCallback, useEffect, lazy, Suspense, memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import SEO from '@/components/SEO';
import { 
  Users, ShoppingCart, DollarSign, Package, Wallet, Receipt, 
  MessageSquare, UserPlus, RefreshCw, BarChart3, Menu, X, LayoutDashboard, Tag,
  ChevronLeft, ChevronRight, FileText, Server, HelpCircle, CreditCard
} from 'lucide-react';
import { useAdminOrders } from '@/hooks/useAdminOrders';
import { useAdminDeposits } from '@/hooks/useAdminDeposits';
import { useAdminTransactions } from '@/hooks/useAdminTransactions';
import { useReferralStats } from '@/hooks/useAdminReferrals';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// Lazy load all admin components
const AdminStats = lazy(() => import('@/pages/admin/AdminStats'));
const AdminUsers = lazy(() => import('@/pages/admin/AdminUsers'));
const AdminOrders = lazy(() => import('@/pages/admin/AdminOrders'));
const AdminDeposits = lazy(() => import('@/pages/admin/AdminDeposits'));
const AdminTransactions = lazy(() => import('@/pages/admin/AdminTransactions'));
const AdminServices = lazy(() => import('@/pages/admin/AdminServices'));
const AdminPromotionPackages = lazy(() => import('@/pages/admin/AdminPromotionPackages'));
const AdminSupport = lazy(() => import('@/pages/admin/AdminSupport'));
const AdminReferrals = lazy(() => import('@/pages/admin/AdminReferrals'));
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings'));
const AdminBalanceCheck = lazy(() => import('@/pages/admin/AdminBalanceCheck'));
const AdminActivityLogs = lazy(() => import('@/pages/admin/AdminActivityLogs'));
const AdminSMMCost = lazy(() => import('@/pages/admin/AdminSMMCost'));
const AdminSMMGen = lazy(() => import('@/pages/admin/AdminSMMGen'));
const AdminMoolre = lazy(() => import('@/pages/admin/AdminMoolre'));
const AdminFAQ = lazy(() => import('@/pages/admin/AdminFAQ'));

// Loading fallback component
const ComponentLoader = () => (
  <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
    <div className="space-y-4">
      <div className="h-8 bg-gray-200 rounded animate-pulse w-1/3"></div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-24 bg-gray-200 rounded animate-pulse"></div>
        ))}
      </div>
    </div>
  </div>
);

const AdminDashboard = memo(({ user, onLogout }) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get active section from URL pathname
  const activeSection = useMemo(() => {
    const path = location.pathname;
    if (path.startsWith('/admin/')) {
      const section = path.replace('/admin/', '');
      // Map URL paths to section IDs
      const sectionMap = {
        'dashboard': 'dashboard',
        'deposits': 'deposits',
        'orders': 'orders',
        'services': 'services',
        'promotion-packages': 'promotion-packages',
        'payment-methods': 'payment-methods',
        'users': 'users',
        'transactions': 'transactions',
        'support': 'support',
        'balance': 'balance',
        'referrals': 'referrals',
        'activity-logs': 'activity-logs',
        'smmcost': 'smmcost',
        'smmgen': 'smmgen',
        'moolre': 'moolre',
        'faq': 'faq'
      };
      return sectionMap[section] || 'dashboard';
    }
    return 'dashboard';
  }, [location.pathname]);
  
  const [dateRangeStart, setDateRangeStart] = useState('');
  const [dateRangeEnd, setDateRangeEnd] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [balanceCheckResults, setBalanceCheckResults] = useState({});
  const [manuallyCrediting, setManuallyCrediting] = useState(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Fetch payment method settings
  const { data: paymentMethodSettings = {
    paystack_enabled: false,
    manual_enabled: false,
    hubtel_enabled: false,
    korapay_enabled: false,
    moolre_enabled: false,
    moolre_web_enabled: false
  }, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['admin', 'payment-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', [
          'payment_method_paystack_enabled',
          'payment_method_manual_enabled',
          'payment_method_hubtel_enabled',
          'payment_method_korapay_enabled',
          'payment_method_moolre_enabled',
          'payment_method_moolre_web_enabled'
        ]);

      if (error && error.code !== '42P01') {
        console.error('Error fetching payment settings:', error);
      }

      const settings = {
        paystack_enabled: false,
        manual_enabled: false,
        hubtel_enabled: false,
        korapay_enabled: false,
        moolre_enabled: false,
        moolre_web_enabled: false
      };

      if (data) {
        data.forEach(setting => {
          if (setting.key === 'payment_method_paystack_enabled') {
            settings.paystack_enabled = setting.value === 'true';
          } else if (setting.key === 'payment_method_manual_enabled') {
            settings.manual_enabled = setting.value === 'true';
          } else if (setting.key === 'payment_method_hubtel_enabled') {
            settings.hubtel_enabled = setting.value === 'true';
          } else if (setting.key === 'payment_method_korapay_enabled') {
            settings.korapay_enabled = setting.value === 'true';
          } else if (setting.key === 'payment_method_moolre_enabled') {
            settings.moolre_enabled = setting.value === 'true';
          } else if (setting.key === 'payment_method_moolre_web_enabled') {
            settings.moolre_web_enabled = setting.value === 'true';
          }
        });
      }

      return settings;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Fetch data for AdminStats (minimal data needed)
  const { data: ordersData } = useAdminOrders({ 
    enabled: activeSection === 'dashboard',
    useInfinite: false 
  });
  const { data: depositsData } = useAdminDeposits({ 
    enabled: activeSection === 'dashboard',
    useInfinite: false 
  });
  const { data: transactionsData } = useAdminTransactions({ 
    enabled: activeSection === 'dashboard',
    useInfinite: false 
  });
  const { data: referralStats = { total_referrals: 0, pending_bonuses: 0 } } = useReferralStats();

  const orders = useMemo(() => ordersData || [], [ordersData]);
  const deposits = useMemo(() => depositsData || [], [depositsData]);
  const allTransactions = useMemo(() => transactionsData || [], [transactionsData]);

  // Memoized section change handler - now uses URL navigation
  const handleSectionChange = useCallback((section) => {
    navigate(`/admin/${section}`);
    setMobileNavOpen(false); // Close mobile nav when section changes
  }, [navigate]);

  // Balance check result function
  const getBalanceCheckResult = useCallback((transaction) => {
    if (!transaction || !transaction.id) return null;
    return balanceCheckResults[transaction.id] || null;
  }, [balanceCheckResults]);

  // Manual credit handler
  const handleManualCredit = useCallback(async (transaction) => {
    if (!transaction || !transaction.user_id) return;

    setManuallyCrediting(transaction.id);
    try {
      // Get user's current balance
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('balance')
        .eq('id', transaction.user_id)
        .single();

      if (profileError) throw profileError;

      const currentBalance = parseFloat(profile.balance) || 0;
      const creditAmount = parseFloat(transaction.amount) || 0;
      const newBalance = currentBalance + creditAmount;

      // Update user balance
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', transaction.user_id);

      if (updateError) throw updateError;

      // Create transaction record for manual adjustment
      const { createManualAdjustmentTransaction } = await import('@/lib/transactionHelpers');
      await createManualAdjustmentTransaction(
        transaction.user_id,
        creditAmount,
        user?.id || null,
        `Manual balance credit for deposit transaction ${transaction.id}`
      );

      // Mark transaction as balance updated
      setBalanceCheckResults(prev => ({
        ...prev,
        [transaction.id]: 'updated'
      }));

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['admin', 'transactions'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    } catch (error) {
      console.error('Error crediting balance:', error);
    } finally {
      setManuallyCrediting(null);
    }
  }, [queryClient, user]);

  // Refresh handler
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin'] }),
        queryClient.refetchQueries({ queryKey: ['admin'] })
      ]);
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  // Get stats for unread conversations badge and pending deposits
  const { data: stats = {}, isLoading: isLoadingStats } = useQuery({
    queryKey: ['admin', 'stats', 'conversations'],
    queryFn: async () => {
      // Get current admin user ID first
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        // If no user, return 0 for unread conversations but still get deposits
        const depositsResult = await supabase
          .from('transactions')
          .select('status')
          .eq('type', 'deposit')
          .eq('status', 'pending');
        
        const pendingDeposits = depositsResult.error && depositsResult.error.code !== '42P01'
          ? 0
          : (depositsResult.data?.length || 0);
        
        return { open_tickets: 0, pending_deposits: pendingDeposits };
      }

      // Count distinct conversations with unread messages
      const [unreadMessagesResult, depositsResult] = await Promise.all([
        supabase
          .from('messages')
          .select('conversation_id')
          .is('read_at', null)
          .neq('sender_id', user.id),
        supabase
          .from('transactions')
          .select('status')
          .eq('type', 'deposit')
          .eq('status', 'pending')
      ]);

      // Count unique conversations with unread messages (not total message count)
      const unreadConversationIds = unreadMessagesResult.error && unreadMessagesResult.error.code !== '42P01'
        ? []
        : [...new Set((unreadMessagesResult.data || []).map(m => m.conversation_id).filter(Boolean))];
      
      const openTickets = unreadConversationIds.length;
      
      const pendingDeposits = depositsResult.error && depositsResult.error.code !== '42P01'
        ? 0
        : (depositsResult.data?.length || 0);

      return { open_tickets: openTickets, pending_deposits: pendingDeposits };
    },
    staleTime: 1 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  // Section titles mapping
  const sectionTitles = {
    dashboard: 'Dashboard',
    deposits: 'Deposits',
    orders: 'Orders',
    services: 'Services',
    'promotion-packages': 'Promotion Packages',
    'payment-methods': 'Payment Methods',
    users: 'Users',
    transactions: 'Transactions',
    support: 'Support',
    balance: 'Balance Check',
    faq: 'FAQ Management',
    referrals: 'Referrals',
    'activity-logs': 'Activity Logs',
    smmcost: 'SMMCost Integration',
    smmgen: 'SMMGen Integration',
    moolre: 'Moolre Transactions'
  };

  // Navigation items configuration
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'deposits', label: 'Deposits', icon: DollarSign, badge: stats.pending_deposits },
    { id: 'orders', label: 'Orders', icon: ShoppingCart },
    { id: 'services', label: 'Services', icon: Package },
    { id: 'promotion-packages', label: 'Promotion Packages', icon: Tag },
    { id: 'payment-methods', label: 'Payment Methods', icon: Wallet },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'transactions', label: 'Transactions', icon: Receipt },
    { id: 'support', label: 'Support', icon: MessageSquare, badge: stats.open_tickets },
    { id: 'balance', label: 'Balance', icon: Wallet },
    { id: 'referrals', label: 'Referrals', icon: UserPlus },
    { id: 'activity-logs', label: 'Activity Logs', icon: FileText },
    { id: 'faq', label: 'FAQ', icon: HelpCircle },
    { id: 'smmcost', label: 'SMMCost', icon: Server },
    { id: 'smmgen', label: 'SMMGen', icon: Server },
    { id: 'moolre', label: 'Moolre', icon: CreditCard },
  ];

  // Show skeleton loader while initial data is loading
  if (isLoadingSettings || isLoadingStats) {
    return (
      <>
        <SEO 
          title="Admin Dashboard" 
          description="Manage users, orders, services, and platform settings"
        />
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
          {/* Mobile Header Skeleton */}
          <div className="fixed top-0 left-0 right-0 z-40 lg:hidden bg-white border-b border-gray-200 shadow-sm">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-6 w-16 bg-gray-200 rounded-full animate-pulse"></div>
                <div className="h-11 w-11 bg-gray-200 rounded animate-pulse"></div>
              </div>
            </div>
          </div>

          <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 pt-20 md:pt-6 sm:py-8">
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Desktop Sidebar Skeleton */}
              <div className="hidden lg:flex lg:flex-col lg:w-64 lg:flex-shrink-0">
                <div className="bg-white border-r border-gray-200 h-screen fixed left-0 top-0 p-4">
                  <div className="h-6 w-32 bg-gray-200 rounded animate-pulse mb-4"></div>
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
                      <div key={i} className="h-10 bg-gray-200 rounded animate-pulse"></div>
                    ))}
                  </div>
                  <div className="mt-auto pt-4 border-t border-gray-200 space-y-2">
                    <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 w-32 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-9 w-full bg-gray-200 rounded animate-pulse"></div>
                  </div>
                </div>
              </div>

              {/* Content Area Skeleton */}
              <div className="flex-1 min-w-0">
                <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
                  <div className="space-y-4">
                    <div className="h-8 bg-gray-200 rounded animate-pulse w-1/3"></div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="h-24 bg-gray-200 rounded animate-pulse"></div>
                      ))}
                    </div>
                    <div className="h-12 bg-gray-200 rounded animate-pulse"></div>
                    <div className="space-y-2">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="h-20 bg-gray-200 rounded animate-pulse"></div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SEO 
        title="Admin Dashboard" 
        description="Manage users, orders, services, and platform settings"
      />
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 overflow-x-hidden">
        {/* Sticky Header - Mobile */}
        <div className="fixed top-0 left-0 right-0 z-40 lg:hidden bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-11 w-11">
                    <Menu className="h-6 w-6" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-80 p-0">
                  <div className="flex flex-col h-full">
                    <div className="p-4 border-b border-gray-200">
                      <h2 className="text-xl font-bold text-gray-900">Admin Panel</h2>
                    </div>
                    <nav className="flex-1 overflow-y-auto p-4 space-y-1">
                      <SheetClose asChild>
                        <button
                          onClick={() => navigate('/dashboard')}
                          className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors duration-200 text-gray-700 hover:bg-gray-100 mb-2"
                        >
                          <LayoutDashboard className="w-5 h-5" />
                          <span className="font-medium text-sm flex-1">User Dashboard</span>
                        </button>
                      </SheetClose>
                      {navItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <SheetClose key={item.id} asChild>
                            <button
                              onClick={() => handleSectionChange(item.id)}
                              className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors duration-200 ${
                                activeSection === item.id
                                  ? 'bg-indigo-600 text-white'
                                  : 'text-gray-700 hover:bg-gray-100'
                              }`}
                            >
                              <Icon className="w-5 h-5" />
                              <span className="font-medium text-sm flex-1">{item.label}</span>
                              {item.badge > 0 && (
                                <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                                  {item.badge}
                                </span>
                              )}
                            </button>
                          </SheetClose>
                        );
                      })}
                    </nav>
                    <div className="p-4 border-t border-gray-200 space-y-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 truncate">{user?.name || 'Admin'}</p>
                        <p className="text-xs text-gray-600 truncate">{user?.email || ''}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">Balance:</span>
                        <span className="text-sm font-semibold text-indigo-600">₵{user?.balance?.toFixed(2) || '0.00'}</span>
                      </div>
                      <SheetClose asChild>
                        <Button
                          onClick={onLogout}
                          variant="outline"
                          size="sm"
                          className="w-full h-11 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                        >
                          Logout
                        </Button>
                      </SheetClose>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
              <h1 className="text-lg font-bold text-gray-900">{sectionTitles[activeSection] || 'Admin'}</h1>
            </div>
            <div className="flex items-center gap-2">
              {stats.pending_deposits > 0 && (
                <span className="bg-yellow-500 text-white text-xs px-2 py-1 rounded-full">
                  {stats.pending_deposits} Pending
                </span>
              )}
              {stats.open_tickets > 0 && (
                <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                  {stats.open_tickets} Tickets
                </span>
              )}
              <Button
                onClick={handleRefresh}
                disabled={refreshing}
                variant="outline"
                size="icon"
                className="h-11 w-11"
              >
                <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 pt-20 md:pt-6 sm:py-8 overflow-x-hidden">
          <div className="flex flex-col lg:flex-row gap-6 w-full">
            {/* Sidebar Navigation - Desktop */}
            <aside 
              className={`hidden lg:flex lg:flex-col lg:flex-shrink-0 bg-white border-r border-gray-200 fixed left-0 top-0 h-screen transition-all duration-300 ease-in-out z-30 ${
                sidebarCollapsed ? 'w-16' : 'w-64'
              }`}
            >
              <div className="flex flex-col h-full overflow-y-auto">
                {/* Header with Toggle */}
                <div className={`flex items-center p-4 border-b border-gray-200 ${
                  sidebarCollapsed ? 'justify-center' : 'justify-between'
                }`}>
                  {!sidebarCollapsed && (
                    <h2 className="text-xl font-bold text-gray-900">Admin Panel</h2>
                  )}
                  <button
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    className={`p-1.5 rounded-md hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      sidebarCollapsed ? '' : 'ml-auto'
                    }`}
                    aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  >
                    {sidebarCollapsed ? (
                      <ChevronRight className="w-5 h-5 text-gray-600" />
                    ) : (
                      <ChevronLeft className="w-5 h-5 text-gray-600" />
                    )}
                  </button>
                </div>

                {/* Navigation Content */}
                <div className="flex-1 flex flex-col p-4">
                  <div className="mb-6">
                    <button
                      onClick={() => navigate('/dashboard')}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 text-gray-700 hover:bg-gray-100 mb-2 ${
                        sidebarCollapsed ? 'justify-center' : ''
                      }`}
                      title={sidebarCollapsed ? 'User Dashboard' : ''}
                    >
                      <LayoutDashboard className="w-5 h-5 flex-shrink-0" />
                      {!sidebarCollapsed && (
                        <span className="font-medium text-sm flex-1">User Dashboard</span>
                      )}
                    </button>
                    <nav className="space-y-1">
                      {navItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.id}
                            onClick={() => handleSectionChange(item.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 relative ${
                              activeSection === item.id
                                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                : 'text-gray-700 hover:bg-gray-100'
                            } ${sidebarCollapsed ? 'justify-center' : ''}`}
                            title={sidebarCollapsed ? item.label : ''}
                          >
                            <Icon className="w-5 h-5 flex-shrink-0" />
                            {!sidebarCollapsed && (
                              <>
                                <span className="font-medium text-sm flex-1">{item.label}</span>
                                {item.badge > 0 && (
                                  <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                                    {item.badge}
                                  </span>
                                )}
                              </>
                            )}
                            {sidebarCollapsed && item.badge > 0 && (
                              <span className="absolute right-1 top-1 bg-red-500 text-white text-[10px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">
                                {item.badge > 9 ? '9+' : item.badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </nav>
                  </div>
                  
                  {/* User Info at Bottom */}
                  <div className="mt-auto pt-4 border-t border-gray-200">
                    <div className={`px-3 py-3 space-y-2 ${sidebarCollapsed ? 'flex flex-col items-center' : ''}`}>
                      {!sidebarCollapsed ? (
                        <>
                          <div>
                            <p className="text-sm font-semibold text-gray-900 truncate">{user?.name || 'Admin'}</p>
                            <p className="text-xs text-gray-600 truncate">{user?.email || ''}</p>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-500">Balance:</span>
                            <span className="text-sm font-semibold text-indigo-600">₵{user?.balance?.toFixed(2) || '0.00'}</span>
                          </div>
                          <Button
                            onClick={onLogout}
                            variant="outline"
                            size="sm"
                            className="w-full mt-2 h-9 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                          >
                            <span className="text-xs">Logout</span>
                          </Button>
                        </>
                      ) : (
                        <Button
                          onClick={onLogout}
                          variant="outline"
                          size="sm"
                          className="w-full h-9 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                          title="Logout"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </aside>

            {/* Spacer for fixed sidebar */}
            <div className={`hidden lg:block flex-shrink-0 transition-all duration-300 ease-in-out ${
              sidebarCollapsed ? 'w-16' : 'w-64'
            }`}></div>

            {/* Content Area */}
            <Tabs 
              value={activeSection} 
              onValueChange={(value) => {
                navigate(`/admin/${value}`);
              }} 
              className="flex-1 min-w-0"
            >
              <div className="w-full">
                {/* Dashboard Section */}
                <TabsContent value="dashboard" className="lg:mt-0">
                  <Suspense fallback={<ComponentLoader />}>
                    <AdminStats
                      dateRangeStart={dateRangeStart}
                      dateRangeEnd={dateRangeEnd}
                      referralStats={referralStats}
                      orders={orders}
                      deposits={deposits}
                      allTransactions={allTransactions}
                      getBalanceCheckResult={getBalanceCheckResult}
                      onSectionChange={handleSectionChange}
                      paymentMethodSettings={paymentMethodSettings}
                    />
                  </Suspense>
                </TabsContent>

                {/* Deposits Section */}
                <TabsContent value="deposits" className="lg:mt-0 w-full max-w-full">
                  <Suspense fallback={<ComponentLoader />}>
                    <AdminDeposits onRefresh={handleRefresh} refreshing={refreshing} />
                  </Suspense>
                </TabsContent>

                {/* Orders Section */}
                <TabsContent value="orders" className="lg:mt-0 w-full max-w-full">
                  <Suspense fallback={<ComponentLoader />}>
                    <AdminOrders onRefresh={handleRefresh} refreshing={refreshing} />
                  </Suspense>
                </TabsContent>

                {/* Payment Methods Section */}
                <TabsContent value="payment-methods" className="lg:mt-0">
                  <Suspense fallback={<ComponentLoader />}>
                    <AdminSettings />
                  </Suspense>
                </TabsContent>

                {/* Services Section */}
                <TabsContent value="services" className="lg:mt-0">
                  <Suspense fallback={<ComponentLoader />}>
                    <AdminServices />
                  </Suspense>
                </TabsContent>

                {/* Promotion Packages Section */}
                <TabsContent value="promotion-packages" className="lg:mt-0">
                  <Suspense fallback={<ComponentLoader />}>
                    <AdminPromotionPackages />
                  </Suspense>
                </TabsContent>

                {/* Users Section */}
                <TabsContent value="users" className="lg:mt-0 w-full max-w-full">
                  <Suspense fallback={<ComponentLoader />}>
                    <AdminUsers onRefresh={handleRefresh} refreshing={refreshing} />
                  </Suspense>
                </TabsContent>

                {/* Transactions Section */}
                <TabsContent value="transactions" className="lg:mt-0 w-full max-w-full">
                  <Suspense fallback={<ComponentLoader />}>
                    <AdminTransactions
                      onRefresh={handleRefresh}
                      refreshing={refreshing}
                      getBalanceCheckResult={getBalanceCheckResult}
                      onManualCredit={handleManualCredit}
                    />
                  </Suspense>
                </TabsContent>

                {/* Support Section */}
                <TabsContent value="support" className="lg:mt-0 w-full max-w-full">
                  <Suspense fallback={<ComponentLoader />}>
                    <AdminSupport />
                  </Suspense>
                </TabsContent>

                {/* Balance Section */}
                <TabsContent value="balance" className="lg:mt-0 w-full max-w-full">
                  <Suspense fallback={<ComponentLoader />}>
                    <AdminBalanceCheck />
                  </Suspense>
                </TabsContent>

                {/* Referrals Section */}
                <TabsContent value="referrals" className="lg:mt-0">
                  <Suspense fallback={<ComponentLoader />}>
                    <AdminReferrals />
                  </Suspense>
                </TabsContent>

                {/* SMMCost Section */}
                <TabsContent value="smmcost" className="lg:mt-0">
                  <Suspense fallback={<ComponentLoader />}>
                    <AdminSMMCost />
                  </Suspense>
                </TabsContent>

                {/* SMMGen Section */}
                <TabsContent value="smmgen" className="lg:mt-0">
                  <Suspense fallback={<ComponentLoader />}>
                    <AdminSMMGen />
                  </Suspense>
                </TabsContent>

                {/* Moolre Section */}
                <TabsContent value="moolre" className="lg:mt-0 w-full max-w-full">
                  <Suspense fallback={<ComponentLoader />}>
                    <AdminMoolre />
                  </Suspense>
                </TabsContent>

                {/* Activity Logs Section */}
                <TabsContent value="activity-logs" className="lg:mt-0 w-full max-w-full">
                  <Suspense fallback={<ComponentLoader />}>
                    <AdminActivityLogs onRefresh={handleRefresh} refreshing={refreshing} />
                  </Suspense>
                </TabsContent>

                {/* FAQ Section */}
                <TabsContent value="faq" className="lg:mt-0 w-full max-w-full">
                  <Suspense fallback={<ComponentLoader />}>
                    <AdminFAQ />
                  </Suspense>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>
      </div>
    </>
  );
});

AdminDashboard.displayName = 'AdminDashboard';

export default AdminDashboard;
