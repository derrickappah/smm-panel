import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
// SMMGen import removed - only using Supabase services
import Navbar from '@/components/Navbar';
import { Instagram, Youtube, Facebook, Twitter, ArrowRight, Tag } from 'lucide-react';
import SEO from '@/components/SEO';
import { generateServiceListSchema } from '@/utils/schema';
import { generatePlatformMetaTags } from '@/utils/metaTags';
import { getServiceKeywords, primaryKeywords, longTailKeywords } from '@/data/keywords';
import { usePromotionPackages } from '@/hooks/useAdminPromotionPackages';

const ServicesPage = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [services, setServices] = useState([]);
  const { data: promotionPackages = [] } = usePromotionPackages();
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [loading, setLoading] = useState(true);
  
  // Get platform from URL query if present
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const platformParam = params.get('platform');
    if (platformParam && ['instagram', 'tiktok', 'youtube', 'facebook', 'twitter'].includes(platformParam.toLowerCase())) {
      setSelectedPlatform(platformParam.toLowerCase());
    }
  }, [location.search]);

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
      let query = supabase.from('services').select('id, name, description, rate, platform, enabled, min_quantity, max_quantity, service_type, smmgen_service_id, created_at').eq('enabled', true);
      
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

  const filteredPackages = selectedPlatform === 'all'
    ? promotionPackages
    : promotionPackages.filter(p => p.platform === selectedPlatform);
  
  const scrollContainerRef = useRef(null);
  const isScrollingRef = useRef(false);
  
  // Duplicate items for infinite scroll
  const infinitePackages = useMemo(() => {
    if (filteredPackages.length === 0) return [];
    return [...filteredPackages, ...filteredPackages, ...filteredPackages];
  }, [filteredPackages]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || filteredPackages.length === 0) return;

    const handleScroll = () => {
      if (isScrollingRef.current) return;
      
      const scrollLeft = container.scrollLeft;
      const containerWidth = container.clientWidth;
      const cardWidth = 280 + 16; // min-w-[280px] + gap-4
      const singleSetWidth = filteredPackages.length * cardWidth;
      const centerOffset = (containerWidth - 280) / 2 - 16; // 16px is px-4 padding

      // If scrolled past the end of second set (entering third set), reset to middle (second set)
      if (scrollLeft >= singleSetWidth * 2 - centerOffset) {
        isScrollingRef.current = true;
        const offset = scrollLeft - singleSetWidth * 2;
        container.scrollLeft = singleSetWidth + centerOffset + offset;
        setTimeout(() => {
          isScrollingRef.current = false;
        }, 50);
      }
      // If scrolled before the start of second set (in first set), reset to middle (second set)
      else if (scrollLeft <= singleSetWidth - centerOffset) {
        isScrollingRef.current = true;
        const offset = scrollLeft - (singleSetWidth - centerOffset);
        container.scrollLeft = singleSetWidth + centerOffset + offset;
        setTimeout(() => {
          isScrollingRef.current = false;
        }, 50);
      }
    };

    // Initialize scroll position to center first card of middle set
    const initializeScroll = () => {
      const cardWidth = 280 + 16;
      const singleSetWidth = filteredPackages.length * cardWidth;
      const containerWidth = container.clientWidth;
      if (containerWidth > 0) {
        // Center the first card of the middle set
        const centerOffset = (containerWidth - 280) / 2 - 16; // 16px is px-4 padding
        container.scrollLeft = singleSetWidth + centerOffset;
      }
    };

    // Wait for container to be ready
    requestAnimationFrame(() => {
      initializeScroll();
    });

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [filteredPackages.length]);

  const formatQuantity = (quantity) => {
    if (quantity >= 1000000) {
      return `${(quantity / 1000000).toFixed(1)}M`;
    } else if (quantity >= 1000) {
      return `${(quantity / 1000).toFixed(1)}K`;
    }
    return quantity.toString();
  };

  const handlePackageClick = (pkg) => {
    navigate('/dashboard', { state: { selectedPackageId: pkg.id } });
  };

  const handleServiceClick = (service) => {
    // Navigate to dashboard with the selected service ID
    navigate('/dashboard', { state: { selectedServiceId: service.id } });
  };

  // Generate dynamic SEO based on selected platform
  const seoData = useMemo(() => {
    if (selectedPlatform === 'all') {
      // All services page
      const allKeywords = [
        ...primaryKeywords.smmPanel,
        ...primaryKeywords.instagram.slice(0, 5),
        ...primaryKeywords.tiktok.slice(0, 5),
        ...primaryKeywords.youtube.slice(0, 5),
        ...primaryKeywords.facebook.slice(0, 5),
        ...primaryKeywords.twitter.slice(0, 5),
        'SMM services',
        'social media services',
        'buy followers',
        'buy likes',
        'buy views'
      ];
      
      return {
        title: 'SMM Services - Instagram, TikTok, YouTube, Facebook, Twitter',
        description: 'Browse our comprehensive SMM services for Instagram followers, TikTok views, YouTube subscribers, Facebook likes, and Twitter followers. Buy Instagram followers Ghana, TikTok views, YouTube subscribers. Competitive rates, instant delivery, secure payment.',
        keywords: allKeywords,
        canonical: '/services'
      };
    } else {
      // Platform-specific page
      const platformName = selectedPlatform.charAt(0).toUpperCase() + selectedPlatform.slice(1);
      const platformKeywords = getServiceKeywords(platformName, '');
      const metaTags = generatePlatformMetaTags(selectedPlatform);
      
      return {
        title: metaTags.title,
        description: metaTags.description,
        keywords: metaTags.keywords,
        canonical: `/services?platform=${selectedPlatform}`
      };
    }
  }, [selectedPlatform]);

  const structuredData = useMemo(() => {
    if (services.length === 0) return null;
    
    const serviceListSchema = generateServiceListSchema(services);
    return serviceListSchema;
  }, [services]);

  return (
    <div className="min-h-screen bg-gray-50">
      <SEO
        title={seoData.title}
        description={seoData.description}
        keywords={seoData.keywords}
        canonical={seoData.canonical}
        structuredData={structuredData}
      />
      <Navbar user={user} onLogout={onLogout} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 md:pt-6 pb-6 sm:pb-8">
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

        {/* Promotion Packages Section */}
        {filteredPackages.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Tag className="w-5 h-5 text-purple-600" />
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Special Promotion Packages</h2>
            </div>
            <div 
              ref={scrollContainerRef}
              className="flex overflow-x-auto snap-x snap-mandatory gap-4 sm:gap-6 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:snap-none animate-slideUp mb-8 scrollbar-hide"
              style={{ scrollSnapType: 'x mandatory' }}
            >
              {infinitePackages.map((pkg, index) => (
                <div
                  key={`pkg-${pkg.id}-${index}`}
                  onClick={() => handlePackageClick(pkg)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handlePackageClick(pkg);
                    }
                  }}
                  tabIndex={0}
                  className="bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-300 rounded-lg p-5 sm:p-6 shadow-sm hover:shadow-md hover:border-purple-400 cursor-pointer transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 min-w-[280px] snap-center flex-shrink-0 sm:min-w-0 sm:snap-none"
                  style={{ animationDelay: `${(index % filteredPackages.length) * 0.05}s` }}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-purple-600" />
                      <span className="text-xs font-medium px-2.5 py-1 rounded border bg-purple-100 text-purple-700 border-purple-200">
                        {pkg.platform}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="text-xl sm:text-2xl font-bold text-purple-600">{pkg.price} GHS</p>
                      <p className="text-xs text-gray-600">Fixed Price</p>
                    </div>
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2">
                    {pkg.name}
                  </h3>
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">{pkg.description || 'Special promotion package'}</p>
                  <div className="flex justify-between items-center text-xs text-gray-600 pt-4 border-t border-purple-200">
                    <div>
                      <span className="font-medium">Quantity: {formatQuantity(pkg.quantity)}</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-purple-600" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Services Grid */}
        {loading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-indigo-600 mx-auto"></div>
            <p className="text-sm text-gray-600 mt-4">Loading services...</p>
          </div>
        ) : filteredServices.length === 0 && filteredPackages.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center shadow-sm">
            <p className="text-gray-600 text-base sm:text-lg">No services available for this platform yet.</p>
          </div>
        ) : (
          <>
            {filteredServices.length > 0 && (
              <div className="mb-4">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">Regular Services</h2>
              </div>
            )}
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
          </>
        )}
      </div>
    </div>
  );
};

export default ServicesPage;
