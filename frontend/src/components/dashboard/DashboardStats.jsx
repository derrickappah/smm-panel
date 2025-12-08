import React from 'react';
import { Wallet, ShoppingCart } from 'lucide-react';

const DashboardStats = React.memo(({ user, orderCount }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 sm:mb-8 animate-slideUp">
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
        <div className="flex items-center justify-between mb-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 rounded-lg flex items-center justify-center">
            <Wallet className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
          </div>
        </div>
        <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">Current Balance</p>
        <h3 data-testid="user-balance" className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">
          ₵{user.balance.toFixed(2)}
        </h3>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
        <div className="flex items-center justify-between mb-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" />
          </div>
        </div>
        <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">Total Orders</p>
        <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">{orderCount}</h3>
      </div>
    </div>
  );
});

DashboardStats.displayName = 'DashboardStats';

export default DashboardStats;

