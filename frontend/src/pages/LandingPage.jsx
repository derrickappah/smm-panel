import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Users, Zap, Shield, TrendingUp, Instagram, Youtube } from 'lucide-react';

const LandingPage = () => {
  const navigate = useNavigate();

  const platforms = [
    { name: 'Instagram', icon: Instagram, color: 'text-pink-600' },
    { name: 'TikTok', icon: Users, color: 'text-gray-800' },
    { name: 'YouTube', icon: Youtube, color: 'text-red-600' },
    { name: 'Facebook', icon: Users, color: 'text-blue-600' },
    { name: 'Twitter', icon: Users, color: 'text-sky-500' },
  ];

  const features = [
    {
      icon: Zap,
      title: 'Instant Delivery',
      description: 'Get your orders started within minutes of placing them'
    },
    {
      icon: Shield,
      title: 'Secure & Safe',
      description: 'Your data and orders are protected with enterprise-grade security'
    },
    {
      icon: TrendingUp,
      title: 'Real Growth',
      description: 'High-quality engagement from real accounts'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Navigation */}
      <nav className="glass fixed top-0 left-0 right-0 z-50 border-b border-white/20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-gray-800">BoostUp GH</span>
          </div>
          <Button 
            data-testid="nav-get-started-btn"
            onClick={() => navigate('/auth')} 
            className="btn-hover bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-6 py-2 rounded-full"
          >
            Get Started
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-6xl mx-auto text-center animate-fadeIn">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight">
            Grow Your Social Media
            <br />
            <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Presence Instantly
            </span>
          </h1>
          <p className="text-lg text-gray-600 mb-10 max-w-2xl mx-auto">
            The most reliable SMM panel for boosting your followers, likes, views, and engagement across all major platforms
          </p>
          <Button 
            data-testid="hero-get-started-btn"
            onClick={() => navigate('/auth')} 
            size="lg"
            className="btn-hover bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-8 py-6 text-lg rounded-full"
          >
            Start Boosting Now
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>

          {/* Platform Icons */}
          <div className="flex justify-center items-center gap-8 mt-16 flex-wrap">
            {platforms.map((platform) => (
              <div key={platform.name} className="flex flex-col items-center space-y-2 animate-slideUp">
                <div className="glass w-16 h-16 rounded-2xl flex items-center justify-center card-hover">
                  <platform.icon className={`w-8 h-8 ${platform.color}`} />
                </div>
                <span className="text-sm font-medium text-gray-700">{platform.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center text-gray-900 mb-12">
            Why Choose BoostUp GH?
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div 
                key={index} 
                className="glass p-8 rounded-3xl card-hover animate-slideUp"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="w-14 h-14 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center mb-6">
                  <feature.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto glass rounded-3xl p-12 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
            Ready to Boost Your Social Media?
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            Join thousands of satisfied customers and start growing today
          </p>
          <Button 
            data-testid="cta-get-started-btn"
            onClick={() => navigate('/auth')} 
            size="lg"
            className="btn-hover bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-8 py-6 text-lg rounded-full"
          >
            Get Started Free
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-gray-200">
        <div className="max-w-6xl mx-auto text-center text-gray-600">
          <p>&copy; 2025 BoostUp GH. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;