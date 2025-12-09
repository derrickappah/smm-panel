import React from 'react';
import { Shield, Clock, HeadphonesIcon, CheckCircle2 } from 'lucide-react';

const TrustBadges = () => {
  const badges = [
    {
      icon: Shield,
      text: 'SSL Secure',
      description: '256-bit encryption'
    },
    {
      icon: Clock,
      text: '99.9% Uptime',
      description: 'Always available'
    },
    {
      icon: HeadphonesIcon,
      text: '24/7 Support',
      description: 'Always here to help'
    },
    {
      icon: CheckCircle2,
      text: 'Money-Back Guarantee',
      description: '100% satisfaction'
    }
  ];

  return (
    <section className="py-8 sm:py-12 px-4 sm:px-6 bg-white border-b border-gray-100">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
          {badges.map((badge, index) => (
            <div
              key={index}
              className="flex flex-col items-center text-center p-4 sm:p-6 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors duration-200"
            >
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-100 rounded-full flex items-center justify-center mb-2 sm:mb-3">
                <badge.icon className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" />
              </div>
              <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-1">
                {badge.text}
              </h3>
              <p className="text-xs sm:text-sm text-gray-600">
                {badge.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TrustBadges;

