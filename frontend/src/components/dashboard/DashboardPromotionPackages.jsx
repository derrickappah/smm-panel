import React, { useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tag, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
          container.style.scrollBehavior = 'auto';
          const offset = scrollLeft - singleSetWidth * 2;
          container.scrollLeft = singleSetWidth + centerOffset + offset;
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

  return (
    <div className="bg-white border-2 border-white rounded-lg p-3 shadow-sm animate-slideUp">
      <div className="text-center mb-4">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-purple-600" />
          <h2 className="text-lg font-bold text-gray-900">Special Promotions</h2>
        </div>
        <p className="text-xs text-gray-600">Limited-time fixed-price packages</p>
      </div>

      <div
        ref={scrollContainerRef}
        className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-2 -mx-3 px-3 scrollbar-hide"
        style={{
          scrollSnapType: 'x mandatory',
          width: '100%',
          maxWidth: '600px',
          margin: '0 auto'
        }}
      >
        {infinitePackages.map((pkg, index) => (
          <div
            key={`${pkg.id}-${index}`}
            className="bg-white border-2 border-purple-300 rounded-lg p-3 shadow-sm hover:shadow-md transition-all hover:border-purple-400 w-[160px] min-w-[160px] snap-center flex-shrink-0"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-1 flex-wrap">
                <Tag className="w-3 h-3 text-purple-600" />
                <span className="text-[10px] font-medium px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">
                  {pkg.platform}
                </span>
                {pkg.is_combo && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded">
                    Combo
                  </span>
                )}
              </div>
              <div className="text-right">
                <p className="text-base font-bold text-purple-600">{pkg.price} GHS</p>
                <p className="text-[10px] text-gray-500">Fixed</p>
              </div>
            </div>

            <h3 className="text-sm font-semibold text-gray-900 mb-1 line-clamp-1" title={pkg.name}>
              {pkg.name}
            </h3>

            <div className="space-y-0.5 mb-3">
              {pkg.is_combo && pkg.combo_package_ids && (
                <p className="text-[10px] text-indigo-600 font-medium">
                  Includes {pkg.combo_package_ids.length} items
                </p>
              )}
              <p className="text-[10px] text-gray-600">
                <span className="font-medium">Qty:</span> {formatQuantity(pkg.quantity)}
              </p>
              {pkg.description && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="text-[10px] text-gray-500 line-clamp-2 break-words cursor-help">{pkg.description}</p>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs text-xs">{pkg.description}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            {user ? (
              <Button
                onClick={() => handlePackageClick(pkg)}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white h-7 text-xs"
                size="sm"
              >
                Buy Now
              </Button>
            ) : (
              <Button
                onClick={() => navigate('/auth')}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white h-7 text-xs"
                size="sm"
              >
                Sign In
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

