import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Check if Supabase is configured
const isConfigured = supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('your-project-id') &&
  !supabaseAnonKey.includes('your-anon-key') &&
  supabaseUrl.startsWith('https://') &&
  supabaseUrl.includes('.supabase.co');

// Create a dummy client if not configured (to prevent crashes)
let supabase;

if (isConfigured) {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    }
  });

  // Helper to sync session to server-side cookies for persistence
  const syncSessionToCookie = async (session) => {
    try {
      await fetch('/api/auth/sync-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          access_token: session?.access_token || null,
          refresh_token: session?.refresh_token || null,
          expires_in: session?.expires_in || null
        })
      });
    } catch (err) {
      console.error('Failed to sync session to cookie:', err);
    }
  };

  // Listen for auth state changes to keep cookie in sync
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      syncSessionToCookie(session);
    } else if (event === 'SIGNED_OUT') {
      syncSessionToCookie(null);
    }
  });

  console.log('✅ Supabase client initialized and session sync active');
} else {
  console.warn('⚠️ Supabase not configured - using placeholder client');
  console.warn('Please update frontend/.env with your Supabase credentials');

  // Create a mock client that will throw helpful errors
  supabase = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      signUp: () => Promise.resolve({
        data: null,
        error: { message: 'Supabase not configured. Please update .env file with your Supabase credentials.' }
      }),
      signInWithPassword: () => Promise.resolve({
        data: null,
        error: { message: 'Supabase not configured. Please update .env file with your Supabase credentials.' }
      }),
      signOut: () => Promise.resolve({ error: null }),
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      resetPasswordForEmail: () => Promise.resolve({
        data: null,
        error: { message: 'Supabase not configured. Please update .env file with your Supabase credentials.' }
      }),
      updateUser: () => Promise.resolve({
        data: null,
        error: { message: 'Supabase not configured. Please update .env file with your Supabase credentials.' }
      }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } })
    },
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }) }) }),
      insert: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }) }),
      delete: () => ({ eq: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }) })
    })
  };
}

export { supabase, isConfigured };

