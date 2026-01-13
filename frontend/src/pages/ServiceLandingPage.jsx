import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import SEO from '@/components/SEO';
import { generateServiceSchema, generateBreadcrumbSchema } from '@/utils/schema';
import { generateServiceMetaTags } from '@/utils/metaTags';
import { getServiceKeywords } from '@/data/keywords';
import { ArrowRight, TrendingUp, Shield, Clock, DollarSign, CheckCircle, Users, Heart, Eye, MessageCircle } from 'lucide-react';
import Navbar from '@/components/Navbar';

const ServiceLandingPage = ({ user, onLogout }) => {
  const { platform, serviceType } = useParams();
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchServices();
  }, [platform, serviceType]);

  const fetchServices = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('services')
        .select('*')
        .eq('platform', platform?.toLowerCase())
        .eq('service_type', serviceType?.toLowerCase())
        .eq('enabled', true)
        .order('rate', { ascending: true });

      if (fetchError) throw fetchError;
      setServices(data || []);
    } catch (err) {
      console.error('Error fetching services:', err);
      setError('Failed to load services');
    } finally {
      setLoading(false);
    }
  };

  const platformDisplay = platform?.charAt(0).toUpperCase() + platform?.slice(1) || '';
  const serviceTypeDisplay = serviceType?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || '';

  // Get primary service for SEO
  const primaryService = services[0];

  // Generate SEO data
  const seoData = primaryService 
    ? generateServiceMetaTags(primaryService, platformDisplay, serviceTypeDisplay)
    : {
        title: `Buy ${platformDisplay} ${serviceTypeDisplay} - ${platformDisplay} ${serviceTypeDisplay} Service`,
        description: `Buy ${platformDisplay} ${serviceTypeDisplay} from BoostUp GH. Get ${serviceTypeDisplay} for your ${platformDisplay} account. Instant delivery, secure payment, best prices.`,
        keywords: getServiceKeywords(platformDisplay, serviceTypeDisplay),
        canonical: `/services/${platform}/${serviceType}`
      };

  // Generate structured data
  const structuredDataArray = [];
  
  if (primaryService) {
    const serviceSchema = generateServiceSchema(primaryService);
    if (serviceSchema) structuredDataArray.push(serviceSchema);
  }

  // Breadcrumb schema
  const breadcrumbItems = [
    { name: 'Home', url: '/' },
    { name: 'Services', url: '/services' },
    { name: `${platformDisplay} Services`, url: `/services?platform=${platform}` },
    { name: `${platformDisplay} ${serviceTypeDisplay}`, url: `/services/${platform}/${serviceType}` }
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

  const getServiceIcon = () => {
    switch (serviceType?.toLowerCase()) {
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

  const ServiceIcon = getServiceIcon();

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

  if (error || services.length === 0) {
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              {platformDisplay} {serviceTypeDisplay} Services
            </h1>
            <p className="text-gray-600 mb-6">
              {error || 'No services available for this combination at the moment.'}
            </p>
            <Button onClick={() => navigate('/services')}>
              Browse All Services
            </Button>
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
              <ServiceIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              Buy {platformDisplay} {serviceTypeDisplay}
            </h1>
            <p className="text-lg sm:text-xl text-indigo-100 max-w-2xl mx-auto mb-8">
              Get {serviceTypeDisplay} for your {platformDisplay} account. Instant delivery, secure payment, best prices in Ghana.
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
            Why Choose Our {platformDisplay} {serviceTypeDisplay} Service?
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

      {/* Services List */}
      <section className="py-12 sm:py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-8 sm:mb-12">
            Available {platformDisplay} {serviceTypeDisplay} Packages
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service) => (
              <div
                key={service.id}
                className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <h3 className="text-lg font-bold text-gray-900 mb-2">{service.name}</h3>
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">{service.description}</p>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-2xl font-bold text-indigo-600">₵{service.rate}</p>
                    <p className="text-xs text-gray-500">per {service.rate_unit || 1000}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Min: {service.min_quantity.toLocaleString()}</p>
                    <p className="text-sm text-gray-600">Max: {service.max_quantity.toLocaleString()}</p>
                  </div>
                </div>
                {user ? (
                  <Button
                    onClick={() => navigate('/dashboard', { state: { selectedServiceId: service.id } })}
                    className="w-full"
                  >
                    Order Now
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={() => navigate('/auth')}
                    className="w-full"
                    variant="outline"
                  >
                    Sign Up to Order
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 sm:py-16 bg-indigo-600 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            Ready to Boost Your {platformDisplay} Account?
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

export default ServiceLandingPage;

