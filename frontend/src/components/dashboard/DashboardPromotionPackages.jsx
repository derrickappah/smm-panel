import React from 'react';
import { Button } from '@/components/ui/button';
import { Tag, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const DashboardPromotionPackages = ({ packages, onPackageSelect, user }) => {
  const navigate = useNavigate();

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

  return (
    <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-lg p-6 shadow-sm animate-slideUp">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-5 h-5 text-purple-600" />
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Special Promotions</h2>
      </div>
      <p className="text-sm text-gray-600 mb-6">Limited-time fixed-price packages</p>
      
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {packages.slice(0, 6).map((pkg) => (
          <div
            key={pkg.id}
            className="bg-white border-2 border-purple-300 rounded-lg p-4 shadow-sm hover:shadow-md transition-all hover:border-purple-400"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-purple-600" />
                <span className="text-xs font-medium px-2 py-1 bg-purple-100 text-purple-700 rounded">
                  {pkg.platform}
                </span>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-purple-600">{pkg.price} GHS</p>
                <p className="text-xs text-gray-500">Fixed Price</p>
              </div>
            </div>
            
            <h3 className="text-base font-semibold text-gray-900 mb-2 line-clamp-1">
              {pkg.name}
            </h3>
            
            <div className="space-y-1 mb-4">
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

