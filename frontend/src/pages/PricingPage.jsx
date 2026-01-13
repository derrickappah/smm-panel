import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SEO from '@/components/SEO';
import Navbar from '@/components/Navbar';
import { generateBreadcrumbSchema } from '@/utils/schema';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle } from 'lucide-react';

const PricingPage = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSampleServices();
  }, []);

  const fetchSampleServices = async () => {
    try {
      // Try with rate_unit first, fallback to without it if column doesn't exist
      let { data, error } = await supabase
        .from('services')
        .select('id, platform, service_type, name, rate, rate_unit, min_quantity, max_quantity')
        .eq('enabled', true)
        .order('platform', { ascending: true })
        .order('rate', { ascending: true })
        .limit(20);

      // If rate_unit column doesn't exist, try without it
      if (error && (error.message?.includes('rate_unit') || error.code === '42703')) {
        console.warn('rate_unit column not found, fetching without it:', error.message);
        const fallbackResult = await supabase
          .from('services')
          .select('id, platform, service_type, name, rate, min_quantity, max_quantity')
          .eq('enabled', true)
          .order('platform', { ascending: true })
          .order('rate', { ascending: true })
          .limit(20);
        
        if (fallbackResult.error) throw fallbackResult.error;
        
        // Add default rate_unit for backward compatibility
        data = (fallbackResult.data || []).map(service => ({ ...service, rate_unit: 1000 }));
        error = null;
      }

      if (error) throw error;
      setServices(data || []);
    } catch (err) {
      console.error('Error fetching services:', err);
    } finally {
      setLoading(false);
    }
  };

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Pricing', url: '/pricing' }
  ]);

  const keywords = [
    'SMM panel pricing',
    'social media services pricing',
    'Instagram followers price',
    'TikTok views price',
    'YouTube subscribers price',
    'cheap SMM panel',
    'affordable social media services'
  ];

  // Group services by platform
  const servicesByPlatform = services.reduce((acc, service) => {
    const platform = service.platform || 'other';
    if (!acc[platform]) acc[platform] = [];
    acc[platform].push(service);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} onLogout={onLogout} />
      <SEO
        title="Pricing - SMM Services Pricing | BoostUp GH"
        description="View our competitive pricing for Instagram followers, TikTok views, YouTube subscribers, Facebook likes, and Twitter followers. Transparent pricing, no hidden fees."
        keywords={keywords}
        canonical="/pricing"
        structuredDataArray={[breadcrumbSchema]}
      />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white py-12 sm:py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              Transparent Pricing
            </h1>
            <p className="text-lg sm:text-xl text-indigo-100 max-w-2xl mx-auto">
              Competitive rates with no hidden fees. See our pricing for all social media services.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Tables */}
      <section className="py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-indigo-600 mx-auto"></div>
              <p className="text-gray-600 mt-4">Loading pricing...</p>
            </div>
          ) : (
            <div className="space-y-12">
              {Object.keys(servicesByPlatform).map((platform) => {
                const platformServices = servicesByPlatform[platform];
                const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);

                return (
                  <div key={platform}>
                    <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">
                      {platformName} Services Pricing
                    </h2>
                    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Service
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Price per Unit
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Quantity Range
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Action
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {platformServices.map((service, index) => (
                              <tr key={index} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm font-medium text-gray-900">{service.name}</div>
                                  <div className="text-xs text-gray-500 capitalize">
                                    {service.service_type?.replace(/_/g, ' ')}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm font-bold text-indigo-600">₵{service.rate}</div>
                                  <div className="text-xs text-gray-500">per {service.rate_unit || 1000}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                  {service.min_quantity?.toLocaleString()} - {service.max_quantity?.toLocaleString()}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  {user ? (
                                    <Button
                                      size="sm"
                                      onClick={() => navigate('/dashboard', { state: { selectedServiceId: service.id } })}
                                    >
                                      Order Now
                                    </Button>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => navigate('/auth')}
                                    >
                                      Sign Up
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section className="py-12 sm:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-12">
            Why Choose Our Pricing?
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="flex items-start gap-4">
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-gray-900 mb-2">Transparent Pricing</h3>
                <p className="text-sm text-gray-600">No hidden fees. What you see is what you pay.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-gray-900 mb-2">Competitive Rates</h3>
                <p className="text-sm text-gray-600">Best prices in the market for quality services.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-gray-900 mb-2">Flexible Packages</h3>
                <p className="text-sm text-gray-600">Choose the quantity that fits your needs.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-gray-900 mb-2">Instant Delivery</h3>
                <p className="text-sm text-gray-600">Orders start within minutes of payment.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-gray-900 mb-2">Money-Back Guarantee</h3>
                <p className="text-sm text-gray-600">Not satisfied? Get a full refund within 7 days.</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-gray-900 mb-2">24/7 Support</h3>
                <p className="text-sm text-gray-600">Our support team is always ready to help.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 sm:py-16 bg-indigo-600 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-lg text-indigo-100 mb-8">
            Create an account and start growing your social media presence today.
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
              Sign Up Free
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          )}
        </div>
      </section>
    </div>
  );
};

export default PricingPage;

