import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import SEO from '@/components/SEO';
import { generateBreadcrumbSchema } from '@/utils/schema';
import { generatePlatformMetaTags } from '@/utils/metaTags';
import { ArrowRight, Instagram, Youtube, Facebook, Twitter, Music, TrendingUp, Shield, Clock, DollarSign, Users, Heart, Eye, MessageCircle } from 'lucide-react';
import Navbar from '@/components/Navbar';

const PlatformLandingPage = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [serviceTypes, setServiceTypes] = useState([]);

  // Extract platform from URL path (e.g., /instagram-services -> instagram)
  const platformName = location.pathname.replace('/', '').replace('-services', '').toLowerCase() || '';
  const platformDisplay = platformName.charAt(0).toUpperCase() + platformName.slice(1);

  const platformIcons = {
    instagram: Instagram,
    tiktok: Music,
    youtube: Youtube,
    facebook: Facebook,
    twitter: Twitter
  };

  const PlatformIcon = platformIcons[platformName] || TrendingUp;

  useEffect(() => {
    fetchServices();
  }, [platformName]);

  const fetchServices = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('platform', platformName)
        .eq('enabled', true)
        .order('service_type', { ascending: true });

      if (error) throw error;
      
      setServices(data || []);
      
      // Get unique service types
      const types = [...new Set((data || []).map(s => s.service_type))];
      setServiceTypes(types);
    } catch (err) {
      console.error('Error fetching services:', err);
    } finally {
      setLoading(false);
    }
  };

  // Generate SEO data
  const seoData = generatePlatformMetaTags(platformName);

  // Generate structured data
  const structuredDataArray = [];
  
  // Breadcrumb schema
  const breadcrumbItems = [
    { name: 'Home', url: '/' },
    { name: 'Services', url: '/services' },
    { name: `${platformDisplay} Services`, url: `/${platformName}-services` }
  ];
  const breadcrumbSchema = generateBreadcrumbSchema(breadcrumbItems);
  if (breadcrumbSchema) structuredDataArray.push(breadcrumbSchema);

  const features = [
    {
      icon: TrendingUp,
      title: 'Instant Delivery',
      description: 'Orders start within minutes of payment confirmation'
    },
    {
      icon: Shield,
      title: 'Safe & Secure',
      description: '100% safe for your account, no risk of bans'
    },
    {
      icon: Clock,
      title: '24/7 Support',
      description: 'Round-the-clock customer support available'
    },
    {
      icon: DollarSign,
      title: 'Best Prices',
      description: 'Competitive rates with transparent pricing'
    }
  ];

  const getServiceTypeIcon = (type) => {
    switch (type?.toLowerCase()) {
      case 'followers':
      case 'subscribers':
        return Users;
      case 'likes':
        return Heart;
      case 'views':
        return Eye;
      case 'comments':
        return MessageCircle;
      default:
        return TrendingUp;
    }
  };

  const getServiceTypeDisplay = (type) => {
    return type?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || '';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar user={user} onLogout={onLogout} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-indigo-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading services...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} onLogout={onLogout} />
      <SEO
        title={seoData.title}
        description={seoData.description}
        keywords={seoData.keywords}
        canonical={seoData.canonical}
        structuredDataArray={structuredDataArray}
      />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white py-12 sm:py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-full mb-6">
              <PlatformIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              {platformDisplay} SMM Services
            </h1>
            <p className="text-lg sm:text-xl text-indigo-100 max-w-2xl mx-auto mb-8">
              Grow your {platformDisplay} account with our comprehensive SMM services. Buy followers, likes, views, and more. Instant delivery, secure payment.
            </p>
            {user ? (
              <Button
                onClick={() => navigate('/dashboard')}
                size="lg"
                className="bg-white text-indigo-600 hover:bg-gray-100"
              >
                Get Started
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            ) : (
              <Button
                onClick={() => navigate('/auth')}
                size="lg"
                className="bg-white text-indigo-600 hover:bg-gray-100"
              >
                Sign Up to Order
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-12 sm:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-8 sm:mb-12">
            Why Choose Our {platformDisplay} Services?
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <div key={index} className="text-center">
                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                  <feature.icon className="w-6 h-6 text-indigo-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Service Types Section */}
      <section className="py-12 sm:py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-8 sm:mb-12">
            Available {platformDisplay} Services
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {serviceTypes.map((type) => {
              const typeServices = services.filter(s => s.service_type === type);
              const minRate = Math.min(...typeServices.map(s => s.rate));
              const ServiceTypeIcon = getServiceTypeIcon(type);
              const typeDisplay = getServiceTypeDisplay(type);

              return (
                <div
                  key={type}
                  className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(`/services/${platformName}/${type}`)}
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <ServiceTypeIcon className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{platformDisplay} {typeDisplay}</h3>
                      <p className="text-sm text-gray-600">{typeServices.length} packages available</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-xl font-bold text-indigo-600">From ₵{minRate}</p>
                      <p className="text-xs text-gray-500">per 1000</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-gray-400" />
                  </div>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/services/${platformName}/${type}`);
                    }}
                    className="w-full"
                  >
                    View Packages
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 sm:py-16 bg-indigo-600 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            Ready to Grow Your {platformDisplay} Account?
          </h2>
          <p className="text-lg text-indigo-100 mb-8">
            Join thousands of satisfied customers and start growing your {platformDisplay} presence today.
          </p>
          {user ? (
            <Button
              onClick={() => navigate('/dashboard')}
              size="lg"
              className="bg-white text-indigo-600 hover:bg-gray-100"
            >
              Go to Dashboard
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          ) : (
            <Button
              onClick={() => navigate('/auth')}
              size="lg"
              className="bg-white text-indigo-600 hover:bg-gray-100"
            >
              Get Started Free
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          )}
        </div>
      </section>
    </div>
  );
};

export default PlatformLandingPage;

