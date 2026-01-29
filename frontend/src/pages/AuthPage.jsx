import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { supabase, isConfigured } from '@/lib/supabase';
import { logLoginAttempt } from '@/lib/activityLogger';
import SEO from '@/components/SEO';
import TermsDialog from '@/components/TermsDialog';

// Email validation function with TLD validation
const isValidEmail = (email) => {
  // Basic email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return false;
  }

  // Extract TLD (top-level domain) from email
  const parts = email.split('@');
  if (parts.length !== 2) return false;

  const domain = parts[1];
  const domainParts = domain.split('.');
  if (domainParts.length < 2) return false;

  // Get the TLD (last part after the last dot)
  const tld = domainParts[domainParts.length - 1].toLowerCase();

  // Comprehensive list of valid TLDs (common and country codes)
  const validTlds = [
    // Generic TLDs
    'com', 'org', 'net', 'edu', 'gov', 'mil', 'int',
    // New generic TLDs
    'io', 'co', 'ai', 'app', 'dev', 'tech', 'online', 'site', 'website', 'store', 'shop',
    'blog', 'info', 'xyz', 'me', 'tv', 'cc', 'ws', 'biz', 'name', 'pro', 'mobi',
    // Country code TLDs (most common)
    'uk', 'us', 'ca', 'au', 'de', 'fr', 'it', 'es', 'nl', 'be', 'ch', 'at', 'se', 'no', 'dk', 'fi',
    'pl', 'cz', 'ie', 'pt', 'gr', 'ro', 'hu', 'bg', 'hr', 'sk', 'si', 'lt', 'lv', 'ee',
    'jp', 'cn', 'kr', 'in', 'sg', 'hk', 'tw', 'my', 'th', 'ph', 'id', 'vn', 'nz',
    'br', 'mx', 'ar', 'cl', 'co', 'pe', 've', 'ec', 'uy', 'py', 'bo', 'cr', 'pa', 'do',
    'za', 'eg', 'ma', 'ng', 'ke', 'gh', 'tz', 'et', 'ug', 'zm', 'zw', 'mw', 'rw',
    'ru', 'ua', 'by', 'kz', 'ge', 'am', 'az', 'md', 'tj', 'kg', 'uz', 'tm',
    'il', 'ae', 'sa', 'jo', 'kw', 'qa', 'bh', 'om', 'ye', 'iq', 'sy', 'lb', 'ps',
    'tr', 'ir', 'pk', 'bd', 'lk', 'np', 'mm', 'kh', 'la', 'mn',
    // Additional common TLDs
    'ac', 'ad', 'ae', 'af', 'ag', 'ai', 'al', 'am', 'ao', 'aq', 'ar', 'as', 'at', 'au', 'aw', 'ax', 'az',
    'ba', 'bb', 'bd', 'be', 'bf', 'bg', 'bh', 'bi', 'bj', 'bl', 'bm', 'bn', 'bo', 'bq', 'br', 'bs', 'bt', 'bv', 'bw', 'by', 'bz',
    'ca', 'cc', 'cd', 'cf', 'cg', 'ch', 'ci', 'ck', 'cl', 'cm', 'cn', 'co', 'cr', 'cu', 'cv', 'cw', 'cx', 'cy', 'cz',
    'de', 'dj', 'dk', 'dm', 'do', 'dz',
    'ec', 'ee', 'eg', 'eh', 'er', 'es', 'et',
    'fi', 'fj', 'fk', 'fm', 'fo', 'fr',
    'ga', 'gb', 'gd', 'ge', 'gf', 'gg', 'gh', 'gi', 'gl', 'gm', 'gn', 'gp', 'gq', 'gr', 'gs', 'gt', 'gu', 'gw', 'gy',
    'hk', 'hm', 'hn', 'hr', 'ht', 'hu',
    'id', 'ie', 'il', 'im', 'in', 'io', 'iq', 'ir', 'is', 'it',
    'je', 'jm', 'jo', 'jp',
    'ke', 'kg', 'kh', 'ki', 'km', 'kn', 'kp', 'kr', 'kw', 'ky', 'kz',
    'la', 'lb', 'lc', 'li', 'lk', 'lr', 'ls', 'lt', 'lu', 'lv', 'ly',
    'ma', 'mc', 'md', 'me', 'mf', 'mg', 'mh', 'mk', 'ml', 'mm', 'mn', 'mo', 'mp', 'mq', 'mr', 'ms', 'mt', 'mu', 'mv', 'mw', 'mx', 'my', 'mz',
    'na', 'nc', 'ne', 'nf', 'ng', 'ni', 'nl', 'no', 'np', 'nr', 'nu', 'nz',
    'om',
    'pa', 'pe', 'pf', 'pg', 'ph', 'pk', 'pl', 'pm', 'pn', 'pr', 'ps', 'pt', 'pw', 'py',
    'qa',
    're', 'ro', 'rs', 'ru', 'rw',
    'sa', 'sb', 'sc', 'sd', 'se', 'sg', 'sh', 'si', 'sj', 'sk', 'sl', 'sm', 'sn', 'so', 'sr', 'ss', 'st', 'sv', 'sx', 'sy', 'sz',
    'tc', 'td', 'tf', 'tg', 'th', 'tj', 'tk', 'tl', 'tm', 'tn', 'to', 'tr', 'tt', 'tv', 'tw', 'tz',
    'ua', 'ug', 'um', 'us', 'uy', 'uz',
    'va', 'vc', 've', 'vg', 'vi', 'vn', 'vu',
    'wf', 'ws',
    'ye', 'yt',
    'za', 'zm', 'zw'
  ];

  // Check if TLD is valid
  return validTlds.includes(tld);
};

