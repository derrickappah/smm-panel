import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Instagram, Youtube, Facebook, Twitter, Music, ArrowRight, TrendingUp, Tag, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { usePromotionPackages } from '@/hooks/useAdminPromotionPackages';

const platformIcons = {
  instagram: Instagram,
  youtube: Youtube,
  facebook: Facebook,
  twitter: Twitter,
  tiktok: Music
};

const PricingPreview = () => {
  const navigate = useNavigate();
  const [popularServices, setPopularServices] = useState([]);
  const [minPrice, setMinPrice] = useState(null);
  const { data: promotionPackages = [] } = usePromotionPackages();
  const scrollContainerRef = useRef(null);
  const isScrollingRef = useRef(false);

  const displayPackages = promotionPackages.slice(0, 3);
  // Duplicate items for infinite scroll
  const infinitePackages = useMemo(() => {
    const packages = promotionPackages.slice(0, 3);
    if (packages.length === 0) return [];
    return [...packages, ...packages, ...packages];
  }, [promotionPackages]);

  const formatQuantity = (quantity) => {
    if (quantity >= 1000000) {
      return `${(quantity / 1000000).toFixed(1)}M`;
    } else if (quantity >= 1000) {
      return `${(quantity / 1000).toFixed(1)}K`;
    }
    return quantity.toString();
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || displayPackages.length === 0) return;

    const handleScroll = () => {
      if (isScrollingRef.current) return;

      const scrollLeft = container.scrollLeft;
      const firstCard = container.querySelector('div[class*="min-w-"]');
      if (!firstCard) return;

      // Get accurate gap from container
      const containerStyle = window.getComputedStyle(container);
      const gap = parseFloat(containerStyle.columnGap || containerStyle.gap || '0');

      const cardStyle = window.getComputedStyle(firstCard);
      const cardWidth = firstCard.offsetWidth + parseFloat(cardStyle.marginRight || 0) + gap;

      const singleSetWidth = displayPackages.length * cardWidth;
      const containerWidth = container.clientWidth;
      const centerOffset = (containerWidth - (cardWidth - gap)) / 2;

      const checkAndResetScroll = () => {
        // If scrolled past the end of second set (entering third set)
        if (scrollLeft >= singleSetWidth * 2 - centerOffset) {
          isScrollingRef.current = true;
          // Disable smooth scroll for instant jump
          container.style.scrollBehavior = 'auto';
          const offset = scrollLeft - singleSetWidth * 2;
          container.scrollLeft = singleSetWidth + centerOffset + offset;
          // Re-enable smooth scroll after jump
          requestAnimationFrame(() => {
            container.style.scrollBehavior = 'smooth';
            isScrollingRef.current = false;
          });
        }
        // If scrolled before the start of second set (in first set)
        else if (scrollLeft <= singleSetWidth - centerOffset) {
          isScrollingRef.current = true;
          container.style.scrollBehavior = 'auto';
          const offset = scrollLeft - (singleSetWidth - centerOffset);
          container.scrollLeft = singleSetWidth + centerOffset + offset;
          requestAnimationFrame(() => {
            container.style.scrollBehavior = 'smooth';
            isScrollingRef.current = false;
          });
        }
      };

      checkAndResetScroll();
    };

    // Initialize scroll position to center first card of middle set
    const initializeScroll = () => {
      const firstCard = container.querySelector('div[class*="min-w-"]');
      if (!firstCard) return;

      const containerStyle = window.getComputedStyle(container);
      const gap = parseFloat(containerStyle.columnGap || containerStyle.gap || '0');

      const cardStyle = window.getComputedStyle(firstCard);
      const cardWidth = firstCard.offsetWidth + parseFloat(cardStyle.marginRight || 0) + gap;

      const singleSetWidth = displayPackages.length * cardWidth;
      const containerWidth = container.clientWidth;

      if (containerWidth > 0) {
        // Center the first card of the middle set
        const centerOffset = (containerWidth - (cardWidth - gap)) / 2;

        container.style.scrollBehavior = 'auto';
        container.scrollLeft = singleSetWidth + centerOffset;
        requestAnimationFrame(() => {
          container.style.scrollBehavior = 'smooth';
        });
      }
    };

    // Wait for container to be ready and layout to stabilize
    requestAnimationFrame(() => {
      initializeScroll();
    });

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [displayPackages.length]);

  // Fetch all enabled services using React Query for caching
  const { data: services, isLoading } = useQuery({
    queryKey: ['landing-pricing-services'],
    queryFn: async () => {
      // Try with rate_unit first, fallback to without it if column doesn't exist
      let { data, error } = await supabase
        .from('services')
        .select('id, name, rate, rate_unit, platform, service_type, min_quantity, max_quantity')
        .eq('enabled', true)
        .order('rate', { ascending: true }); // Order by price ascending

      // If rate_unit column doesn't exist, try without it
      if (error && (error.message?.includes('rate_unit') || error.code === '42703')) {
        console.warn('rate_unit column not found, fetching without it:', error.message);
        const fallbackResult = await supabase
          .from('services')
          .select('id, name, rate, platform, service_type, min_quantity, max_quantity')
          .eq('enabled', true)
          .order('rate', { ascending: true });

        if (fallbackResult.error) throw fallbackResult.error;

        // Add default rate_unit for backward compatibility
        return (fallbackResult.data || []).map(service => ({ ...service, rate_unit: 1000 }));
      }

      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1
  });

  useEffect(() => {
    if (services && services.length > 0) {
      // Calculate minimum price
      const rates = services.map(s => parseFloat(s.rate || 0)).filter(r => r > 0);
      const calculatedMinPrice = rates.length > 0 ? Math.min(...rates) : null;
      setMinPrice(calculatedMinPrice);

      // Get diverse services from different platforms - at least 6 services
      const platformPriority = ['instagram', 'tiktok', 'youtube', 'facebook', 'twitter'];
      const selectedServices = [];
      const usedPlatforms = new Set();

      // First, get one service from each priority platform
      platformPriority.forEach(platform => {
        const platformService = services.find(s =>
          (s.platform || '').toLowerCase() === platform &&
          !selectedServices.some(sel => sel.id === s.id)
        );
        if (platformService) {
          selectedServices.push(platformService);
          usedPlatforms.add(platform);
        }
      });

      // Fill up to at least 6 services with diverse service types
      const serviceTypes = ['followers', 'likes', 'views', 'subscribers', 'comments'];
      let typeIndex = 0;

      while (selectedServices.length < 6 && selectedServices.length < services.length) {
        const targetType = serviceTypes[typeIndex % serviceTypes.length];
        const service = services.find(s =>
          !selectedServices.some(sel => sel.id === s.id) &&
          (s.service_type || '').toLowerCase().includes(targetType)
        );

        if (service) {
          selectedServices.push(service);
        } else {
          // If no service of this type, just get next available
          const nextService = services.find(s =>
            !selectedServices.some(sel => sel.id === s.id)
          );
          if (nextService) {
            selectedServices.push(nextService);
          } else {
            break; // No more services available
          }
        }
        typeIndex++;
      }

      // If still less than 6, add more services sorted by price
      if (selectedServices.length < 6) {
        const remaining = services
          .filter(s => !selectedServices.some(sel => sel.id === s.id))
          .sort((a, b) => parseFloat(a.rate || 0) - parseFloat(b.rate || 0))
          .slice(0, 6 - selectedServices.length);
        selectedServices.push(...remaining);
      }

      setPopularServices(selectedServices.slice(0, Math.max(6, selectedServices.length)));
    }
  }, [services]);

  if (isLoading) {
    return (
      <section className="py-12 sm:py-16 lg:py-20 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">
              Affordable Pricing
            </h2>
            <p className="text-base sm:text-lg text-gray-600">
              Starting at just GHS 2.99
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 sm:gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-lg p-6 animate-pulse">
                <div className="h-12 w-12 bg-gray-200 rounded-lg mb-4"></div>
                <div className="h-6 bg-gray-200 rounded mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-2/3"></div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 sm:py-16 lg:py-20 px-4 sm:px-6 bg-gray-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">
            Affordable Pricing
          </h2>
          <p className="text-base sm:text-lg text-gray-600 mb-2">
            {minPrice ? (
              <>Starting at just <span className="font-bold text-indigo-600">GHS {minPrice.toFixed(2)}</span></>
            ) : (
              <>Starting at just <span className="font-bold text-indigo-600">GHS 2.99</span></>
            )}
          </p>
          <p className="text-sm sm:text-base text-gray-500">
            Transparent pricing with no hidden fees
          </p>
        </div>

        {/* Promotion Packages Section */}
        {promotionPackages.length > 0 && (
          <div className="mb-8 me:mb-12">
            <div className="text-center mb-4">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <h3 className="text-lg font-bold text-gray-900">Special Promotions</h3>
              </div>
              <p className="text-xs text-gray-600">Limited-time fixed-price packages</p>
            </div>
            <div
              ref={scrollContainerRef}
              className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-2 -mx-4 px-4 scrollbar-hide"
              style={{
                scrollSnapType: 'x mandatory',
                width: '100%',
                maxWidth: '600px',
                margin: '0 auto'
              }}
            >
              {infinitePackages.map((pkg, index) => {
                const platform = (pkg.platform || '').toLowerCase();
                const Icon = platformIcons[platform] || TrendingUp;
                return (
                  <div
                    key={`${pkg.id}-${index}`}
                    className="bg-white border-2 border-purple-300 rounded-lg p-3 text-center hover:shadow-lg transition-all duration-200 min-w-[160px] max-w-[160px] snap-center flex-shrink-0"
                  >
                    <div className="flex items-center justify-center gap-1 mb-2">
                      <Tag className="w-3 h-3 text-purple-600" />
                      <span className="text-[10px] font-medium px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">
                        Special Offer
                      </span>
                    </div>
                    <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-2">
                      <Icon className="w-4 h-4 text-purple-600" />
                    </div>
                    <h3 className="text-sm font-bold text-gray-900 mb-0.5 truncate px-1" title={pkg.name}>
                      {pkg.name}
                    </h3>
                    <p className="text-[10px] text-gray-600 mb-2 truncate" title={pkg.platform}>{pkg.platform}</p>
                    <div className="text-base font-bold text-purple-600 mb-0.5">
                      {pkg.price} GHS
                    </div>
                    <p className="text-[10px] text-gray-500">
                      {formatQuantity(pkg.quantity)} {pkg.service_type}
                    </p>
                    <p className="text-[10px] text-purple-600 font-medium mt-1">Fixed Price</p>
                  </div>
                );
              })}
            </div>
            {promotionPackages.length > 3 && (
              <div className="text-center mt-4">
                <Button
                  onClick={() => navigate('/services')}
                  variant="outline"
                  size="sm"
                  className="border-purple-300 text-purple-700 hover:bg-purple-50 text-xs h-8 px-3"
                >
                  View All
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 sm:gap-6 mb-8 sm:mb-12">
          {popularServices.length > 0 ? (
            popularServices.map((service) => {
              const platform = (service.platform || '').toLowerCase();
              const Icon = platformIcons[platform] || TrendingUp;
              const serviceType = (service.service_type || '').toLowerCase();

              // Format service name - use actual name from database, fallback to formatted type
              const getServiceDisplayName = () => {
                if (service.name) {
                  // Extract the service type from the name if it's descriptive
                  const name = service.name.toLowerCase();
                  if (name.includes('follower')) return 'Followers';
                  if (name.includes('like')) return 'Likes';
                  if (name.includes('view')) return 'Views';
                  if (name.includes('subscriber')) return 'Subscribers';
                  if (name.includes('comment')) return 'Comments';
                  // Return a shortened version of the actual name
                  return service.name.length > 20 ? service.name.substring(0, 20) + '...' : service.name;
                }
                // Fallback to service type
                if (serviceType.includes('follower')) return 'Followers';
                if (serviceType.includes('like')) return 'Likes';
                if (serviceType.includes('view')) return 'Views';
                if (serviceType.includes('subscriber')) return 'Subscribers';
                if (serviceType.includes('comment')) return 'Comments';
                return 'Service';
              };

              const displayName = getServiceDisplayName();
              const platformName = service.platform
                ? service.platform.charAt(0).toUpperCase() + service.platform.slice(1).toLowerCase()
                : 'Social Media';

              return (
                <div
                  key={service.id}
                  className="bg-white border border-gray-200 rounded-lg p-5 sm:p-6 text-center hover:shadow-lg transition-shadow duration-200"
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-100 rounded-lg flex items-center justify-center mx-auto mb-3 sm:mb-4">
                    <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-1">
                    {platformName}
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-600 mb-3">{displayName}</p>
                  <div className="text-xl sm:text-2xl font-bold text-indigo-600 mb-1">
                    GHS {parseFloat(service.rate || 0).toFixed(2)}
                  </div>
                  <p className="text-xs text-gray-500">
                    per 1,000
                  </p>
                  {service.min_quantity && (
                    <p className="text-xs text-gray-400 mt-1">
                      Min: {service.min_quantity.toLocaleString()}
                    </p>
                  )}
                </div>
              );
            })
          ) : (
            // Fallback if no services found
            ['Instagram', 'TikTok', 'YouTube', 'Facebook', 'Twitter', 'LinkedIn'].slice(0, 6).map((platform, i) => {
              const Icon = platformIcons[platform.toLowerCase()] || TrendingUp;
              return (
                <div
                  key={i}
                  className="bg-white border border-gray-200 rounded-lg p-5 sm:p-6 text-center hover:shadow-lg transition-shadow duration-200"
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-100 rounded-lg flex items-center justify-center mx-auto mb-3 sm:mb-4">
                    <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-1">
                    {platform}
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-600 mb-3">Services Available</p>
                  <div className="text-xl sm:text-2xl font-bold text-indigo-600 mb-1">
                    {minPrice ? `From GHS ${minPrice.toFixed(2)}` : 'From GHS 2.99'}
                  </div>
                  <p className="text-xs text-gray-500">per 1,000</p>
                </div>
              );
            })
          )}
        </div>
        <div className="text-center">
          <Button
            onClick={() => navigate('/auth')}
            size="lg"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 sm:px-8 py-3 sm:py-4 h-12 sm:h-14 text-base sm:text-lg rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200"
          >
            View Full Pricing
            <ArrowRight className="ml-2 w-4 h-4 sm:w-5 sm:h-5" />
          </Button>
        </div>
      </div>
    </section>
  );
};

export default PricingPreview;

