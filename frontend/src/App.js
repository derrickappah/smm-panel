import { useState, useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "@/pages/LandingPage";
import AuthPage from "@/pages/AuthPage";
import Dashboard from "@/pages/Dashboard";
import ServicesPage from "@/pages/ServicesPage";
import OrderHistory from "@/pages/OrderHistory";
import AdminDashboard from "@/pages/AdminDashboard";
import SupportPage from "@/pages/SupportPage";
import TransactionsPage from "@/pages/TransactionsPage";
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
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadUserProfile(session.user.id);
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadUserProfile = async (userId) => {
    try {
      // First, get auth user as fallback
      const { data: { user: authUser } } = await supabase.auth.getUser();
      
      if (!authUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      // Set user from auth data immediately (so app works even without profile table)
      const fallbackUser = {
        id: authUser.id,
        email: authUser.email || '',
        name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
        balance: 0.0,
        role: 'user',
      };

      setUser(fallbackUser);
      setLoading(false);

      // Try to load profile from database (non-blocking)
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
            // User already set from fallback, so continue
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
                // If insert fails due to RLS, that's okay - we'll use fallback
                if (insertError.code !== '42501' && !insertError.message?.includes('permission')) {
                  console.warn('Profile creation failed:', insertError.message);
                }
              } else if (newProfile) {
                console.log('Profile created successfully:', newProfile);
                setUser({
                  id: newProfile.id,
                  email: newProfile.email,
                  name: newProfile.name,
                  balance: newProfile.balance || 0.0,
                  role: newProfile.role || 'user',
                });
              }
            } catch (insertErr) {
              // Insert failed - might be RLS or table issue, continue with fallback
              console.warn('Profile creation failed (non-critical):', insertErr);
            }
          }
        } else if (profile) {
          // Update with full profile data
          setUser({
            id: profile.id,
            email: profile.email,
            name: profile.name,
            balance: profile.balance || 0.0,
            role: profile.role || 'user',
          });
        }
      } catch (err) {
        // Profile fetch failed - user already set from fallback, so continue
        console.warn('Profile fetch error (non-critical):', err);
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
    <div className="App">
      <Toaster position="top-right" />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={user ? <Navigate to="/dashboard" /> : <LandingPage />} />
          <Route path="/auth" element={user ? <Navigate to="/dashboard" /> : <AuthPage />} />
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
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;

