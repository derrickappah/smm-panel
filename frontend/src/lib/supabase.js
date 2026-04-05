import { createClient } from '@supabase/supabase-js';

// NOTE: Create React App requires the REACT_APP_ prefix for environment variables
// to be visible in the browser. If you use SUPABASE_ANON_KEY (no prefix), 
// it will be UNDEFINED here.
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

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
    },
    global: {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    }
  });

  console.log('✅ Supabase client initialized');
} else {
  console.error('❌ Supabase configuration error: Missing keys.');
  console.info('If you removed the REACT_APP_ prefix for security, the browser can no longer read the keys.');
  console.info('Recommendation: Re-add the prefix for public keys (URL/Anon) or fetch them from /api/config');
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