// Phone number validation - only accepts 0XXXXXXXXX format (10 digits starting with 0)
const isValidGhanaPhone = (phone) => {
  // Remove all non-digit characters for validation
  const cleaned = phone.replace(/\D/g, '');

  // Only accept exactly 10 digits starting with 0
  return /^0\d{9}$/.test(cleaned);
};

const formatGhanaPhone = (value) => {
  // Remove all non-digit characters
  let cleaned = value.replace(/\D/g, '');

  // Only allow digits, must start with 0
  if (cleaned.length === 0) {
    return '';
  }

  // If first digit is not 0, add 0 at the start
  if (!cleaned.startsWith('0')) {
    // If user typed digits without 0, add 0
    if (cleaned.length <= 9) {
      cleaned = '0' + cleaned;
    } else {
      // If more than 9 digits without 0, only take first 9 and add 0
      cleaned = '0' + cleaned.substring(0, 9);
    }
  }

  // Limit to 10 digits maximum
  cleaned = cleaned.substring(0, 10);

  return cleaned;
};

const AuthPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Check if referral code exists in URL - if so, default to signup form
  const hasReferralCode = searchParams.get('ref');
  const [isLogin, setIsLogin] = useState(!hasReferralCode); // Show signup if referral code exists
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [manualReferralCode, setManualReferralCode] = useState('');
  const [showReferralCode, setShowReferralCode] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsDialogOpen, setTermsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    phone_number: '',
  });

  // Read referral code from URL query params and pre-fill input
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) {
      const trimmedRef = ref.trim();
      setReferralCode(trimmedRef);
      setManualReferralCode(trimmedRef); // Pre-fill the input field
      setShowReferralCode(true); // Enable the referral toggle when URL has ref
      // Automatically switch to signup form when referral code is present
      setIsLogin(false);
    }
  }, [searchParams]);

  // Get the active referral code (manual input takes precedence over URL param)
  // Only returns a code if the toggle is enabled
  const getActiveReferralCode = () => {
    if (!showReferralCode) {
      return '';
    }
    return manualReferralCode.trim() || referralCode.trim();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Check if Supabase is configured
      if (!isConfigured) {
        toast.error('Supabase is not configured. Please check your environment variables.');
        console.error('Supabase configuration check failed. REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY must be set.');
        setLoading(false);
        return;
      }

      // Validate inputs
      if (!formData.email.trim()) {
        toast.error('Please enter your email');
        setLoading(false);
        return;
      }

      if (!isValidEmail(formData.email.trim())) {
        toast.error('Please enter a valid email address');
        setLoading(false);
        return;
      }

      if (!formData.password || formData.password.length < 6) {
        toast.error('Password must be at least 6 characters');
        setLoading(false);
        return;
      }

      if (!isLogin && !formData.name.trim()) {
        toast.error('Please enter your name');
        setLoading(false);
        return;
      }

      if (!isLogin && !formData.phone_number.trim()) {
        toast.error('Please enter your WhatsApp number');
        setPhoneError('Please enter your WhatsApp number');
        setLoading(false);
        return;
      }

      if (!isLogin && !isValidGhanaPhone(formData.phone_number.trim())) {
        toast.error('Please enter a valid phone number in the format: 0559272762');
        setPhoneError('Phone number must be 10 digits starting with 0 (e.g., 0559272762)');
        setLoading(false);
        return;
      }

      if (!isLogin && !termsAccepted) {
        toast.error('Please accept the Terms and Conditions to continue');
        setLoading(false);
        return;
      }

      if (isLogin) {
        // LOGIN
        const { data, error } = await supabase.auth.signInWithPassword({
          email: formData.email.trim(),
          password: formData.password,
        });

        if (error) {
          let errorMsg = 'Login failed';

          if (error.message?.includes('Invalid login credentials') || error.message?.includes('invalid_credentials')) {
            errorMsg = 'Invalid email or password';
          } else if (error.message?.includes('Email not confirmed')) {
            errorMsg = 'Please check your email and confirm your account';
          } else {
            errorMsg = error.message || 'Login failed. Please try again.';
          }

          // Log failed login attempt
          await logLoginAttempt({
            success: false,
            email: formData.email.trim(),
            error: errorMsg
          });

          toast.error(errorMsg);
          setLoading(false);
          return;
        }

        if (data.user) {
          // Log successful login
          await logLoginAttempt({
            success: true,
            email: formData.email.trim()
          });

          toast.success('Welcome back!');

          // Create profile if it doesn't exist (non-blocking)
          try {
            const { error: profileError } = await supabase.from('profiles').insert({
              id: data.user.id,
              email: data.user.email,
              name: data.user.email.split('@')[0],
              balance: 0.0,
              role: 'user',
            });

            // Ignore errors - profile might already exist or table might not exist
            if (profileError && !profileError.message?.includes('duplicate')) {
              console.warn('Profile creation warning:', profileError);
            }
          } catch (err) {
            // Ignore profile errors
          }

          // Navigate - auth state change will handle user loading
          navigate('/dashboard');
        }
      } else {
        // SIGNUP
        try {
          // Phone number is already in 0XXXXXXXXX format from formatting function
          const normalizedPhone = formData.phone_number.trim().replace(/\D/g, '');

          const signupMetadata = {
            name: formData.name.trim(),
            phone_number: normalizedPhone,
            terms_accepted_at: new Date().toISOString(),
          };

          // Add referral code to metadata if provided (manual input takes precedence)
          const activeReferralCode = getActiveReferralCode();
          if (activeReferralCode) {
            signupMetadata.referral_code = activeReferralCode;
          }

          const { data, error } = await supabase.auth.signUp({
            email: formData.email.trim(),
            password: formData.password,
            options: {
              data: signupMetadata,
            },
          });

          if (error) {
            console.error('Supabase signup error:', error);
            let errorMsg = 'Signup failed';

            // Handle specific error cases
            if (error.status === 422) {
              // 422 Unprocessable Content - usually means validation failed
              if (error.message?.includes('already registered') || error.message?.includes('User already registered') || error.message?.includes('already exists')) {
                errorMsg = 'Email already registered. Please try logging in instead.';
              } else if (error.message?.includes('Password') || error.message?.includes('password')) {
                errorMsg = 'Password does not meet requirements. Please use at least 6 characters.';
              } else if (error.message?.includes('email')) {
                errorMsg = 'Invalid email address. Please check and try again.';
              } else {
                // Log the full error for debugging
                console.error('422 Error details:', {
                  message: error.message,
                  status: error.status,
                  name: error.name
                });
                errorMsg = 'Signup failed. Please check your email and password, or try logging in if you already have an account.';
              }
            } else if (error.message?.includes('already registered') || error.message?.includes('User already registered')) {
              errorMsg = 'Email already registered. Please try logging in instead.';
            } else if (error.message?.includes('Password') || error.message?.includes('password')) {
              errorMsg = 'Password does not meet requirements. Please use at least 6 characters.';
            } else if (error.message?.includes('Email not confirmed')) {
              errorMsg = 'Please check your email and confirm your account before signing in.';
            } else {
              errorMsg = error.message || 'Signup failed. Please try again.';
            }

            toast.error(errorMsg);
            setLoading(false);
            return;
          }

          if (data.user) {
            // Profile is automatically created by database trigger (handle_new_user)
            // No need to manually create it - this prevents 409 conflicts
            // The trigger also handles referral code and referral relationship creation

            if (data.session) {
              // User is automatically logged in
              const activeReferralCode = getActiveReferralCode();
              if (activeReferralCode) {
                toast.success('Account created successfully! You signed up with a referral code.');
              } else {
                toast.success('Account created successfully!');
              }
              navigate('/dashboard');
            } else {
              // Email confirmation required
              const activeReferralCode = getActiveReferralCode();
              if (activeReferralCode) {
                toast.success('Account created! Please check your email to confirm your account. You signed up with a referral code.');
              } else {
                toast.success('Account created! Please check your email to confirm your account.');
              }
              navigate('/auth');
            }
          } else {
            toast.error('Signup failed. Please try again.');
          }
        } catch (signupError) {
          // Catch any errors that might occur during signup
          console.error('Signup exception:', signupError);
          toast.error('An unexpected error occurred during signup. Please try again.');
          setLoading(false);
          return;
        }
      }
    } catch (error) {
      console.error('Auth error:', error);
      toast.error(error.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
      <SEO
        title="Login or Sign Up - BoostUp GH"
        description="Create your BoostUp GH account to start growing your social media presence. Login or sign up to access our SMM panel services for Instagram, TikTok, YouTube, Facebook, and Twitter."
        keywords="BoostUp GH login, sign up, create account, SMM panel account, social media marketing account"
        canonical="/auth"
      />
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-6 sm:mb-8 animate-fadeIn">
          <div className="inline-flex items-center justify-center mb-3 sm:mb-4">
            <img
              src="/download.png"
              alt="BoostUp GH Logo"
              className="h-8 sm:h-10 max-w-full"
            />
          </div>
          <p className="text-sm sm:text-base text-gray-600">Grow your social media presence</p>
        </div>

        {/* Auth Form */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 sm:p-8 shadow-sm animate-slideUp">
          <div className="flex gap-2 mb-6">
            <Button
              type="button"
              onClick={() => {
                setIsLogin(true);
                setEmailError('');
              }}
              className={`flex-1 h-10 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${isLogin
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                }`}
            >
              Login
            </Button>
            <Button
              type="button"
              onClick={() => {
                setIsLogin(false);
                setEmailError('');
              }}
              className={`flex-1 h-10 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${!isLogin
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                }`}
            >
              Register
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div>
                  <Label htmlFor="name" className="text-sm font-medium text-gray-700 mb-2 block">
                    Full Name
                  </Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="John Doe"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required={!isLogin}
                    className="w-full h-11 rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <Label htmlFor="phone_number" className="text-sm font-medium text-gray-700 mb-2 block">
                    WhatsApp Number
                  </Label>
                  <Input
                    id="phone_number"
                    type="tel"
                    placeholder="0559272762"
                    value={formData.phone_number}
                    onChange={(e) => {
                      const formatted = formatGhanaPhone(e.target.value);
                      setFormData({ ...formData, phone_number: formatted });
                      // Clear error when user starts typing
                      if (phoneError) {
                        setPhoneError('');
                      }
                    }}
                    onBlur={(e) => {
                      // Validate phone when user leaves the field
                      const phoneValue = e.target.value.trim();
                      if (phoneValue && !isValidGhanaPhone(phoneValue)) {
                        setPhoneError('Phone number must be 10 digits starting with 0 (e.g., 0559272762)');
                      } else {
                        setPhoneError('');
                      }
                    }}
                    required={!isLogin}
                    className={`w-full h-11 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${phoneError
                        ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                        : 'border-gray-300'
                      }`}
                  />
                  {phoneError && (
                    <p className="mt-1 text-sm text-red-600">{phoneError}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">Format: 0559272762 (10 digits starting with 0)</p>
                </div>
              </>
            )}

            <div>
              <Label htmlFor="email" className="text-sm font-medium text-gray-700 mb-2 block">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={(e) => {
                  setFormData({ ...formData, email: e.target.value });
                  // Clear error when user starts typing
                  if (emailError) {
                    setEmailError('');
                  }
                }}
                onBlur={(e) => {
                  // Validate email when user leaves the field
                  const emailValue = e.target.value.trim();
                  if (emailValue && !isValidEmail(emailValue)) {
                    setEmailError('Please enter a valid email address');
                  } else {
                    setEmailError('');
                  }
                }}
                required
                className={`w-full h-11 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${emailError
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-300'
                  }`}
              />
              {emailError && (
                <p className="mt-1 text-sm text-red-600">{emailError}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="password" className="text-sm font-medium text-gray-700 block">
                  Password
                </Label>
                {isLogin && (
                  <button
                    type="button"
                    onClick={() => navigate('/reset-password')}
                    className="text-sm text-indigo-600 hover:text-indigo-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 rounded-lg px-2 py-1 transition-colors duration-200"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                className="w-full h-11 rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {!isLogin && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label htmlFor="referral_toggle" className="text-sm font-medium text-gray-700 cursor-pointer">
                    I have a referral code
                  </Label>
                  <Switch
                    id="referral_toggle"
                    checked={showReferralCode}
                    onCheckedChange={(checked) => {
                      setShowReferralCode(checked);
                      if (!checked) {
                        // Clear referral code when toggle is turned off
                        setManualReferralCode('');
                        setReferralCode('');
                      }
                    }}
                  />
                </div>
                {showReferralCode && (
                  <div className="mt-2">
                    <Label htmlFor="referral_code" className="text-sm font-medium text-gray-700 mb-2 block">
                      Referral Code
                    </Label>
                    <Input
                      id="referral_code"
                      type="text"
                      placeholder="Enter referral code (e.g., REFABC123)"
                      value={manualReferralCode}
                      onChange={(e) => setManualReferralCode(e.target.value.toUpperCase().trim())}
                      className="w-full h-11 rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono"
                    />
                  </div>
                )}
              </div>
            )}

            {!isLogin && (
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="terms"
                  checked={termsAccepted}
                  onCheckedChange={(checked) => setTermsAccepted(checked)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <Label
                    htmlFor="terms"
                    className="text-sm text-gray-700 cursor-pointer"
                  >
                    I agree to the{' '}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setTermsDialogOpen(true);
                      }}
                      className="text-indigo-600 hover:text-indigo-700 underline font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 rounded"
                    >
                      Terms and Conditions
                    </button>
                  </Label>
                </div>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-base font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              {loading ? 'Processing...' : isLogin ? 'Login' : 'Create Account'}
            </Button>
          </form>
        </div>

        <p className="text-center text-sm sm:text-base text-gray-600 mt-6">
          <button
            onClick={() => navigate('/')}
            className="text-indigo-600 hover:text-indigo-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 rounded-lg px-2 py-1 transition-colors duration-200"
          >
            ← Back to Home
          </button>
        </p>
      </div>

      <TermsDialog
        open={termsDialogOpen}
        onOpenChange={setTermsDialogOpen}
        onAccept={() => setTermsAccepted(true)}
      />

      {/* WhatsApp Floating Button */}
      <WhatsAppButton message="i have problem loging in" />
    </div>
  );
};

export default AuthPage;
