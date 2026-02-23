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
import RewardPage from "@/pages/RewardPage";

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
        loadUserProfile(session.user.id);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      if (subscription) subscription.unsubscribe();
    };
  }, []);

  const loadUserProfile = async (userId) => {
    try {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Error loading profile:", error);
      } else {
        setUser(profile);
      }
    } catch (error) {
      console.error("Error in loadUserProfile:", error);
    } finally {
      setLoading(false);
    }
  };

  const refreshUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await loadUserProfile(session.user.id);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if (loading) {
    return <PageLoader />;
  }

  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <BrowserRouter>
            <div className="min-h-screen bg-background">
              {!isConfigured && <SupabaseSetup />}
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {/* Public Routes */}
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/services" element={<ServicesPage />} />
                  <Route path="/pricing" element={<PricingPage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/terms" element={<TermsPage />} />
                  <Route path="/faq" element={<FAQPage />} />
                  <Route path="/blog" element={<BlogListPage />} />
                  <Route path="/blog/:id" element={<BlogPostPage />} />
                  <Route path="/guides/:id" element={<GuidePage />} />
                  <Route path="/s/:slug" element={<ServiceLandingPage />} />
                  <Route path="/p/:slug" element={<PlatformLandingPage />} />

                  <Route
                    path="/auth"
                    element={user ? <Navigate to="/dashboard" replace /> : <AuthPage />}
                  />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />

                  {/* Protected Routes */}
                  <Route
                    path="/dashboard"
                    element={
                      user ? (
                        <Dashboard user={user} onLogout={logout} onUpdateUser={refreshUser} />
                      ) : (
                        <Navigate to="/auth" replace />
                      )
                    }
                  />
                  <Route
                    path="/orders"
                    element={
                      user ? (
                        <OrderHistory user={user} onLogout={logout} />
                      ) : (
                        <Navigate to="/auth" replace />
                      )
                    }
                  />
                  <Route
                    path="/transactions"
                    element={
                      user ? (
                        <TransactionsPage user={user} onLogout={logout} />
                      ) : (
                        <Navigate to="/auth" replace />
                      )
                    }
                  />
                  <Route
                    path="/support"
                    element={
                      user ? (
                        <SupportPage user={user} onLogout={logout} />
                      ) : (
                        <Navigate to="/auth" replace />
                      )
                    }
                  />
                  <Route
                    path="/reward"
                    element={
                      user ? (
                        <RewardPage user={user} onLogout={logout} />
                      ) : (
                        <Navigate to="/auth" replace />
                      )
                    }
                  />
                  <Route path="/payment/callback" element={<PaymentCallback onUpdateUser={refreshUser} />} />

                  {/* Admin Routes */}
                  <Route
                    path="/admin/*"
                    element={
                      user?.role === 'admin' ? (
                        <AdminDashboard user={user} onLogout={logout} />
                      ) : user ? (
                        <Navigate to="/dashboard" replace />
                      ) : (
                        <Navigate to="/auth" replace />
                      )
                    }
                  />
                  <Route
                    path="/admin/dev"
                    element={
                      user?.role === 'admin' ? (
                        <DevDashboard user={user} onLogout={logout} />
                      ) : user ? (
                        <Navigate to="/dashboard" replace />
                      ) : (
                        <Navigate to="/auth" replace />
                      )
                    }
                  />

                  {/* Catch-all route */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
              <Toaster position="top-right" closeButton richColors />
              <WhatsAppButton />
            </div>
            <SpeedInsights />
            <Analytics />
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
