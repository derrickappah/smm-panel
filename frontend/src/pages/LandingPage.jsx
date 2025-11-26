import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Zap, Shield, TrendingUp, Instagram, Youtube, Facebook, Twitter, Music } from 'lucide-react';
import SEO from '@/components/SEO';

const LandingPage = () => {
  const navigate = useNavigate();

  const platforms = [
    { name: 'Instagram', icon: Instagram, color: 'text-pink-600' },
    { name: 'TikTok', icon: Music, color: 'text-gray-800' },
    { name: 'YouTube', icon: Youtube, color: 'text-red-600' },
    { name: 'Facebook', icon: Facebook, color: 'text-blue-600' },
    { name: 'Twitter', icon: Twitter, color: 'text-sky-500' },
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

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://boostupgh.com/#organization',
        name: 'BoostUp GH',
        url: 'https://boostupgh.com',
        logo: 'https://boostupgh.com/favicon.svg',
        description: 'The most reliable SMM panel for boosting your followers, likes, views, and engagement across all major social media platforms',
        sameAs: [],
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'Customer Service',
          availableLanguage: 'English'
        }
      },
      {
        '@type': 'WebSite',
        '@id': 'https://boostupgh.com/#website',
        url: 'https://boostupgh.com',
        name: 'BoostUp GH',
        description: 'Grow your social media presence instantly with our reliable SMM panel',
        publisher: {
          '@id': 'https://boostupgh.com/#organization'
        },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: 'https://boostupgh.com/services?search={search_term_string}'
          },
          'query-input': 'required name=search_term_string'
        }
      },
      {
        '@type': 'Service',
        '@id': 'https://boostupgh.com/#service',
        name: 'Social Media Marketing Services',
        description: 'Professional SMM panel services for Instagram, TikTok, YouTube, Facebook, and Twitter. Get followers, likes, views, and engagement instantly.',
        provider: {
          '@id': 'https://boostupgh.com/#organization'
        },
        areaServed: 'Worldwide',
        serviceType: 'Social Media Marketing'
      }
    ]
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <SEO
        title="Boost Your Social Media Presence - SMM Panel | BoostUp GH"
        description="Grow your social media presence instantly with BoostUp GH. The most reliable SMM panel for Instagram followers, TikTok views, YouTube subscribers, Facebook likes, and Twitter followers. Instant delivery, secure & safe."
        keywords="SMM panel, social media marketing, Instagram followers, TikTok views, YouTube subscribers, Facebook likes, Twitter followers, social media growth, SMM services, boost followers, increase engagement"
        canonical="/"
        structuredData={structuredData}
      />
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 fixed top-0 left-0 right-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl sm:text-2xl font-bold text-gray-900">BoostUp GH</span>
          </div>
          <Button 
            data-testid="nav-get-started-btn"
            onClick={() => navigate('/auth')} 
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 sm:px-6 py-2 h-10 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200"
          >
            Get Started
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-24 sm:pt-32 pb-16 sm:pb-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto text-center animate-fadeIn">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-gray-900 mb-4 sm:mb-6 leading-tight">
            Grow Your Social Media
            <br />
            <span className="text-indigo-600">
              Presence Instantly
            </span>
          </h1>
          <p className="text-base sm:text-lg text-gray-600 mb-8 sm:mb-10 max-w-2xl mx-auto">
            The most reliable SMM panel for boosting your followers, likes, views, and engagement across all major platforms
          </p>
          <Button 
            data-testid="hero-get-started-btn"
            onClick={() => navigate('/auth')} 
            size="lg"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 sm:px-8 py-3 sm:py-4 h-12 sm:h-14 text-base sm:text-lg rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200"
          >
            Start Boosting Now
            <ArrowRight className="ml-2 w-4 h-4 sm:w-5 sm:h-5" />
          </Button>

          {/* Platform Icons */}
          <div className="flex justify-center items-center gap-6 sm:gap-8 mt-12 sm:mt-16 flex-wrap">
            {platforms.map((platform) => (
              <div key={platform.name} className="flex flex-col items-center space-y-2 animate-slideUp">
                <div className="bg-white border border-gray-200 w-14 h-14 sm:w-16 sm:h-16 rounded-lg flex items-center justify-center shadow-sm hover:shadow-md transition-shadow duration-200">
                  <platform.icon className={`w-7 h-7 sm:w-8 sm:h-8 ${platform.color}`} />
                </div>
                <span className="text-xs sm:text-sm font-medium text-gray-700">{platform.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-12 sm:py-16 lg:py-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-center text-gray-900 mb-8 sm:mb-12">
            Why Choose BoostUp GH?
          </h2>
          <div className="grid md:grid-cols-3 gap-6 sm:gap-8">
            {features.map((feature, index) => (
              <div 
                key={index} 
                className="bg-white border border-gray-200 rounded-lg p-6 sm:p-8 shadow-sm hover:shadow-md transition-shadow duration-200 animate-slideUp"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-indigo-100 rounded-lg flex items-center justify-center mb-4 sm:mb-6">
                  <feature.icon className="w-6 h-6 sm:w-7 sm:h-7 text-indigo-600" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:mb-3">{feature.title}</h3>
                <p className="text-sm sm:text-base text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 sm:py-16 lg:py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto bg-white border border-gray-200 rounded-lg p-8 sm:p-12 shadow-sm text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4 sm:mb-6">
            Ready to Boost Your Social Media?
          </h2>
          <p className="text-base sm:text-lg text-gray-600 mb-6 sm:mb-8">
            Join thousands of satisfied customers and start growing today
          </p>
          <Button 
            data-testid="cta-get-started-btn"
            onClick={() => navigate('/auth')} 
            size="lg"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 sm:px-8 py-3 sm:py-4 h-12 sm:h-14 text-base sm:text-lg rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200"
          >
            Get Started Free
            <ArrowRight className="ml-2 w-4 h-4 sm:w-5 sm:h-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 sm:py-8 px-4 sm:px-6 border-t border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto text-center text-sm sm:text-base text-gray-600">
          <p>&copy; 2025 BoostUp GH. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;