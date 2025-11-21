import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { TrendingUp } from 'lucide-react';

const AuthPage = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate inputs
      if (!formData.email.trim()) {
        toast.error('Please enter your email');
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
          
          toast.error(errorMsg);
          setLoading(false);
          return;
        }

        if (data.user) {
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
        const { data, error } = await supabase.auth.signUp({
          email: formData.email.trim(),
          password: formData.password,
          options: {
            data: {
              name: formData.name.trim(),
            },
          },
        });

        if (error) {
          let errorMsg = 'Signup failed';
          
          if (error.message?.includes('already registered') || error.message?.includes('User already registered')) {
            errorMsg = 'Email already registered. Please try logging in instead.';
          } else if (error.message?.includes('Password')) {
            errorMsg = 'Password does not meet requirements. Please use at least 6 characters.';
          } else if (error.status === 422) {
            errorMsg = 'Signup failed. Email may already be registered or password does not meet requirements.';
          } else {
            errorMsg = error.message || 'Signup failed. Please try again.';
          }
          
          toast.error(errorMsg);
          setLoading(false);
          return;
        }

        if (data.user) {
          // Create profile
          try {
            const { error: profileError } = await supabase.from('profiles').insert({
              id: data.user.id,
              email: formData.email.trim(),
              name: formData.name.trim(),
              balance: 0.0,
              role: 'user',
            });

            if (profileError && !profileError.message?.includes('duplicate')) {
              console.warn('Profile creation warning:', profileError);
            }
          } catch (err) {
            console.warn('Profile creation error:', err);
          }

          if (data.session) {
            // User is automatically logged in
            toast.success('Account created successfully!');
            navigate('/dashboard');
          } else {
            // Email confirmation required
            toast.success('Account created! Please check your email to confirm your account.');
            navigate('/auth');
          }
        } else {
          toast.error('Signup failed. Please try again.');
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8 animate-fadeIn">
          <div className="inline-flex items-center space-x-2 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-7 h-7 text-white" />
            </div>
            <span className="text-3xl font-bold text-gray-800">BoostUp GH</span>
          </div>
          <p className="text-gray-600">Grow your social media presence</p>
        </div>

        {/* Auth Form */}
        <div className="glass rounded-3xl p-8 animate-slideUp">
          <div className="flex gap-2 mb-6">
            <Button
              type="button"
              onClick={() => setIsLogin(true)}
              className={`flex-1 rounded-full ${
                isLogin
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white'
                  : 'bg-white/50 text-gray-700 hover:bg-white/80'
              }`}
            >
              Login
            </Button>
            <Button
              type="button"
              onClick={() => setIsLogin(false)}
              className={`flex-1 rounded-full ${
                !isLogin
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white'
                  : 'bg-white/50 text-gray-700 hover:bg-white/80'
              }`}
            >
              Register
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <div>
                <Label htmlFor="name" className="text-gray-700 font-medium mb-2 block">
                  Full Name
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required={!isLogin}
                  className="rounded-xl bg-white/70 border-gray-200 focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
            )}

            <div>
              <Label htmlFor="email" className="text-gray-700 font-medium mb-2 block">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className="rounded-xl bg-white/70 border-gray-200 focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>

            <div>
              <Label htmlFor="password" className="text-gray-700 font-medium mb-2 block">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                className="rounded-xl bg-white/70 border-gray-200 focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full btn-hover bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white py-6 rounded-full text-base font-medium"
            >
              {loading ? 'Processing...' : isLogin ? 'Login' : 'Create Account'}
            </Button>
          </form>
        </div>

        <p className="text-center text-gray-600 mt-6">
          <button
            onClick={() => navigate('/')}
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            ← Back to Home
          </button>
        </p>
      </div>
    </div>
  );
};

export default AuthPage;
