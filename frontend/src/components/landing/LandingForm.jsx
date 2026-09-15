import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { supabase, isConfigured } from '@/lib/supabase';
import { logLoginAttempt } from '@/lib/activityLogger';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { trackMetaEvent } from '@/lib/metaPixel';

import { Turnstile } from '@/components/ui/turnstile';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';

const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

const isValidGhanaPhone = (phone) => {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length === 10;
};

const formatGhanaPhone = (value) => {
    // Allow digits, spaces, plus signs, dashes, parentheses
    return value.replace(/[^\d+\s().-]/g, '');
};

export const LandingForm = () => {
    const navigate = useNavigate();
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(true);
    const [captchaToken, setCaptchaToken] = useState('');
    const { requireCaptcha, requirePhoneVerification, requireOtp } = usePaymentMethods();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        name: '',
        phone_number: '',
        referral_code: ''
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (loading) return;
        setLoading(true);

        try {
            if (!isConfigured) {
                toast.error('Service configuration error. Please contact support.');
                return;
            }

            const loginIdentifier = formData.email.trim();
            const password = formData.password;
            const isEmail = loginIdentifier.includes('@');
            let cleanPhone = '';
            let isPhone = false;

            if (!isEmail) {
                cleanPhone = loginIdentifier.replace(/\D/g, '');
                if (cleanPhone.length === 12 && cleanPhone.startsWith('233')) {
                    cleanPhone = '0' + cleanPhone.substring(3);
                } else if (cleanPhone.length === 9) {
                    cleanPhone = '0' + cleanPhone;
                }
                isPhone = cleanPhone.length === 10;
            }

            if (isLogin) {
                if (!isEmail && !isPhone) {
                    toast.error('Please enter a valid email address or 10-digit WhatsApp number');
                    return;
                }
                if (isEmail && !isValidEmail(loginIdentifier)) {
                    toast.error('Please enter a valid email address');
                    return;
                }
            } else {
                if (!isValidEmail(loginIdentifier)) {
                    toast.error('Please enter a valid email address');
                    return;
                }
            }

            if (password.length < 6) {
                toast.error('Password must be at least 6 characters');
                return;
            }

            if (requireCaptcha && !captchaToken) {
                toast.error('Please complete the CAPTCHA verification');
                return;
            }

            if (!isLogin) {
                if (!formData.name.trim()) {
                    toast.error('Please enter your full name');
                    return;
                }
                if (formData.name.trim().length > 25) {
                    toast.error('Name must not exceed 25 characters');
                    return;
                }
                if (!formData.phone_number.trim()) {
                    toast.error('Please enter your WhatsApp number');
                    return;
                }
                if (!isValidGhanaPhone(formData.phone_number)) {
                    toast.error('WhatsApp number must be exactly 10 digits');
                    return;
                }
                try {
                    const { data: isRegistered } = await supabase.rpc('check_phone_registered', {
                        p_phone: formData.phone_number.trim()
                    });
                    if (isRegistered) {
                        toast.error('Failed to send OTP verification code, number already registered');
                        return;
                    }
                } catch (phoneErr) {
                    console.warn('Phone check error:', phoneErr);
                }
                if (!termsAccepted) {
                    toast.error('Please accept the Terms and Conditions');
                    return;
                }
            }

            if (isLogin) {
                let authUser = null;

                if (isPhone) {
                    const res = await fetch('/api/auth/login-phone', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            phone_number: cleanPhone,
                            password,
                            captchaToken: requireCaptcha ? (captchaToken || undefined) : undefined,
                            captcha_token: requireCaptcha ? (captchaToken || undefined) : undefined,
                        })
                    });

                    const data = await res.json();

                    if (!res.ok) {
                        if (window.turnstile) {
                            try {
                                window.turnstile.reset();
                            } catch (e) {}
                        }
                        setCaptchaToken('');
                        const errorMsg = data.error || 'Login failed. Please check your credentials.';
                        await logLoginAttempt({ success: false, email: cleanPhone, error: errorMsg });
                        toast.error(errorMsg);
                        return;
                    }

                    const { error: sessionError } = await supabase.auth.setSession({
                        access_token: data.session.access_token,
                        refresh_token: data.session.refresh_token
                    });

                    if (sessionError) {
                        console.error('Failed to set session:', sessionError);
                        toast.error('Failed to initialize session. Please try logging in again.');
                        return;
                    }

                    authUser = data.user;
                } else {
                    const { data, error } = await supabase.auth.signInWithPassword({
                        email: loginIdentifier,
                        password,
                        options: {
                            captchaToken: requireCaptcha ? (captchaToken || undefined) : undefined,
                            captcha_token: requireCaptcha ? (captchaToken || undefined) : undefined,
                        }
                    });

                    if (error) {
                        if (window.turnstile) {
                            try {
                                window.turnstile.reset();
                            } catch (e) {}
                        }
                        setCaptchaToken('');
                        let errorMsg = 'Login failed';
                        if (error.message?.includes('Invalid login credentials') || error.message?.includes('invalid_credentials')) {
                            errorMsg = 'Invalid email or password';
                        } else if (error.message?.includes('Email not confirmed')) {
                            errorMsg = 'Please check your email and confirm your account';
                        } else {
                            errorMsg = error.message || 'Login failed. Please try again.';
                        }
                        await logLoginAttempt({ success: false, email: loginIdentifier, error: errorMsg });
                        toast.error(errorMsg);
                        return;
                    }

                    authUser = data.user;
                }

                if (authUser) {
                    await logLoginAttempt({ success: true, email: authUser.email || loginIdentifier });
                    toast.success('Welcome back!');
                    navigate('/dashboard');
                }
            } else {
                if (requirePhoneVerification || requireOtp) {
                    const params = new URLSearchParams();
                    params.set('mode', 'signup');
                    if (email) params.set('email', email);
                    if (formData.phone_number) params.set('phone', formData.phone_number);
                    if (formData.name) params.set('name', formData.name);
                    if (formData.referral_code) params.set('ref', formData.referral_code);
                    toast.info('Please complete phone verification to finalize your account.');
                    navigate(`/auth?${params.toString()}`);
                    return;
                }

                const signupMetadata = {
                    name: formData.name.trim(),
                    phone_number: formData.phone_number.trim(),
                    terms_accepted_at: new Date().toISOString(),
                };

                if (formData.referral_code.trim()) {
                    signupMetadata.referral_code = formData.referral_code.trim();
                }

                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: { 
                        data: signupMetadata,
                        captchaToken: requireCaptcha ? (captchaToken || undefined) : undefined,
                        captcha_token: requireCaptcha ? (captchaToken || undefined) : undefined,
                    },
                });

                if (error) {
                    if (window.turnstile) {
                        try {
                            window.turnstile.reset();
                        } catch (e) {}
                    }
                    setCaptchaToken('');
                    let errorMsg = error.message || 'Registration failed';
                    if (error.message?.includes('phone') || error.message?.includes('registered to another account')) {
                        errorMsg = 'This WhatsApp number is already registered. Please sign in instead.';
                    }
                    toast.error(errorMsg);
                    return;
                }

                if (data.user) {
                    trackMetaEvent('CompleteRegistration', {
                        content_name: 'Landing Page Sign Up',
                        status: data.session ? 'completed' : 'pending_confirmation'
                    });

                    if (data.session) {
                        toast.success('Account created successfully!');
                        navigate('/dashboard');
                    } else {
                        toast.success('Please check your email to confirm your account.');
                    }
                }
            }
        } catch (error) {
            toast.error('An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-md mx-auto">
            <div className="backdrop-blur-2xl bg-indigo-950/90 p-6 sm:p-8 rounded-[32px] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
                <div className="flex p-1.5 bg-black/20 rounded-2xl mb-8 border border-white/5">
                    <button
                        onClick={() => {
                            setIsLogin(true);
                            setCaptchaToken('');
                        }}
                        className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 ${isLogin ? 'bg-white text-indigo-600 shadow-xl scale-[1.02]' : 'text-white/40 hover:text-white/70'
                            }`}
                    >
                        Login
                    </button>
                    <button
                        onClick={() => {
                            setIsLogin(false);
                            setCaptchaToken('');
                        }}
                        className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 ${!isLogin ? 'bg-white text-indigo-600 shadow-xl scale-[1.02]' : 'text-white/40 hover:text-white/70'
                            }`}
                    >
                        Sign Up
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {!isLogin && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="space-y-1.5">
                                <Label className="text-white/70 text-xs font-bold uppercase tracking-widest ml-1">Full Name (max 25 chars)</Label>
                                <Input
                                    type="text"
                                    placeholder="John Doe"
                                    maxLength={25}
                                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-12 rounded-xl focus:ring-indigo-500/50"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value.slice(0, 25) })}
                                    required
                                />
                            </div>
                             <div className="space-y-1.5">
                                <Label className="text-white/70 text-xs font-bold uppercase tracking-widest ml-1">WhatsApp Number</Label>
                                <Input
                                    type="tel"
                                    placeholder="e.g. 0559272762"
                                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-12 rounded-xl focus:ring-indigo-500/50"
                                    value={formData.phone_number}
                                    onChange={(e) => setFormData({ ...formData, phone_number: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                                    required
                                />
                                <p className="mt-1 text-xs text-white/50">Compulsory. Must be exactly 10 digits.</p>
                            </div>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label className="text-white/70 text-xs font-bold uppercase tracking-widest ml-1">
                            {isLogin ? 'Email or WhatsApp Number' : 'Email Address'}
                        </Label>
                        <Input
                            type={isLogin ? 'text' : 'email'}
                            placeholder={isLogin ? 'e.g. 0559272762 or name@example.com' : 'name@example.com'}
                            className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-12 rounded-xl focus:ring-indigo-500/50"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            required
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-white/70 text-xs font-bold uppercase tracking-widest ml-1">Password</Label>
                        <div className="relative">
                            <Input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="••••••••"
                                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-12 rounded-xl focus:ring-indigo-500/50 pr-11"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors"
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    {!isLogin && (
                        <div className="flex flex-col space-y-4 pt-2">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="terms"
                                    checked={termsAccepted}
                                    onCheckedChange={setTermsAccepted}
                                    className="border-white/20 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                                />
                                <label htmlFor="terms" className="text-sm text-white/60 cursor-pointer">
                                    I agree to the <span className="text-indigo-400 hover:underline">Terms & Conditions</span>
                                </label>
                            </div>
                        </div>
                    )}

                    {requireCaptcha && <Turnstile onSuccess={setCaptchaToken} />}

                    <Button
                        type="submit"
                        disabled={loading}
                        className="w-full h-12 mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-[0_0_20px_rgba(79,70,229,0.4)] transition-all duration-300 hover:scale-[1.02] disabled:opacity-70 disabled:hover:scale-100"
                    >
                        {loading ? <Loader2 className="animate-spin mr-2" /> : (isLogin ? 'Sign In Now' : 'Create Account')}
                    </Button>

                    {isLogin && (
                        <button
                            type="button"
                            onClick={() => navigate('/reset-password')}
                            className="w-full text-center text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                        >
                            Forgot your password?
                        </button>
                    )}
                </form>
            </div>
        </div>
    );
};
