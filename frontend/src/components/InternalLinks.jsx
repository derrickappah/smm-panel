import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Related services links component
export const RelatedServices = ({ platform, serviceType, className = '' }) => {
  const relatedServices = [
    { platform: 'instagram', types: ['followers', 'likes', 'views', 'comments'] },
    { platform: 'tiktok', types: ['followers', 'likes', 'views', 'shares'] },
    { platform: 'youtube', types: ['subscribers', 'views', 'likes', 'comments'] },
    { platform: 'facebook', types: ['page_likes', 'post_likes', 'followers', 'shares'] },
    { platform: 'twitter', types: ['followers', 'retweets', 'likes', 'views'] }
  ];

  const currentPlatform = relatedServices.find(p => p.platform === platform?.toLowerCase());
  if (!currentPlatform) return null;

  const otherTypes = currentPlatform.types.filter(t => t !== serviceType?.toLowerCase());

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-6 ${className}`}>
      <h3 className="text-lg font-bold text-gray-900 mb-4">Related {platform} Services</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        {otherTypes.slice(0, 4).map((type) => {
          const displayType = type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          return (
            <Link
              key={type}
              to={`/services/${platform}/${type}`}
              className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-indigo-600 hover:bg-indigo-50 transition-colors"
            >
              <span className="text-sm font-medium text-gray-700">{displayType}</span>
              <ArrowRight className="w-4 h-4 text-gray-400" />
            </Link>
          );
        })}
      </div>
    </div>
  );
};

// Platform cross-links component
export const PlatformLinks = ({ currentPlatform, className = '' }) => {
  const platforms = [
    { name: 'Instagram', slug: 'instagram', color: 'from-pink-500 to-purple-600' },
    { name: 'TikTok', slug: 'tiktok', color: 'from-gray-700 to-gray-900' },
    { name: 'YouTube', slug: 'youtube', color: 'from-red-500 to-red-600' },
    { name: 'Facebook', slug: 'facebook', color: 'from-blue-500 to-blue-600' },
    { name: 'Twitter', slug: 'twitter', color: 'from-sky-400 to-sky-600' }
  ];

  const otherPlatforms = platforms.filter(p => p.slug !== currentPlatform?.toLowerCase());

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-6 ${className}`}>
      <h3 className="text-lg font-bold text-gray-900 mb-4">Other Platform Services</h3>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {otherPlatforms.map((platform) => (
          <Link
            key={platform.slug}
            to={`/${platform.slug}-services`}
            className={`flex items-center justify-between p-3 bg-gradient-to-r ${platform.color} text-white rounded-lg hover:opacity-90 transition-opacity`}
          >
            <span className="text-sm font-medium">{platform.name}</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        ))}
      </div>
    </div>
  );
};

// Content-to-service links component
export const ContentToServiceLinks = ({ platform, className = '' }) => {
  if (!platform) return null;

  const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);

  return (
    <div className={`bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-6 ${className}`}>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <TrendingUp className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            Ready to Grow Your {platformName} Account?
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Start boosting your {platformName} presence with our SMM services. Instant delivery, secure payment.
          </p>
          <Link to={`/${platform.toLowerCase()}-services`}>
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
              View {platformName} Services
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

// Service-to-content links component
export const ServiceToContentLinks = ({ platform, serviceType, className = '' }) => {
  const guides = [
    { title: `How to Get ${platform} ${serviceType}`, slug: `how-to-get-${platform.toLowerCase()}-${serviceType?.toLowerCase()}` },
    { title: `${platform} Growth Strategies`, slug: `${platform.toLowerCase()}-growth-strategies` },
    { title: `Increase ${platform} Engagement`, slug: `${platform.toLowerCase()}-engagement-tips` }
  ].filter(g => g.slug);

  if (guides.length === 0) return null;

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-6 ${className}`}>
      <h3 className="text-lg font-bold text-gray-900 mb-4">Related Guides</h3>
      <div className="space-y-3">
        {guides.slice(0, 3).map((guide) => (
          <Link
            key={guide.slug}
            to={`/guides/${guide.slug}`}
            className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-indigo-600 hover:bg-indigo-50 transition-colors"
          >
            <span className="text-sm font-medium text-gray-700">{guide.title}</span>
            <ArrowRight className="w-4 h-4 text-gray-400" />
          </Link>
        ))}
      </div>
    </div>
  );
};

// Main InternalLinks component that combines all
const InternalLinks = ({ type, platform, serviceType, className = '' }) => {
  switch (type) {
    case 'related-services':
      return <RelatedServices platform={platform} serviceType={serviceType} className={className} />;
    case 'platform-links':
      return <PlatformLinks currentPlatform={platform} className={className} />;
    case 'content-to-service':
      return <ContentToServiceLinks platform={platform} className={className} />;
    case 'service-to-content':
      return <ServiceToContentLinks platform={platform} serviceType={serviceType} className={className} />;
    default:
      return null;
  }
};

export default InternalLinks;

