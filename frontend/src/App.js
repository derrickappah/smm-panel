import { useState, useEffect, lazy, Suspense } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { QueryClientProvider } from "@tanstack/react-query";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Analytics } from "@vercel/analytics/react";
import SupabaseSetup from "@/components/SupabaseSetup";
import { Toaster } from "@/components/ui/sonner";
import { supabase, isConfigured } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import * as serviceWorkerRegistration from "./serviceWorkerRegistration";

// Lazy load all page components for code splitting
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const AuthPage = lazy(() => import("@/pages/AuthPage"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const ServicesPage = lazy(() => import("@/pages/ServicesPage"));
const OrderHistory = lazy(() => import("@/pages/OrderHistory"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const SupportPage = lazy(() => import("@/pages/SupportPage"));
const TransactionsPage = lazy(() => import("@/pages/TransactionsPage"));
const PaymentCallback = lazy(() => import("@/pages/PaymentCallback"));
const ServiceLandingPage = lazy(() => import("@/pages/ServiceLandingPage"));
const PlatformLandingPage = lazy(() => import("@/pages/PlatformLandingPage"));
const BlogListPage = lazy(() => import("@/pages/blog/BlogListPage"));
const BlogPostPage = lazy(() => import("@/pages/blog/BlogPostPage"));
const GuidePage = lazy(() => import("@/pages/guides/GuidePage"));
const AboutPage = lazy(() => import("@/pages/AboutPage"));
const PricingPage = lazy(() => import("@/pages/PricingPage"));

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
    // Skip if Supabase is not configured
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    // Get initial session
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
      
      // Only clear user on explicit sign out events
      if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        setUser(null);
        setLoading(false);
        return;
      }
      
      // For SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED, and other events
      // Only update if we have a valid session
      if (session?.user) {
        // Reload user profile to get latest data
        // This handles SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED, etc.
        loadUserProfile(session.user.id);
      }
      // For TOKEN_REFRESHED or other events without session, don't clear user
      // This prevents redirects during normal session refresh
      // The user state will remain until we explicitly sign out
      // This is important because token refresh might temporarily have no session
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Register service worker
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      serviceWorkerRegistration.register({
        onSuccess: () => {
          console.log('Service Worker registered successfully');
        },
        onUpdate: (registration) => {
          console.log('Service Worker update available');
          // Optionally show a notification to user about update
        },
      });
    }
  }, []);

  const loadUserProfile = async (userId) => {
    try {
      // First, get auth user
      const { data: { user: authUser }, error: getUserError } = await supabase.auth.getUser();
      
      if (!authUser) {
        // Check if it's a token expiration error (which might be temporary during refresh)
        if (getUserError?.message?.includes('expired') || getUserError?.message?.includes('refresh')) {
          // Token is being refreshed - don't clear user, let the refresh complete
          console.log('Token refresh in progress, keeping user state');
          return;
        }
        // For other errors or no user, clear the user state
        setUser(null);
        setLoading(false);
        return;
      }

      // Try to load profile from database FIRST to get correct role
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('id, email, name, balance, role, phone_number')
          .eq('id', userId)
          .single();

        if (error) {
          // Handle 500 errors and table not found errors
          if (error.code === 'PGRST301' || error.message?.includes('500') || error.message?.includes('Internal Server Error')) {
            console.warn('Profiles table may not exist or RLS policy issue. Using fallback user data.');
            // Use fallback user
            const fallbackUser = {
              id: authUser.id,
              email: authUser.email || '',
              name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
              balance: 0.0,
              role: 'user',
            };
            setUser(fallbackUser);
            setLoading(false);
            return;
          }

          // Profile doesn't exist - try to create it
          if (error.code === 'PGRST116' || error.message?.includes('No rows')) {
            try {
              console.log('Profile not found, attempting to create...', { userId, email: authUser.email });
              const { data: newProfile, error: insertError } = await supabase
                .from('profiles')
                .insert({
              id: authUser.id,
              email: authUser.email,
              name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
              balance: 0.0,
              role: 'user',
                })
                .select()
                .single();

              if (insertError) {
                console.error('Profile creation error:', insertError);
                // If insert fails, use fallback
                const fallbackUser = {
                  id: authUser.id,
                  email: authUser.email || '',
                  name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
                  balance: 0.0,
                  role: 'user',
                };
                setUser(fallbackUser);
                setLoading(false);
              } else if (newProfile) {
                console.log('Profile created successfully:', newProfile);
                setUser({
                  id: newProfile.id,
                  email: newProfile.email,
                  name: newProfile.name,
                  balance: newProfile.balance || 0.0,
                  role: newProfile.role || 'user',
                });
                setLoading(false);
              }
            } catch (insertErr) {
              // Insert failed - use fallback
              console.warn('Profile creation failed (non-critical):', insertErr);
              const fallbackUser = {
                id: authUser.id,
                email: authUser.email || '',
                name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
                balance: 0.0,
                role: 'user',
              };
              setUser(fallbackUser);
              setLoading(false);
            }
          } else {
            // Other error - use fallback
            const fallbackUser = {
              id: authUser.id,
              email: authUser.email || '',
              name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
              balance: 0.0,
              role: 'user',
            };
            setUser(fallbackUser);
            setLoading(false);
          }
        } else if (profile) {
          // Profile loaded successfully - set user with correct role immediately
          setUser({
            id: profile.id,
            email: profile.email,
            name: profile.name,
            balance: profile.balance || 0.0,
            role: profile.role || 'user',
          });
          setLoading(false);
        }
      } catch (err) {
        // Profile fetch failed - use fallback
        console.warn('Profile fetch error (non-critical):', err);
        const fallbackUser = {
          id: authUser.id,
          email: authUser.email || '',
          name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
          balance: 0.0,
          role: 'user',
        };
        setUser(fallbackUser);
        setLoading(false);
      }
    } catch (error) {
      console.error('Error loading user:', error);
      setUser(null);
      setLoading(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
        {/* Mobile Header Skeleton */}
        <div className="sticky top-0 z-40 lg:hidden bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="h-11 w-11 bg-gray-200 rounded animate-pulse"></div>
          </div>
        </div>

        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Desktop Sidebar Skeleton */}
            <div className="hidden lg:flex lg:flex-col lg:w-64 lg:flex-shrink-0">
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
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
    );
  }

  if (!isConfigured) {
    return (
      <div className="App">
        <Toaster position="top-right" />
        <SupabaseSetup />
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <HelmetProvider>
        <div className="App">
          <Toaster position="top-right" />
          <BrowserRouter>
            <Suspense fallback={<PageLoader />}>
              <Routes>
              <Route path="/" element={user ? <Navigate to={user?.role === 'admin' ? '/admin/dashboard' : '/dashboard'} /> : <LandingPage />} />
              <Route path="/auth" element={user ? <Navigate to={user?.role === 'admin' ? '/admin/dashboard' : '/dashboard'} /> : <AuthPage />} />
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
                element={user ? <ServicesPage user={user} onLogout={logout} /> : <Navigate to="/auth" />}
              />
              <Route
                path="/services/:platform/:serviceType"
                element={<ServiceLandingPage user={user} onLogout={logout} />}
              />
              <Route
                path="/instagram-services"
                element={<PlatformLandingPage user={user} onLogout={logout} />}
              />
              <Route
                path="/tiktok-services"
                element={<PlatformLandingPage user={user} onLogout={logout} />}
              />
              <Route
                path="/youtube-services"
                element={<PlatformLandingPage user={user} onLogout={logout} />}
              />
              <Route
                path="/facebook-services"
                element={<PlatformLandingPage user={user} onLogout={logout} />}
              />
              <Route
                path="/twitter-services"
                element={<PlatformLandingPage user={user} onLogout={logout} />}
              />
              <Route
                path="/orders"
                element={user ? <OrderHistory user={user} onLogout={logout} /> : <Navigate to="/auth" />}
              />
              <Route
                path="/admin"
                element={
                  user?.role === 'admin' ? (
                    <Navigate to="/admin/dashboard" replace />
                  ) : user ? (
                    <Navigate to="/dashboard" />
                  ) : (
                    <Navigate to="/auth" />
                  )
                }
              />
              <Route
                path="/admin/dashboard"
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
                path="/admin/transactions"
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
                path="/admin/balance"
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
              </Routes>
            </Suspense>
          </BrowserRouter>
          <SpeedInsights />
          <Analytics />
        </div>
      </HelmetProvider>
    </QueryClientProvider>
  );
}

export default App;

