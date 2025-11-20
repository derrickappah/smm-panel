import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { axiosInstance } from '@/App';
import { TrendingUp } from 'lucide-react';

const AuthPage = ({ onLogin }) => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const response = await axiosInstance.post(endpoint, formData);
      
      localStorage.setItem('token', response.data.token);
      toast.success(isLogin ? 'Welcome back!' : 'Account created successfully!');
      await onLogin();
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Authentication failed');
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
              data-testid="login-tab-btn"
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
              data-testid="register-tab-btn"
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
                <Label htmlFor="name" className="text-gray-700 font-medium mb-2 block">Full Name</Label>
                <Input
                  id="name"
                  data-testid="register-name-input"
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
              <Label htmlFor="email" className="text-gray-700 font-medium mb-2 block">Email</Label>
              <Input
                id="email"
                data-testid="auth-email-input"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className="rounded-xl bg-white/70 border-gray-200 focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>

            <div>
              <Label htmlFor="password" className="text-gray-700 font-medium mb-2 block">Password</Label>
              <Input
                id="password"
                data-testid="auth-password-input"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                className="rounded-xl bg-white/70 border-gray-200 focus:border-indigo-500 focus:ring-indigo-500"
              />
            </div>

            <Button
              data-testid="auth-submit-btn"
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