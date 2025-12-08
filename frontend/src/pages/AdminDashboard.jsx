import React, { useState, useMemo, useCallback, lazy, Suspense, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SEO from '@/components/SEO';
import { 
  Users, ShoppingCart, DollarSign, Package, Wallet, Receipt, 
  MessageSquare, UserPlus, RefreshCw, BarChart3
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
const AdminTickets = lazy(() => import('@/pages/admin/AdminTickets'));
const AdminReferrals = lazy(() => import('@/pages/admin/AdminReferrals'));
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings'));
const AdminBalanceCheck = lazy(() => import('@/pages/admin/AdminBalanceCheck'));

// Loading fallback component
const ComponentLoader = () => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-600"></div>
  </div>
);

const AdminDashboard = memo(({ user, onLogout }) => {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState('dashboard');
  const [dateRangeStart, setDateRangeStart] = useState('');
  const [dateRangeEnd, setDateRangeEnd] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [balanceCheckResults, setBalanceCheckResults] = useState({});
  const [manuallyCrediting, setManuallyCrediting] = useState(null);

  // Fetch payment method settings
  const { data: paymentMethodSettings = {
    paystack_enabled: true,
    manual_enabled: true,
    hubtel_enabled: true,
    korapay_enabled: true
  } } = useQuery({
    queryKey: ['admin', 'payment-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', [
          'payment_method_paystack_enabled',
          'payment_method_manual_enabled',
          'payment_method_hubtel_enabled',
          'payment_method_korapay_enabled'
        ]);

      if (error && error.code !== '42P01') {
        console.error('Error fetching payment settings:', error);
      }

      const settings = {
        paystack_enabled: true,
        manual_enabled: true,
        hubtel_enabled: true,
        korapay_enabled: true
      };

      if (data) {
        data.forEach(setting => {
          if (setting.key === 'payment_method_paystack_enabled') {
            settings.paystack_enabled = setting.value !== 'false';
          } else if (setting.key === 'payment_method_manual_enabled') {
            settings.manual_enabled = setting.value !== 'false';
          } else if (setting.key === 'payment_method_hubtel_enabled') {
            settings.hubtel_enabled = setting.value !== 'false';
          } else if (setting.key === 'payment_method_korapay_enabled') {
            settings.korapay_enabled = setting.value !== 'false';
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

  // Memoized section change handler
  const handleSectionChange = useCallback((section) => {
    setActiveSection(section);
  }, []);

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
  }, [queryClient]);

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

  // Get stats for open tickets badge
  const { data: stats = {} } = useQuery({
    queryKey: ['admin', 'stats', 'tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('status')
        .eq('status', 'open');

      if (error && error.code !== '42P01') {
        console.error('Error fetching ticket stats:', error);
        return { open_tickets: 0 };
      }

      return { open_tickets: data?.length || 0 };
    },
    staleTime: 1 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  return (
    <>
      <SEO 
        title="Admin Dashboard" 
        description="Manage users, orders, services, and platform settings"
      />
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Sidebar Navigation - Desktop */}
            <div className="hidden lg:flex lg:flex-col lg:w-64 lg:flex-shrink-0">
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 flex flex-col sticky top-6 max-h-[calc(100vh-4.5rem)] overflow-y-auto">
                <div className="mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Admin Panel</h2>
                  <nav className="space-y-1">
                    <button
                      onClick={() => handleSectionChange('dashboard')}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                        activeSection === 'dashboard'
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <BarChart3 className="w-5 h-5" />
                      <span className="font-medium text-sm">Dashboard</span>
                    </button>
                    <button
                      onClick={() => handleSectionChange('deposits')}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                        activeSection === 'deposits'
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <DollarSign className="w-5 h-5" />
                      <span className="font-medium text-sm">Deposits</span>
                    </button>
                    <button
                      onClick={() => handleSectionChange('orders')}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                        activeSection === 'orders'
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <ShoppingCart className="w-5 h-5" />
                      <span className="font-medium text-sm">Orders</span>
                    </button>
                    <button
                      onClick={() => handleSectionChange('services')}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                        activeSection === 'services'
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Package className="w-5 h-5" />
                      <span className="font-medium text-sm">Services</span>
                    </button>
                    <button
                      onClick={() => handleSectionChange('payment-methods')}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                        activeSection === 'payment-methods'
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Wallet className="w-5 h-5" />
                      <span className="font-medium text-sm">Payment Methods</span>
                    </button>
                    <button
                      onClick={() => handleSectionChange('users')}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                        activeSection === 'users'
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Users className="w-5 h-5" />
                      <span className="font-medium text-sm">Users</span>
                    </button>
                    <button
                      onClick={() => handleSectionChange('transactions')}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                        activeSection === 'transactions'
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Receipt className="w-5 h-5" />
                      <span className="font-medium text-sm">Transactions</span>
                    </button>
                    <button
                      onClick={() => handleSectionChange('support')}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                        activeSection === 'support'
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <MessageSquare className="w-5 h-5" />
                      <span className="font-medium text-sm">Support</span>
                      {stats.open_tickets > 0 && (
                        <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                          {stats.open_tickets}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => handleSectionChange('balance')}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                        activeSection === 'balance'
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Wallet className="w-5 h-5" />
                      <span className="font-medium text-sm">Balance</span>
                    </button>
                    <button
                      onClick={() => handleSectionChange('referrals')}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                        activeSection === 'referrals'
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <UserPlus className="w-5 h-5" />
                      <span className="font-medium text-sm">Referrals</span>
                    </button>
                  </nav>
                </div>
                
                {/* User Info at Bottom */}
                <div className="mt-auto pt-4 border-t border-gray-200">
                  <div className="px-3 py-3 space-y-2">
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
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs Navigation - Mobile */}
            <Tabs value={activeSection} onValueChange={setActiveSection} className="w-full">
              <TabsList className="bg-white border border-gray-200 mb-6 flex-wrap w-full lg:hidden shadow-sm">
                <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                <TabsTrigger value="deposits">Deposits</TabsTrigger>
                <TabsTrigger value="orders">Orders</TabsTrigger>
                <TabsTrigger value="services">Services</TabsTrigger>
                <TabsTrigger value="payment-methods">Payment Methods</TabsTrigger>
                <TabsTrigger value="users">Users</TabsTrigger>
                <TabsTrigger value="transactions">Transactions</TabsTrigger>
                <TabsTrigger value="support">
                  Support {stats.open_tickets > 0 && <span className="ml-1 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{stats.open_tickets}</span>}
                </TabsTrigger>
                <TabsTrigger value="balance">Balance</TabsTrigger>
                <TabsTrigger value="referrals">Referrals</TabsTrigger>
              </TabsList>

              {/* Content Area */}
              <div className="flex-1 min-w-0">
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
                <TabsContent value="deposits" className="lg:mt-0">
                  <Suspense fallback={<ComponentLoader />}>
                    <AdminDeposits onRefresh={handleRefresh} refreshing={refreshing} />
                  </Suspense>
                </TabsContent>

                {/* Orders Section */}
                <TabsContent value="orders" className="lg:mt-0">
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

                {/* Users Section */}
                <TabsContent value="users" className="lg:mt-0">
                  <Suspense fallback={<ComponentLoader />}>
                    <AdminUsers onRefresh={handleRefresh} refreshing={refreshing} />
                  </Suspense>
                </TabsContent>

                {/* Transactions Section */}
                <TabsContent value="transactions" className="lg:mt-0">
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
                <TabsContent value="support" className="lg:mt-0">
                  <Suspense fallback={<ComponentLoader />}>
                    <AdminTickets />
                  </Suspense>
                </TabsContent>

                {/* Balance Section */}
                <TabsContent value="balance" className="lg:mt-0">
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
