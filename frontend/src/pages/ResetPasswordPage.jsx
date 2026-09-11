import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase, isConfigured } from '@/lib/supabase';
import SEO from '@/components/SEO';
import { Phone, Mail, KeyRound, CheckCircle2, RefreshCw, Eye, EyeOff, ArrowLeft } from 'lucide-react';

// Email validation function (same as AuthPage)
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return false;

  const parts = email.split('@');
  if (parts.length !== 2) return false;
  
  const domain = parts[1];
  const domainParts = domain.split('.');
  if (domainParts.length < 2) return false;
  
  const tld = domainParts[domainParts.length - 1].toLowerCase();
  return tld.length >= 2;
};

// Phone validation - accepts exactly 10 digits
const isValidGhanaPhone = (phone) => {
  const cleaned = (phone || '').replace(/\D/g, '');
  return cleaned.length === 10;
};

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  
  // Reset method: 'phone' or 'email'
  const [resetMethod, setResetMethod] = useState('phone');

  // Phone reset states
  const [phoneStep, setPhoneStep] = useState('input'); // 'input', 'verify', 'success'
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneOtpError, setPhoneOtpError] = useState('');
  const [phonePassword, setPhonePassword] = useState('');
  const [phonePasswordError, setPhonePasswordError] = useState('');
  const [phoneConfirmPassword, setPhoneConfirmPassword] = useState('');
  const [phoneConfirmPasswordError, setPhoneConfirmPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resetSuccessData, setResetSuccessData] = useState(null);

  // Email reset states
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailValue, setEmailValue] = useState('');

  // Email link recovery mode (hash fragments: #access_token=...&type=recovery)
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryConfirmPassword, setRecoveryConfirmPassword] = useState('');
  const [recoveryPasswordError, setRecoveryPasswordError] = useState('');
  const [recoveryConfirmPasswordError, setRecoveryConfirmPasswordError] = useState('');

  // Resend OTP countdown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Check URL hash for recovery tokens (email link format)
  useEffect(() => {
    const hash = window.location.hash;
    const hasRecoveryToken = hash.includes('access_token') && hash.includes('type=recovery');
    const typeParam = searchParams.get('type');
    
    if (hasRecoveryToken || typeParam === 'recovery') {
      setIsRecoveryMode(true);
      setTimeout(async () => {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) {
          toast.error('Invalid or expired reset link. Please request a new password reset.');
          window.history.replaceState(null, '', '/reset-password');
          setIsRecoveryMode(false);
        }
      }, 500);
    }
  }, [searchParams]);

  // 1. Phone Reset: Send OTP
  const handleSendPhoneOtp = async (e) => {
    e.preventDefault();
    setPhoneError('');
    
    const cleaned = phoneNumber.replace(/\D/g, '');
    if (!cleaned) {
      setPhoneError('Please enter your WhatsApp / phone number');
      return;
    }
    if (!isValidGhanaPhone(cleaned)) {
      setPhoneError('Phone number must be exactly 10 digits (e.g., 024XXXXXXX)');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: cleaned,
          purpose: 'reset_password'
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        toast.success('Password reset code sent to your phone number!');
        setPhoneStep('verify');
        setResendCooldown(60);
      } else {
        const errorMsg = data.error || data.message || 'Failed to send reset code. Please try again.';
        setPhoneError(errorMsg);
        toast.error(errorMsg);
      }
    } catch (err) {
      console.error('Error sending reset OTP:', err);
      toast.error('Unable to send reset code. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Phone Reset: Verify OTP & Update Password
  const handleVerifyPhoneOtpAndReset = async (e) => {
    e.preventDefault();
    setPhoneOtpError('');
    setPhonePasswordError('');
    setPhoneConfirmPasswordError('');

    const cleanCode = phoneOtp.replace(/\D/g, '').trim();
    if (!cleanCode || cleanCode.length !== 6) {
      setPhoneOtpError('Please enter the 6-digit verification code');
      return;
    }

    if (!phonePassword || phonePassword.length < 8) {
      setPhonePasswordError('Password must be at least 8 characters');
      return;
    }

    const hasNumber = /\d/.test(phonePassword);
    const hasLetter = /[a-zA-Z]/.test(phonePassword);
    if (!hasNumber || !hasLetter) {
      setPhonePasswordError('Password must contain both letters and numbers');
      return;
    }

    if (phonePassword !== phoneConfirmPassword) {
      setPhoneConfirmPasswordError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/reset-password-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: phoneNumber.replace(/\D/g, ''),
          code: cleanCode,
          new_password: phonePassword
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setResetSuccessData(data);
        setPhoneStep('success');
        toast.success('Password reset successfully!');

        // Redirect to login after 3 seconds
        setTimeout(() => {
          navigate('/auth');
        }, 3000);
      } else {
        const errorMsg = data.error || 'Failed to reset password. Please try again.';
        if (errorMsg.toLowerCase().includes('otp') || errorMsg.toLowerCase().includes('code')) {
          setPhoneOtpError(errorMsg);
        } else if (errorMsg.toLowerCase().includes('password')) {
          setPhonePasswordError(errorMsg);
        }
        toast.error(errorMsg);
      }
    } catch (err) {
      console.error('Error resetting password with phone:', err);
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Resend phone OTP
  const handleResendPhoneOtp = async () => {
    if (resendCooldown > 0 || loading) return;
    setLoading(true);
    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: phoneNumber.replace(/\D/g, ''),
          purpose: 'reset_password'
        })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        toast.success('New reset code sent to your phone number!');
        setResendCooldown(60);
      } else {
        toast.error(data.error || 'Failed to resend reset code.');
      }
    } catch (err) {
      toast.error('Failed to resend code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Email Reset Request
  const handleRequestEmailReset = async (e) => {
    e.preventDefault();
    setEmailError('');

    if (!isConfigured) {
      toast.error('Service configuration issue. Please contact support.');
      return;
    }

    const trimmedEmail = emailValue.trim();
    if (!trimmedEmail) {
      setEmailError('Please enter your email address');
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setEmailError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: ${window.location.origin}/reset-password,
      });

      if (error) {
        console.error('Password reset error:', error);
        if (error.status === 429 || error.message?.toLowerCase().includes('rate limit')) {
          toast.error('Too many reset requests. Please wait a few minutes before trying again.');
        } else {
          toast.error('Failed to send reset email. Please try again.');
        }
        return;
      }

      setEmailSent(true);
      toast.success('Password reset email sent! Please check your inbox.');
    } catch (err) {
      console.error('Email reset exception:', err);
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Set New Password from Email Recovery Link
  const handleResetPasswordFromRecovery = async (e) => {
    e.preventDefault();
    setRecoveryPasswordError('');
    setRecoveryConfirmPasswordError('');

    if (!recoveryPassword || recoveryPassword.length < 8) {
      setRecoveryPasswordError('Password must be at least 8 characters');
      return;
    }

    const hasNumber = /\d/.test(recoveryPassword);
    const hasLetter = /[a-zA-Z]/.test(recoveryPassword);
    if (!hasNumber || !hasLetter) {
      setRecoveryPasswordError('Password must contain both letters and numbers');
      return;
    }

    if (recoveryPassword !== recoveryConfirmPassword) {
      setRecoveryConfirmPasswordError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: recoveryPassword });
      if (error) {
        if (error.message?.includes('expired') || error.message?.includes('invalid')) {
          toast.error('This reset link has expired. Please request a new password reset.');
          navigate('/reset-password');
        } else {
          toast.error('Failed to update password. Please try again.');
        }
        return;
      }

      toast.success('Password updated successfully! Redirecting to login...');
      await supabase.auth.signOut();
      window.history.replaceState(null, '', '/reset-password');
      setTimeout(() => navigate('/auth'), 2000);
    } catch (err) {
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
      <SEO
        title="Reset Password - BoostUp GH"
        description="Reset your BoostUp GH account password via WhatsApp / SMS or email address."
        keywords="password reset, phone password reset, forgot password, BoostUp GH"
        canonical="/reset-password"
      />
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-6 sm:mb-8 animate-fadeIn">
          <div className="inline-flex items-center justify-center mb-3 sm:mb-4">
            <img 
              src="/download.png" 
              alt="BoostUp GH Logo" 
              className="h-9 sm:h-11 max-w-full object-contain"
            />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            {isRecoveryMode ? 'Set New Password' : 'Reset Your Password'}
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            {isRecoveryMode 
              ? 'Enter your new secure password below' 
              : 'Recover your account using your phone or email'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white border border-gray-200/80 rounded-2xl p-6 sm:p-8 shadow-sm transition-all">
          {/* Recovery Link Mode (from email hash) */}
          {isRecoveryMode ? (
            <form onSubmit={handleResetPasswordFromRecovery} className="space-y-4">
              <div>
                <Label htmlFor="rec-password" className="text-sm font-medium text-gray-700 mb-1.5 block">
                  New Password
                </Label>
                <div className="relative">
                  <Input
                    id="rec-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={recoveryPassword}
                    onChange={(e) => {
                      setRecoveryPassword(e.target.value);
                      if (recoveryPasswordError) setRecoveryPasswordError('');
                    }}
                    required
                    className={w-full h-11 pr-10 rounded-xl }
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {recoveryPasswordError && (
                  <p className="mt-1 text-xs text-red-600">{recoveryPasswordError}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">At least 8 characters with letters & numbers</p>
              </div>

              <div>
                <Label htmlFor="rec-confirm" className="text-sm font-medium text-gray-700 mb-1.5 block">
                  Confirm New Password
                </Label>
                <div className="relative">
                  <Input
                    id="rec-confirm"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={recoveryConfirmPassword}
                    onChange={(e) => {
                      setRecoveryConfirmPassword(e.target.value);
                      if (recoveryConfirmPasswordError) setRecoveryConfirmPasswordError('');
                    }}
                    required
                    className={w-full h-11 pr-10 rounded-xl }
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {recoveryConfirmPasswordError && (
                  <p className="mt-1 text-xs text-red-600">{recoveryConfirmPasswordError}</p>
                )}
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium"
              >
                {loading ? 'Updating...' : 'Update Password'}
              </Button>
            </form>
          ) : (
            /* Normal Reset Form with Method Tabs */
            <>
              {/* Method Selector Tabs */}
              {phoneStep !== 'success' && !emailSent && (
                <div className="flex bg-gray-100 p-1 rounded-xl mb-6 border border-gray-200">
                  <button
                    type="button"
                    onClick={() => {
                      setResetMethod('phone');
                      setPhoneStep('input');
                      setPhoneError('');
                    }}
                    className={lex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all }
                  >
                    <Phone className="w-4 h-4" />
                    Phone / SMS
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setResetMethod('email');
                      setEmailError('');
                    }}
                    className={lex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all }
                  >
                    <Mail className="w-4 h-4" />
                    Email
                  </button>
                </div>
              )}

              {/* METHOD 1: PHONE NUMBER RESET */}
              {resetMethod === 'phone' && (
                <>
                  {phoneStep === 'input' && (
                    <form onSubmit={handleSendPhoneOtp} className="space-y-4">
                      <div>
                        <Label htmlFor="reset-phone" className="text-sm font-medium text-gray-700 mb-1.5 block">
                          WhatsApp / Phone Number
                        </Label>
                        <div className="relative">
                          <Input
                            id="reset-phone"
                            type="tel"
                            placeholder="024XXXXXXX"
                            value={phoneNumber}
                            maxLength={10}
                            onChange={(e) => {
                              const cleaned = e.target.value.replace(/\D/g, '').slice(0, 10);
                              setPhoneNumber(cleaned);
                              if (phoneError) setPhoneError('');
                            }}
                            required
                            className={w-full h-11 rounded-xl }
                          />
                        </div>
                        {phoneError && (
                          <p className="mt-1.5 text-xs text-red-600">{phoneError}</p>
                        )}
                        <p className="mt-1.5 text-xs text-gray-500">
                          Enter your 10-digit registered number to receive an SMS reset code.
                        </p>
                      </div>

                      <Button
                        type="submit"
                        disabled={loading}
                        className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors"
                      >
                        {loading ? 'Sending Code...' : 'Send Reset Code'}
                      </Button>
                    </form>
                  )}

                  {phoneStep === 'verify' && (
                    <form onSubmit={handleVerifyPhoneOtpAndReset} className="space-y-4">
                      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-xs text-indigo-900 flex justify-between items-center">
                        <div>
                          <span>Code sent to: </span>
                          <span className="font-semibold">{phoneNumber}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setPhoneStep('input');
                            setPhoneOtp('');
                            setPhoneOtpError('');
                          }}
                          className="text-indigo-600 hover:underline font-medium ml-2"
                        >
                          Change
                        </button>
                      </div>

                      <div>
                        <Label htmlFor="phone-otp" className="text-sm font-medium text-gray-700 mb-1.5 block">
                          6-Digit Reset Code
                        </Label>
                        <Input
                          id="phone-otp"
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="123456"
                          value={phoneOtp}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                            setPhoneOtp(val);
                            if (phoneOtpError) setPhoneOtpError('');
                          }}
                          required
                          className={w-full h-11 rounded-xl text-center tracking-widest font-mono text-lg }
                        />
                        {phoneOtpError && (
                          <p className="mt-1 text-xs text-red-600">{phoneOtpError}</p>
                        )}
                      </div>

                      <div>
                        <Label htmlFor="phone-new-pass" className="text-sm font-medium text-gray-700 mb-1.5 block">
                          New Password
                        </Label>
                        <div className="relative">
                          <Input
                            id="phone-new-pass"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={phonePassword}
                            onChange={(e) => {
                              setPhonePassword(e.target.value);
                              if (phonePasswordError) setPhonePasswordError('');
                            }}
                            required
                            className={w-full h-11 pr-10 rounded-xl }
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        {phonePasswordError && (
                          <p className="mt-1 text-xs text-red-600">{phonePasswordError}</p>
                        )}
                        <p className="mt-1 text-xs text-gray-500">At least 8 characters with letters & numbers</p>
                      </div>

                      <div>
                        <Label htmlFor="phone-confirm-pass" className="text-sm font-medium text-gray-700 mb-1.5 block">
                          Confirm New Password
                        </Label>
                        <div className="relative">
                          <Input
                            id="phone-confirm-pass"
                            type={showConfirmPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={phoneConfirmPassword}
                            onChange={(e) => {
                              setPhoneConfirmPassword(e.target.value);
                              if (phoneConfirmPasswordError) setPhoneConfirmPasswordError('');
                            }}
                            required
                            className={w-full h-11 pr-10 rounded-xl }
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        {phoneConfirmPasswordError && (
                          <p className="mt-1 text-xs text-red-600">{phoneConfirmPasswordError}</p>
                        )}
                      </div>

                      <Button
                        type="submit"
                        disabled={loading}
                        className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium"
                      >
                        {loading ? 'Resetting Password...' : 'Reset Password'}
                      </Button>

                      <div className="text-center pt-2">
                        {resendCooldown > 0 ? (
                          <span className="text-xs text-gray-400">
                            Resend code in {resendCooldown}s
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={handleResendPhoneOtp}
                            disabled={loading}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Resend Code
                          </button>
                        )}
                      </div>
                    </form>
                  )}

                  {phoneStep === 'success' && (
                    <div className="text-center space-y-4 py-3">
                      <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 text-green-600 rounded-full mb-2">
                        <CheckCircle2 className="w-8 h-8" />
                      </div>
                      <h2 className="text-xl font-bold text-gray-900">Password Reset Successful!</h2>
                      <p className="text-sm text-gray-600">
                        Your account password has been updated.
                        {resetSuccessData?.email_hint && (
                          <span className="block mt-1 font-medium text-gray-900">
                            Registered Email: {resetSuccessData.email_hint}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">Redirecting to login page...</p>
                      <Button
                        type="button"
                        onClick={() => navigate('/auth')}
                        className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium mt-3"
                      >
                        Log In Now
                      </Button>
                    </div>
                  )}
                </>
              )}

              {/* METHOD 2: EMAIL RESET */}
              {resetMethod === 'email' && (
                <>
                  {emailSent ? (
                    <div className="text-center space-y-4 py-2">
                      <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 text-green-600 rounded-full mb-2">
                        <CheckCircle2 className="w-8 h-8" />
                      </div>
                      <h2 className="text-xl font-bold text-gray-900">Check Your Email</h2>
                      <p className="text-sm text-gray-600">
                        We have sent a password reset link to <strong>{emailValue}</strong>
                      </p>
                      <p className="text-xs text-gray-500">
                        Click the link in the email to set a new password. The link will expire in 1 hour.
                      </p>
                      <Button
                        type="button"
                        onClick={() => {
                          setEmailSent(false);
                          setEmailValue('');
                        }}
                        variant="outline"
                        className="w-full h-11 rounded-xl mt-3"
                      >
                        Send Another Email
                      </Button>
                    </div>
                  ) : (
                    <form onSubmit={handleRequestEmailReset} className="space-y-4">
                      <div>
                        <Label htmlFor="reset-email" className="text-sm font-medium text-gray-700 mb-1.5 block">
                          Email Address
                        </Label>
                        <Input
                          id="reset-email"
                          type="email"
                          placeholder="you@example.com"
                          value={emailValue}
                          onChange={(e) => {
                            setEmailValue(e.target.value);
                            if (emailError) setEmailError('');
                          }}
                          required
                          className={w-full h-11 rounded-xl }
                        />
                        {emailError && (
                          <p className="mt-1.5 text-xs text-red-600">{emailError}</p>
                        )}
                        <p className="mt-1.5 text-xs text-gray-500">
                          We will send a password reset link to this email address.
                        </p>
                      </div>

                      <Button
                        type="submit"
                        disabled={loading}
                        className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors"
                      >
                        {loading ? 'Sending...' : 'Send Reset Link'}
                      </Button>
                    </form>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Back to Login */}
        <p className="text-center text-sm text-gray-600 mt-6">
          <button
            onClick={() => navigate('/auth')}
            className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 font-medium px-2 py-1 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Login
          </button>
        </p>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
