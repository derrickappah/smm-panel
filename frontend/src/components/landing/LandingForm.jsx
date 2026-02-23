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

const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

const isValidGhanaPhone = (phone) => {
    const cleaned = phone.replace(/\D/g, '');
    return /^0\d{9}$/.test(cleaned);
};

const formatGhanaPhone = (value) => {
    let cleaned = value.replace(/\D/g, '');
    if (cleaned.length === 0) return '';
    if (!cleaned.startsWith('0')) {
        cleaned = '0' + cleaned.substring(0, 9);
    }
    return cleaned.substring(0, 10);
};

export const LandingForm = () => {
    const navigate = useNavigate();
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);
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

            const email = formData.email.trim();
            const password = formData.password;

            if (!isValidEmail(email)) {
                toast.error('Please enter a valid email address');
                return;
            }

            if (password.length < 6) {
                toast.error('Password must be at least 6 characters');
                return;
            }

            if (!isLogin) {
                if (!formData.name.trim()) {
                    toast.error('Please enter your full name');
                    return;
                }
                if (!isValidGhanaPhone(formData.phone_number)) {
                    toast.error('Please enter a valid WhatsApp number (10 digits starting with 0)');
                    return;
                }
                if (!termsAccepted) {
                    toast.error('Please accept the Terms and Conditions');
                    return;
                }
            }

            if (isLogin) {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (error) {
                    await logLoginAttempt({ success: false, email, error: error.message });
                    toast.error(error.message || 'Login failed');
                    return;
                }

                if (data.user) {
                    await logLoginAttempt({ success: true, email });
                    toast.success('Welcome back!');
                    navigate('/dashboard');
                }
            } else {
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
                    options: { data: signupMetadata },
                });

                if (error) {
                    toast.error(error.message || 'Registration failed');
                    return;
                }

                if (data.user) {
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
                        onClick={() => setIsLogin(true)}
                        className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all duration-300 ${isLogin ? 'bg-white text-indigo-600 shadow-xl scale-[1.02]' : 'text-white/40 hover:text-white/70'
                            }`}
                    >
                        Login
                    </button>
                    <button
                        onClick={() => setIsLogin(false)}
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
                                <Label className="text-white/70 text-xs font-bold uppercase tracking-widest ml-1">Full Name</Label>
                                <Input
                                    type="text"
                                    placeholder="John Doe"
                                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-12 rounded-xl focus:ring-indigo-500/50"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-white/70 text-xs font-bold uppercase tracking-widest ml-1">WhatsApp Number</Label>
                                <Input
                                    type="tel"
                                    placeholder="0559272762"
                                    className="bg-white/5 border-white/10 text-white placeholder:text-white/20 h-12 rounded-xl focus:ring-indigo-500/50"
                                    value={formData.phone_number}
                                    onChange={(e) => setFormData({ ...formData, phone_number: formatGhanaPhone(e.target.value) })}
                                    required
                                />
                            </div>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label className="text-white/70 text-xs font-bold uppercase tracking-widest ml-1">Email Address</Label>
                        <Input
                            type="email"
                            placeholder="name@example.com"
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
