import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase, isConfigured } from '@/lib/supabase';
import SEO from '@/components/SEO';

// Email validation function (same as AuthPage)
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return false;
  }

  const parts = email.split('@');
  if (parts.length !== 2) return false;
  
  const domain = parts[1];
  const domainParts = domain.split('.');
  if (domainParts.length < 2) return false;
  
  const tld = domainParts[domainParts.length - 1].toLowerCase();
  
  const validTlds = [
    'com', 'org', 'net', 'edu', 'gov', 'mil', 'int',
    'io', 'co', 'ai', 'app', 'dev', 'tech', 'online', 'site', 'website', 'store', 'shop',
    'blog', 'info', 'xyz', 'me', 'tv', 'cc', 'ws', 'biz', 'name', 'pro', 'mobi',
    'uk', 'us', 'ca', 'au', 'de', 'fr', 'it', 'es', 'nl', 'be', 'ch', 'at', 'se', 'no', 'dk', 'fi',
    'pl', 'cz', 'ie', 'pt', 'gr', 'ro', 'hu', 'bg', 'hr', 'sk', 'si', 'lt', 'lv', 'ee',
    'jp', 'cn', 'kr', 'in', 'sg', 'hk', 'tw', 'my', 'th', 'ph', 'id', 'vn', 'nz',
    'br', 'mx', 'ar', 'cl', 'co', 'pe', 've', 'ec', 'uy', 'py', 'bo', 'cr', 'pa', 'do',
    'za', 'eg', 'ma', 'ng', 'ke', 'gh', 'tz', 'et', 'ug', 'zm', 'zw', 'mw', 'rw',
    'ru', 'ua', 'by', 'kz', 'ge', 'am', 'az', 'md', 'tj', 'kg', 'uz', 'tm',
    'il', 'ae', 'sa', 'jo', 'kw', 'qa', 'bh', 'om', 'ye', 'iq', 'sy', 'lb', 'ps',
    'tr', 'ir', 'pk', 'bd', 'lk', 'np', 'mm', 'kh', 'la', 'mn',
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
  
  return validTlds.includes(tld);
};

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
  });

  // Check if we're in recovery mode (user clicked email link)
  // Supabase uses hash fragments for recovery tokens: #access_token=...&type=recovery
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);

  useEffect(() => {
    // Check URL hash for recovery tokens (Supabase format)
    const hash = window.location.hash;
    const hasRecoveryToken = hash.includes('access_token') && hash.includes('type=recovery');
    
    // Also check query params (fallback)
    const typeParam = searchParams.get('type');
    
    if (hasRecoveryToken || typeParam === 'recovery') {
      setIsRecoveryMode(true);
      
      // Supabase automatically extracts tokens from hash when detectSessionInUrl is true
      // Wait a moment for Supabase to process the tokens
      setTimeout(async () => {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) {
          toast.error('Invalid or expired reset link. Please request a new password reset.');
          // Clear hash and redirect to request form
          window.history.replaceState(null, '', '/reset-password');
          setIsRecoveryMode(false);
        }
      }, 500);
    }
  }, [searchParams]);

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setEmailError('');

    try {
      if (!isConfigured) {
        toast.error('Supabase is not configured. Please check your environment variables.');
        setLoading(false);
        return;
      }

      if (!formData.email.trim()) {
        setEmailError('Please enter your email address');
        setLoading(false);
        return;
      }

      if (!isValidEmail(formData.email.trim())) {
        setEmailError('Please enter a valid email address');
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(formData.email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        console.error('Password reset error:', error);
        // Don't reveal if email exists or not for security
        toast.error('Failed to send reset email. Please try again.');
        setLoading(false);
        return;
      }

      setEmailSent(true);
      toast.success('Password reset email sent! Please check your inbox.');
    } catch (error) {
      console.error('Password reset exception:', error);
      toast.error('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setPasswordError('');
    setConfirmPasswordError('');

    try {
      if (!isConfigured) {
        toast.error('Supabase is not configured. Please check your environment variables.');
        setLoading(false);
        return;
      }

      // Validate password
      if (!formData.password || formData.password.length < 6) {
        setPasswordError('Password must be at least 6 characters');
        setLoading(false);
        return;
      }

      // Validate password confirmation
      if (formData.password !== formData.confirmPassword) {
        setConfirmPasswordError('Passwords do not match');
        setLoading(false);
        return;
      }

      // Update password
      const { error } = await supabase.auth.updateUser({
        password: formData.password,
      });

      if (error) {
        console.error('Password update error:', error);
        
        if (error.message?.includes('expired') || error.message?.includes('invalid')) {
          toast.error('This reset link has expired or is invalid. Please request a new password reset.');
          navigate('/reset-password');
        } else {
          toast.error('Failed to update password. Please try again.');
        }
        setLoading(false);
        return;
      }

      toast.success('Password updated successfully! You can now login with your new password.');
      
      // Sign out the recovery session so user can log in with new password
      await supabase.auth.signOut();
      
      // Clear the URL hash to remove tokens
      window.history.replaceState(null, '', '/reset-password');
      
      // Redirect to login after a short delay
      setTimeout(() => {
        navigate('/auth');
      }, 2000);
    } catch (error) {
      console.error('Password reset exception:', error);
      toast.error('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  // Reset email sent state when email changes
  const handleEmailChange = (e) => {
    setFormData({ ...formData, email: e.target.value });
    if (emailError) setEmailError('');
    if (emailSent) setEmailSent(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
      <SEO
        title="Reset Password - BoostUp GH"
        description="Reset your BoostUp GH account password. Enter your email to receive a password reset link."
        keywords="password reset, forgot password, BoostUp GH password recovery"
        canonical="/reset-password"
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
          <p className="text-sm sm:text-base text-gray-600">
            {isRecoveryMode ? 'Set your new password' : 'Reset your password'}
          </p>
        </div>

        {/* Reset Form */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 sm:p-8 shadow-sm animate-slideUp">
          {!isRecoveryMode ? (
            // Request Reset Form
            <>
              {emailSent ? (
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">Check your email</h2>
                  <p className="text-sm text-gray-600">
                    We've sent a password reset link to <strong>{formData.email}</strong>
                  </p>
                  <p className="text-xs text-gray-500">
                    Click the link in the email to reset your password. The link will expire in 1 hour.
                  </p>
                  <Button
                    type="button"
                    onClick={() => {
                      setEmailSent(false);
                      setFormData({ ...formData, email: '' });
                    }}
                    variant="outline"
                    className="mt-4"
                  >
                    Send another email
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleRequestReset} className="space-y-4">
                  <div>
                    <Label htmlFor="email" className="text-sm font-medium text-gray-700 mb-2 block">
                      Email Address
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={formData.email}
                      onChange={handleEmailChange}
                      onBlur={(e) => {
                        const emailValue = e.target.value.trim();
                        if (emailValue && !isValidEmail(emailValue)) {
                          setEmailError('Please enter a valid email address');
                        } else {
                          setEmailError('');
                        }
                      }}
                      required
                      className={`w-full h-11 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                        emailError
                          ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                          : 'border-gray-300'
                      }`}
                    />
                    {emailError && (
                      <p className="mt-1 text-sm text-red-600">{emailError}</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-base font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                  >
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </Button>
                </form>
              )}
            </>
          ) : (
            // Set New Password Form
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <Label htmlFor="password" className="text-sm font-medium text-gray-700 mb-2 block">
                  New Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => {
                    setFormData({ ...formData, password: e.target.value });
                    if (passwordError) setPasswordError('');
                  }}
                  required
                  className={`w-full h-11 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                    passwordError
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                      : 'border-gray-300'
                  }`}
                />
                {passwordError && (
                  <p className="mt-1 text-sm text-red-600">{passwordError}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">Must be at least 6 characters</p>
              </div>

              <div>
                <Label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700 mb-2 block">
                  Confirm New Password
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={(e) => {
                    setFormData({ ...formData, confirmPassword: e.target.value });
                    if (confirmPasswordError) setConfirmPasswordError('');
                  }}
                  required
                  className={`w-full h-11 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                    confirmPasswordError
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                      : 'border-gray-300'
                  }`}
                />
                {confirmPasswordError && (
                  <p className="mt-1 text-sm text-red-600">{confirmPasswordError}</p>
                )}
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-base font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {loading ? 'Updating...' : 'Update Password'}
              </Button>
            </form>
          )}
        </div>

        <p className="text-center text-sm sm:text-base text-gray-600 mt-6">
          <button
            onClick={() => navigate('/auth')}
            className="text-indigo-600 hover:text-indigo-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 rounded-lg px-2 py-1 transition-colors duration-200"
          >
            ← Back to Login
          </button>
        </p>
      </div>
    </div>
  );
};

export default ResetPasswordPage;

