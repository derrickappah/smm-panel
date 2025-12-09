import React from 'react';
import { Search, FileText, CreditCard, TrendingUp, ArrowRight } from 'lucide-react';

const HowItWorks = () => {
  const steps = [
    {
      icon: Search,
      title: 'Choose Your Service',
      description: 'Browse our wide selection of services for Instagram, TikTok, YouTube, Facebook, and Twitter. Find exactly what you need.',
      color: 'from-blue-500 to-blue-600'
    },
    {
      icon: FileText,
      title: 'Enter Details',
      description: 'Simply provide your social media handle or link. Our system will automatically process your order.',
      color: 'from-purple-500 to-purple-600'
    },
    {
      icon: CreditCard,
      title: 'Make Payment',
      description: 'Choose from multiple secure payment methods including Paystack, Korapay, Hubtel, or manual deposit.',
      color: 'from-green-500 to-green-600'
    },
    {
      icon: TrendingUp,
      title: 'Watch It Grow',
      description: 'Sit back and watch your followers, likes, views, and engagement grow. Most orders start within minutes!',
      color: 'from-orange-500 to-orange-600'
    }
  ];

  return (
    <section className="py-12 sm:py-16 lg:py-20 px-4 sm:px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">
            How It Works
          </h2>
          <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto">
            Getting started is simple. Follow these 4 easy steps to boost your social media presence
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
          {steps.map((step, index) => (
            <div
              key={index}
              className="relative"
            >
              {/* Connector line for desktop */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-16 left-full w-full h-0.5 bg-gradient-to-r from-indigo-200 to-transparent z-0" style={{ width: 'calc(100% - 4rem)' }}>
                  <ArrowRight className="absolute right-0 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-300" />
                </div>
              )}
              <div className="bg-white border border-gray-200 rounded-lg p-6 sm:p-8 text-center hover:shadow-lg transition-shadow duration-200 relative z-10 h-full">
                <div className={`w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br ${step.color} rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-lg`}>
                  <step.icon className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                </div>
                <div className="mb-3 sm:mb-4">
                  <span className="inline-flex items-center justify-center w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full font-bold text-sm sm:text-base">
                    {index + 1}
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:mb-3">
                  {step.title}
                </h3>
                <p className="text-sm sm:text-base text-gray-600 leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;

