import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
// SMMGen import removed - only using Supabase services
import Navbar from '@/components/Navbar';
import { Instagram, Youtube, Facebook, Twitter, ArrowRight } from 'lucide-react';
import SEO from '@/components/SEO';

const ServicesPage = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [loading, setLoading] = useState(true);

  const platforms = [
    { id: 'all', name: 'All Services', icon: null },
    { id: 'instagram', name: 'Instagram', icon: Instagram, color: 'from-pink-500 to-purple-600' },
    { id: 'tiktok', name: 'TikTok', icon: null, color: 'from-gray-700 to-gray-900' },
    { id: 'youtube', name: 'YouTube', icon: Youtube, color: 'from-red-500 to-red-600' },
    { id: 'facebook', name: 'Facebook', icon: Facebook, color: 'from-blue-500 to-blue-600' },
    { id: 'twitter', name: 'Twitter', icon: Twitter, color: 'from-sky-400 to-sky-600' },
  ];

  useEffect(() => {
    fetchServices();
  }, [selectedPlatform]);

  const fetchServices = async () => {
    setLoading(true);
    try {
      // Fetch services from Supabase only
      // Only fetch enabled services for users
      let query = supabase.from('services').select('*').eq('enabled', true);
      
      if (selectedPlatform !== 'all') {
        query = query.eq('platform', selectedPlatform);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      setServices(data || []);
    } catch (error) {
      console.error('Error fetching services:', error);
      setServices([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredServices = selectedPlatform === 'all' 
    ? services 
    : services.filter(s => s.platform === selectedPlatform);

  const handleServiceClick = (service) => {
    // Navigate to dashboard with the selected service ID
    navigate('/dashboard', { state: { selectedServiceId: service.id } });
  };

  const structuredData = services.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Social Media Marketing Services',
    description: 'Browse our comprehensive list of SMM services for Instagram, TikTok, YouTube, Facebook, and Twitter',
    itemListElement: services.slice(0, 10).map((service, index) => ({
      '@type': 'Service',
      position: index + 1,
      name: service.name,
      description: service.description,
      provider: {
        '@type': 'Organization',
        name: 'BoostUp GH'
      },
      offers: {
        '@type': 'Offer',
        price: service.rate,
        priceCurrency: 'GHS',
        availability: service.enabled ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
      }
    }))
  } : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <SEO
        title="SMM Services - Instagram, TikTok, YouTube, Facebook, Twitter | BoostUp GH"
        description="Browse our comprehensive SMM services for Instagram followers, TikTok views, YouTube subscribers, Facebook likes, and Twitter followers. Competitive rates, instant delivery."
        keywords="SMM services, Instagram followers, TikTok views, YouTube subscribers, Facebook likes, Twitter followers, social media services, SMM panel services"
        canonical="/services"
        structuredData={structuredData}
      />
      <Navbar user={user} onLogout={onLogout} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8 animate-fadeIn">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">Our Services</h1>
          <p className="text-sm sm:text-base text-gray-600">Browse all available services across platforms</p>
        </div>

        {/* Platform Filter */}
        <div className="flex gap-2 sm:gap-3 mb-6 sm:mb-8 overflow-x-auto pb-2 animate-slideUp scrollbar-hide">
          {platforms.map((platform) => {
            const isActive = selectedPlatform === platform.id;
            const getPlatformColor = () => {
              if (!isActive) return 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300';
              switch (platform.id) {
                case 'instagram':
                  return 'bg-pink-600 text-white border-pink-600';
                case 'youtube':
                  return 'bg-red-600 text-white border-red-600';
                case 'facebook':
                  return 'bg-blue-600 text-white border-blue-600';
                case 'twitter':
                  return 'bg-sky-500 text-white border-sky-500';
                case 'tiktok':
                  return 'bg-gray-800 text-white border-gray-800';
                default:
                  return 'bg-indigo-600 text-white border-indigo-600';
              }
            };
            return (
              <Button
                key={platform.id}
                data-testid={`filter-${platform.id}-btn`}
                onClick={() => setSelectedPlatform(platform.id)}
                className={`flex items-center space-x-2 rounded-lg px-4 sm:px-6 py-2 sm:py-2.5 whitespace-nowrap border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${getPlatformColor()}`}
              >
                {platform.icon && <platform.icon className="w-4 h-4" />}
                <span className="text-sm font-medium">{platform.name}</span>
              </Button>
            );
          })}
        </div>

        {/* Services Grid */}
        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-indigo-600 mx-auto"></div>
            <p className="text-sm text-gray-600 mt-4">Loading services...</p>
          </div>
        ) : filteredServices.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center shadow-sm">
            <p className="text-gray-600 text-base sm:text-lg">No services available for this platform yet.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 animate-slideUp">
            {filteredServices.map((service, index) => {
              const getPlatformBadgeColor = () => {
                const platform = service.platform?.toLowerCase();
                switch (platform) {
                  case 'instagram':
                    return 'bg-pink-100 text-pink-700 border-pink-200';
                  case 'youtube':
                    return 'bg-red-100 text-red-700 border-red-200';
                  case 'facebook':
                    return 'bg-blue-100 text-blue-700 border-blue-200';
                  case 'twitter':
                    return 'bg-sky-100 text-sky-700 border-sky-200';
                  case 'tiktok':
                    return 'bg-gray-100 text-gray-700 border-gray-200';
                  default:
                    return 'bg-indigo-100 text-indigo-700 border-indigo-200';
                }
              };
              return (
                <div
                  key={service.id}
                  data-testid={`service-card-${service.id}`}
                  onClick={() => handleServiceClick(service)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleServiceClick(service);
                    }
                  }}
                  tabIndex={0}
                  className="bg-white border border-gray-200 rounded-lg p-5 sm:p-6 shadow-sm hover:shadow-md hover:border-gray-300 cursor-pointer transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded border ${getPlatformBadgeColor()}`}>
                        {service.platform}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-xl sm:text-2xl font-bold text-gray-900">₵{service.rate}</p>
                      <p className="text-xs text-gray-600">per 1000</p>
                    </div>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2">
                    {service.name}
                  </h3>
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">{service.description}</p>
                  <div className="flex justify-between items-center text-xs text-gray-600 pt-4 border-t border-gray-200">
                    <div className="flex gap-3 sm:gap-4">
                      <span className="font-medium">Min: {service.min_quantity.toLocaleString()}</span>
                      <span className="font-medium">Max: {service.max_quantity.toLocaleString()}</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-indigo-600" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ServicesPage;
