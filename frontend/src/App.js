import { useState, useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import LandingPage from "@/pages/LandingPage";
import AuthPage from "@/pages/AuthPage";
import Dashboard from "@/pages/Dashboard";
import ServicesPage from "@/pages/ServicesPage";
import OrderHistory from "@/pages/OrderHistory";
import AdminDashboard from "@/pages/AdminDashboard";
import SupportPage from "@/pages/SupportPage";
import TransactionsPage from "@/pages/TransactionsPage";
import PaymentCallback from "@/pages/PaymentCallback";
import SupabaseSetup from "@/components/SupabaseSetup";
import { Toaster } from "@/components/ui/sonner";
import { supabase, isConfigured } from "@/lib/supabase";

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
          .select('*')
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-indigo-600"></div>
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
    <HelmetProvider>
      <div className="App">
        <Toaster position="top-right" />
        <BrowserRouter>
          <Routes>
          <Route path="/" element={user ? <Navigate to={user?.role === 'admin' ? '/admin' : '/dashboard'} /> : <LandingPage />} />
          <Route path="/auth" element={user ? <Navigate to={user?.role === 'admin' ? '/admin' : '/dashboard'} /> : <AuthPage />} />
          <Route
            path="/dashboard"
            element={
              user ? (
                user?.role === 'admin' ? (
                  <Navigate to="/admin" />
                ) : (
                  <Dashboard user={user} onLogout={logout} onUpdateUser={() => loadUserProfile(user.id)} />
                )
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
            path="/orders"
            element={user ? <OrderHistory user={user} onLogout={logout} /> : <Navigate to="/auth" />}
          />
          <Route
            path="/admin"
            element={
              user?.role === 'admin' ? (
                <AdminDashboard user={user} onLogout={logout} />
              ) : (
                <Navigate to="/dashboard" />
              )
            }
          />
          <Route
            path="/support"
            element={
              user ? (
                <SupportPage user={user} onLogout={logout} />
              ) : (
                <Navigate to="/auth" />
              )
            }
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
          </Routes>
        </BrowserRouter>
      </div>
    </HelmetProvider>
  );
}

export default App;

