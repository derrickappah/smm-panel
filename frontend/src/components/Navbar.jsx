import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { TrendingUp, LayoutDashboard, Package, History, Shield, LogOut, Menu, X, User, HelpCircle, Receipt } from 'lucide-react';

const Navbar = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/services', label: 'Services', icon: Package },
    { path: '/orders', label: 'Orders', icon: History },
    { path: '/transactions', label: 'Transactions', icon: Receipt },
    { path: '/support', label: 'Support', icon: HelpCircle },
  ];

  if (user?.role === 'admin') {
    navItems.push({ path: '/admin', label: 'Admin', icon: Shield });
  }

  const handleNavClick = (path) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div 
            className="flex items-center space-x-2 cursor-pointer flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 rounded-lg" 
            onClick={() => {
              navigate('/dashboard');
              setMobileMenuOpen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate('/dashboard');
                setMobileMenuOpen(false);
              }
            }}
            tabIndex={0}
            role="button"
            aria-label="Go to dashboard"
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
            </div>
            <span className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">BoostUp GH</span>
          </div>

          {/* Desktop Nav Items */}
          <div className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Button
                  key={item.path}
                  data-testid={`nav-${item.label.toLowerCase()}-btn`}
                  onClick={() => navigate(item.path)}
                  className={`flex items-center space-x-2 rounded-lg px-3 sm:px-4 py-2 text-sm font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                    isActive
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : 'bg-transparent text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Button>
              );
            })}
          </div>

          {/* Desktop User Info & Actions */}
          <div className="hidden md:flex items-center space-x-3 sm:space-x-4">
            <div className="text-right">
              <p className="text-xs sm:text-sm font-medium text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-600">₵{user?.balance?.toFixed(2) || '0.00'}</p>
            </div>
            <Button
              data-testid="logout-btn"
              onClick={onLogout}
              variant="ghost"
              className="text-gray-700 hover:text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 rounded-lg"
              aria-label="Logout"
            >
              <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
            </Button>
          </div>

          {/* Mobile: User Balance & Menu Button */}
          <div className="flex md:hidden items-center space-x-2 sm:space-x-3">
            {/* User Balance - Mobile */}
            <div className="flex items-center space-x-2 bg-gray-50 border border-gray-200 rounded-lg px-2 sm:px-3 py-1.5">
              <div className="w-5 h-5 sm:w-6 sm:h-6 bg-indigo-600 rounded-full flex items-center justify-center">
                <User className="w-3 h-3 text-white" />
              </div>
              <span className="text-xs sm:text-sm font-semibold text-gray-900">₵{user?.balance?.toFixed(2) || '0.00'}</span>
            </div>
            
            {/* Hamburger Menu Button */}
            <Button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              variant="ghost"
              className="p-2 text-gray-700 hover:bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5 sm:w-6 sm:h-6" />
              ) : (
                <Menu className="w-5 h-5 sm:w-6 sm:h-6" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Menu - Slide Down */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 pb-4 animate-slideDown border-t border-gray-200 pt-4">
            {/* User Info - Mobile */}
            <div className="mb-4 pb-4 border-b border-gray-200">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{user?.name}</p>
                  <p className="text-xs text-gray-600">{user?.email}</p>
                </div>
              </div>
              <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5">
                <span className="text-xs font-medium text-gray-600">Balance</span>
                <span className="text-base sm:text-lg font-bold text-gray-900">₵{user?.balance?.toFixed(2) || '0.00'}</span>
              </div>
            </div>

            {/* Mobile Nav Items */}
            <div className="space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Button
                    key={item.path}
                    onClick={() => handleNavClick(item.path)}
                    className={`w-full justify-start items-center space-x-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                      isActive
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </Button>
                );
              })}
            </div>

            {/* Logout Button - Mobile */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <Button
                data-testid="logout-btn"
                onClick={() => {
                  onLogout();
                  setMobileMenuOpen(false);
                }}
                variant="ghost"
                className="w-full justify-start items-center space-x-3 rounded-lg px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                <LogOut className="w-5 h-5" />
                <span>Logout</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;