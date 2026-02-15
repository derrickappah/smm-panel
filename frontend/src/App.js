import { useState, useEffect, lazy, Suspense } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { QueryClientProvider } from "@tanstack/react-query";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Analytics } from "@vercel/analytics/react";
import SupabaseSetup from "@/components/SupabaseSetup";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import WhatsAppButton from "@/components/WhatsAppButton";
import { supabase, isConfigured } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { prefetchPaymentSettings } from "@/hooks/usePaymentMethods";
import * as serviceWorkerRegistration from "./serviceWorkerRegistration";

// Lazy load all page components for code splitting
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const AuthPage = lazy(() => import("@/pages/AuthPage"));
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const ServicesPage = lazy(() => import("@/pages/ServicesPage"));
const OrderHistory = lazy(() => import("@/pages/OrderHistory"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const SupportPage = lazy(() => import("@/pages/SupportPage"));
const AdminSupport = lazy(() => import("@/pages/admin/AdminSupport"));
const AdminSupportAnalytics = lazy(() => import("@/pages/admin/AdminSupportAnalytics"));
const TransactionsPage = lazy(() => import("@/pages/TransactionsPage"));
const PaymentCallback = lazy(() => import("@/pages/PaymentCallback"));
const ServiceLandingPage = lazy(() => import("@/pages/ServiceLandingPage"));
const PlatformLandingPage = lazy(() => import("@/pages/PlatformLandingPage"));
const BlogListPage = lazy(() => import("@/pages/blog/BlogListPage"));
const BlogPostPage = lazy(() => import("@/pages/blog/BlogPostPage"));
const GuidePage = lazy(() => import("@/pages/guides/GuidePage"));
const AboutPage = lazy(() => import("@/pages/AboutPage"));
const PricingPage = lazy(() => import("@/pages/PricingPage"));
const TermsPage = lazy(() => import("@/pages/TermsPage"));
const FAQPage = lazy(() => import("@/pages/FAQPage"));
const DevDashboard = lazy(() => import("@/pages/admin/DevDashboard"));

// Loading fallback component - Skeleton loader
const PageLoader = () => (
  <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 rounded animate-pulse w-1/3"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-lg animate-pulse"></div>
          ))}
        </div>
        <div className="h-12 bg-gray-200 rounded animate-pulse"></div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-gray-200 rounded animate-pulse"></div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Pre-fetch payment settings as early as possible
    prefetchPaymentSettings();

    // Skip if Supabase is not configured
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadUserProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.id);

      // Handle password recovery event
      if (event === 'PASSWORD_RECOVERY') {
        // Supabase has already extracted tokens from URL hash
        // Ensure user is on reset password page
        if (window.location.pathname !== '/reset-password') {
          window.location.href = '/reset-password';
        }
        setLoading(false);
        return;
      }

      if (session?.user) {
        if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
          loadUserProfile(session.user.id);
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setLoading(false);
        queryClient.clear();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUserProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Profile doesn't exist yet, wait or handle gracefully
          console.log('Profile not found, might be creating one...');
        } else {
          console.error('Error loading profile:', error);
        }
      } else {
        setUser(data);
      }
    } catch (err) {
      console.error('Unexpected error loading profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return <PageLoader />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <HelmetProvider>
        <TooltipProvider>
          <div className="min-h-screen bg-background font-sans antialiased">
            <BrowserRouter>
              <SupabaseSetup />
              <Toaster position="top-right" expand={false} richColors />
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<LandingPage user={user} onLogout={logout} />} />
                  <Route
                    path="/auth"
                    element={user ? <Navigate to="/dashboard" /> : <AuthPage />}
                  />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  <Route
                    path="/dashboard"
                    element={
                      user ? (
                        <Dashboard user={user} onLogout={logout} onUpdateUser={() => loadUserProfile(user.id)} />
                      ) : (
                        <Navigate to="/auth" />
                      )
                    }
                  />
                  <Route
                    path="/services"
                    element={<ServicesPage user={user} onLogout={logout} />}
                  />
                  {/* Service Landing Pages */}
                  <Route
                    path="/service/:serviceSlug"
                    element={<ServiceLandingPage user={user} onLogout={logout} />}
                  />
                  <Route
                    path="/platform/:platformSlug"
                    element={<PlatformLandingPage user={user} onLogout={logout} />}
                  />
                  <Route
                    path="/orders"
                    element={
                      user ? (
                        <OrderHistory user={user} onLogout={logout} />
                      ) : (
                        <Navigate to="/auth" />
                      )
                    }
                  />

                  {/* Admin Routes */}
                  <Route
                    path="/admin"
                    element={
                      user?.role === 'admin' ? (
                        <AdminDashboard user={user} onLogout={logout} />
                      ) : user ? (
                        <Navigate to="/dashboard" />
                      ) : (
                        <Navigate to="/auth" />
                      )
                    }
                  />
                  <Route
                    path="/admin/users"
                    element={
                      user?.role === 'admin' ? (
                        <AdminDashboard user={user} onLogout={logout} />
                      ) : user ? (
                        <Navigate to="/dashboard" />
                      ) : (
                        <Navigate to="/auth" />
                      )
                    }
                  />
                  <Route
                    path="/admin/deposits"
                    element={
                      user?.role === 'admin' ? (
                        <AdminDashboard user={user} onLogout={logout} />
                      ) : user ? (
                        <Navigate to="/dashboard" />
                      ) : (
                        <Navigate to="/auth" />
                      )
                    }
                  />
                  <Route
                    path="/admin/orders"
                    element={
                      user?.role === 'admin' ? (
                        <AdminDashboard user={user} onLogout={logout} />
                      ) : user ? (
                        <Navigate to="/dashboard" />
                      ) : (
                        <Navigate to="/auth" />
                      )
                    }
                  />
                  <Route
                    path="/admin/services"
                    element={
                      user?.role === 'admin' ? (
                        <AdminDashboard user={user} onLogout={logout} />
                      ) : user ? (
                        <Navigate to="/dashboard" />
                      ) : (
                        <Navigate to="/auth" />
                      )
                    }
                  />
                  <Route
                    path="/admin/settings"
                    element={
                      user?.role === 'admin' ? (
                        <AdminDashboard user={user} onLogout={logout} />
                      ) : user ? (
                        <Navigate to="/dashboard" />
                      ) : (
                        <Navigate to="/auth" />
                      )
                    }
                  />
                  <Route
                    path="/admin/payment-methods"
                    element={
                      user?.role === 'admin' ? (
                        <AdminDashboard user={user} onLogout={logout} />
                      ) : user ? (
                        <Navigate to="/dashboard" />
                      ) : (
                        <Navigate to="/auth" />
                      )
                    }
                  />
                  <Route
                    path="/admin/stats"
                    element={
                      user?.role === 'admin' ? (
                        <AdminDashboard user={user} onLogout={logout} />
                      ) : user ? (
                        <Navigate to="/dashboard" />
                      ) : (
                        <Navigate to="/auth" />
                      )
                    }
                  />
                  <Route
                    path="/admin/support"
                    element={
                      user?.role === 'admin' ? (
                        <AdminDashboard user={user} onLogout={logout} />
                      ) : user ? (
                        <Navigate to="/dashboard" />
                      ) : (
                        <Navigate to="/auth" />
                      )
                    }
                  />
                  <Route
                    path="/admin/support/analytics"
                    element={
                      user?.role === 'admin' ? (
                        <AdminDashboard user={user} onLogout={logout} />
                      ) : user ? (
                        <Navigate to="/dashboard" />
                      ) : (
                        <Navigate to="/auth" />
                      )
                    }
                  />
                  <Route
                    path="/admin/referrals"
                    element={
                      user?.role === 'admin' ? (
                        <AdminDashboard user={user} onLogout={logout} />
                      ) : user ? (
                        <Navigate to="/dashboard" />
                      ) : (
                        <Navigate to="/auth" />
                      )
                    }
                  />
                  <Route
                    path="/admin/updates"
                    element={
                      user?.role === 'admin' ? (
                        <AdminDashboard user={user} onLogout={logout} />
                      ) : user ? (
                        <Navigate to="/dashboard" />
                      ) : (
                        <Navigate to="/auth" />
                      )
                    }
                  />
                  <Route
                    path="/admin/video-tutorials"
                    element={
                      user?.role === 'admin' ? (
                        <AdminDashboard user={user} onLogout={logout} />
                      ) : user ? (
                        <Navigate to="/dashboard" />
                      ) : (
                        <Navigate to="/auth" />
                      )
                    }
                  />
                  <Route
                    path="/admin/rewards"
                    element={
                      user?.role === 'admin' ? (
                        <AdminDashboard user={user} onLogout={logout} />
                      ) : user ? (
                        <Navigate to="/dashboard" />
                      ) : (
                        <Navigate to="/auth" />
                      )
                    }
                  />
                  <Route
                    path="/admin/rewards-settings"
                    element={
                      user?.role === 'admin' ? (
                        <AdminDashboard user={user} onLogout={logout} />
                      ) : user ? (
                        <Navigate to="/dashboard" />
                      ) : (
                        <Navigate to="/auth" />
                      )
                    }
                  />
                  <Route
                    path="/support"
                    element={<SupportPage user={user} onLogout={logout} />}
                  />
                  <Route
                    path="/transactions"
                    element={
                      user ? (
                        <TransactionsPage user={user} onLogout={logout} />
                      ) : (
                        <Navigate to="/auth" />
                      )
                    }
                  />
                  <Route
                    path="/payment/callback"
                    element={
                      <PaymentCallback onUpdateUser={() => user && loadUserProfile(user.id)} />
                    }
                  />
                  <Route
                    path="/payment-callback"
                    element={
                      <PaymentCallback onUpdateUser={() => user && loadUserProfile(user.id)} />
                    }
                  />
                  <Route
                    path="/blog"
                    element={<BlogListPage user={user} onLogout={logout} />}
                  />
                  <Route
                    path="/blog/:slug"
                    element={<BlogPostPage user={user} onLogout={logout} />}
                  />
                  <Route
                    path="/guides/:slug"
                    element={<GuidePage user={user} onLogout={logout} />}
                  />
                  <Route
                    path="/about"
                    element={<AboutPage user={user} onLogout={logout} />}
                  />
                  <Route
                    path="/pricing"
                    element={<PricingPage user={user} onLogout={logout} />}
                  />
                  <Route
                    path="/term"
                    element={<Navigate to="/terms" replace />}
                  />
                  <Route
                    path="/terms"
                    element={<TermsPage user={user} onLogout={logout} />}
                  />
                  <Route
                    path="/faq"
                    element={<FAQPage user={user} onLogout={logout} />}
                  />
                  <Route
                    path="/dev"
                    element={
                      user?.role === 'admin' ? (
                        <DevDashboard user={user} />
                      ) : (
                        <Navigate to="/auth" />
                      )
                    }
                  />
                </Routes>
              </Suspense>
              <WhatsAppButton />
            </BrowserRouter>
            <SpeedInsights />
            <Analytics />
          </div>
        </TooltipProvider>
      </HelmetProvider>
    </QueryClientProvider>
  );
}

export default App;
