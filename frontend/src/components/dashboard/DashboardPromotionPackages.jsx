import React, { useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tag, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const DashboardPromotionPackages = ({ packages, onPackageSelect, user }) => {
  const navigate = useNavigate();
  const scrollContainerRef = useRef(null);
  const isScrollingRef = useRef(false);

  const formatQuantity = (quantity) => {
    if (quantity >= 1000000) {
      return `${(quantity / 1000000).toFixed(1)}M`;
    } else if (quantity >= 1000) {
      return `${(quantity / 1000).toFixed(1)}K`;
    }
    return quantity.toString();
  };

  if (!packages || packages.length === 0) {
    return null;
  }

  const handlePackageClick = (pkg) => {
    if (onPackageSelect) {
      onPackageSelect(pkg);
    } else {
      navigate('/dashboard', { state: { selectedPackageId: pkg.id } });
    }
  };

  const displayPackages = packages.slice(0, 6);
  // Duplicate items for infinite scroll
  const infinitePackages = [...displayPackages, ...displayPackages, ...displayPackages];

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (isScrollingRef.current) return;
      
      const scrollLeft = container.scrollLeft;
      const containerWidth = container.clientWidth;
      const cardWidth = 180 + 16; // min-w-[180px] + gap-4
      const singleSetWidth = displayPackages.length * cardWidth;
      const centerOffset = (containerWidth - 180) / 2 - 24; // 24px is px-6 padding

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
      const cardWidth = 180 + 16;
      const singleSetWidth = displayPackages.length * cardWidth;
      const containerWidth = container.clientWidth;
      if (containerWidth > 0) {
        // Center the first card of the middle set
        const centerOffset = (containerWidth - 180) / 2 - 24; // 24px is px-6 padding
        container.scrollLeft = singleSetWidth + centerOffset;
      }
    };

    // Wait for container to be ready
    requestAnimationFrame(() => {
      initializeScroll();
    });

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [displayPackages.length]);

  return (
    <div className="bg-white border-2 border-white rounded-lg p-6 shadow-sm animate-slideUp">
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-purple-600" />
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Special Promotions</h2>
        </div>
        <p className="text-sm text-gray-600">Limited-time fixed-price packages</p>
      </div>
      
      <div 
        ref={scrollContainerRef}
        className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-2 -mx-6 px-6 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:snap-none scrollbar-hide"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {infinitePackages.map((pkg, index) => (
          <div
            key={`${pkg.id}-${index}`}
            className="bg-white border-2 border-purple-300 rounded-lg p-3 shadow-sm hover:shadow-md transition-all hover:border-purple-400 min-w-[180px] snap-center flex-shrink-0 sm:min-w-0 sm:snap-none"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Tag className="w-4 h-4 text-purple-600" />
                <span className="text-xs font-medium px-2 py-1 bg-purple-100 text-purple-700 rounded">
                  {pkg.platform}
                </span>
                {pkg.is_combo && (
                  <span className="text-xs font-medium px-2 py-1 bg-indigo-100 text-indigo-700 rounded">
                    Combo
                  </span>
                )}
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-purple-600">{pkg.price} GHS</p>
                <p className="text-xs text-gray-500">Fixed Price</p>
              </div>
            </div>
            
            <h3 className="text-sm font-semibold text-gray-900 mb-2 line-clamp-1">
              {pkg.name}
            </h3>
            
            <div className="space-y-1 mb-4">
              {pkg.is_combo && pkg.combo_package_ids && (
                <p className="text-xs text-indigo-600 font-medium">
                  Includes {pkg.combo_package_ids.length} package{pkg.combo_package_ids.length !== 1 ? 's' : ''}
                </p>
              )}
              <p className="text-sm text-gray-600">
                <span className="font-medium">Quantity:</span> {formatQuantity(pkg.quantity)}
              </p>
              {pkg.description && (
                <p className="text-xs text-gray-500 line-clamp-2">{pkg.description}</p>
              )}
            </div>
            
            {user ? (
              <Button
                onClick={() => handlePackageClick(pkg)}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                size="sm"
              >
                Buy Now
              </Button>
            ) : (
              <Button
                onClick={() => navigate('/auth')}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                size="sm"
              >
                Sign In to Order
              </Button>
            )}
          </div>
        ))}
      </div>
      
      {packages.length > 6 && (
        <div className="mt-4 text-center">
          <Button
            variant="outline"
            onClick={() => navigate('/services')}
            className="border-purple-300 text-purple-700 hover:bg-purple-50"
          >
            View All Packages
          </Button>
        </div>
      )}
    </div>
  );
};

export default DashboardPromotionPackages;

