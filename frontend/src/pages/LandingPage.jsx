import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Zap, Shield, TrendingUp, Instagram, Youtube, Facebook, Twitter, Music, Users, Heart, Eye, MessageCircle, Clock, DollarSign, ArrowUp, Send } from 'lucide-react';
import SEO from '@/components/SEO';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import TrustBadges from '@/components/landing/TrustBadges';
import Testimonials from '@/components/landing/Testimonials';
import HowItWorks from '@/components/landing/HowItWorks';
import PricingPreview from '@/components/landing/PricingPreview';
import FAQ from '@/components/landing/FAQ';
import { generateOrganizationSchema, generateWebSiteSchema, generateFAQSchema } from '@/utils/schema';
import { primaryKeywords, longTailKeywords, questionKeywords, locationKeywords } from '@/data/keywords';
import { useFAQ } from '@/hooks/useFAQ';

// Animated Number Component
const AnimatedNumber = ({ value, duration = 2000, formatter = (v) => v.toLocaleString() }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (value === 0) {
      setDisplayValue(0);
      return;
    }

    const startValue = 0;
    const endValue = value || 0;
    const startTime = Date.now();

    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth animation
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      const currentValue = Math.floor(startValue + (endValue - startValue) * easeOutCubic);
      
      setDisplayValue(currentValue);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setDisplayValue(endValue);
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  return <span>{formatter(displayValue)}</span>;
};

// Stats Skeleton Component
const StatsSkeleton = () => (
  <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-lg p-4 sm:p-6 text-center">
    <Skeleton className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg mx-auto mb-3 sm:mb-4" />
    <Skeleton className="h-8 sm:h-10 w-20 mx-auto mb-2" />
    <Skeleton className="h-4 w-24 mx-auto" />
  </div>
);

// Back to Top Button Component
const BackToTop = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.pageYOffset > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', toggleVisibility);
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  if (!isVisible) return null;

  return (
    <button
      onClick={scrollToTop}
      className="fixed bottom-6 right-6 z-50 bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      aria-label="Back to top"
    >
      <ArrowUp className="w-5 h-5" />
    </button>
  );
};

// Scroll Progress Indicator
const ScrollProgress = () => {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const updateScrollProgress = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const progress = (scrollTop / (documentHeight - windowHeight)) * 100;
      setScrollProgress(progress);
    };

    window.addEventListener('scroll', updateScrollProgress);
    updateScrollProgress();
    return () => window.removeEventListener('scroll', updateScrollProgress);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 h-1 bg-gray-200 z-50">
      <div
        className="h-full bg-gradient-to-r from-indigo-600 to-purple-600 transition-all duration-150"
        style={{ width: `${scrollProgress}%` }}
      />
    </div>
  );
};

const LandingPage = () => {
  const navigate = useNavigate();
  const statsSectionRef = useRef(null);
  const [statsVisible, setStatsVisible] = useState(false);

  const platforms = [
    { name: 'Instagram', icon: Instagram, color: 'text-pink-600' },
    { name: 'TikTok', icon: Music, color: 'text-gray-800' },
    { name: 'YouTube', icon: Youtube, color: 'text-red-600' },
    { name: 'Facebook', icon: Facebook, color: 'text-blue-600' },
    { name: 'Twitter', icon: Twitter, color: 'text-sky-500' },
    { name: 'WhatsApp', icon: MessageCircle, color: 'text-green-600' },
    { name: 'Telegram', icon: Send, color: 'text-blue-500' },
    { name: 'Spotify', icon: Music, color: 'text-green-500' },
    { name: 'Audio Mark', icon: Music, color: 'text-purple-600' },
  ];

  const features = [
    {
      icon: Zap,
      title: 'Instant Delivery',
      description: 'Get your orders started within minutes of placing them. No waiting, no delays - just fast, reliable service.',
      color: 'from-yellow-400 to-orange-500'
    },
    {
      icon: Shield,
      title: 'Secure & Safe',
      description: 'Your data and orders are protected with enterprise-grade security. SSL encrypted and fully compliant.',
      color: 'from-green-400 to-emerald-500'
    },
    {
      icon: TrendingUp,
      title: 'Real Growth',
      description: 'High-quality engagement from real accounts. Build authentic social media presence that lasts.',
      color: 'from-blue-400 to-indigo-500'
    },
    {
      icon: Clock,
      title: '24/7 Support',
      description: 'Our dedicated support team is available around the clock to help you with any questions or issues.',
      color: 'from-purple-400 to-pink-500'
    },
    {
      icon: DollarSign,
      title: 'Best Prices',
      description: 'Competitive pricing with transparent costs. No hidden fees, just honest, affordable rates.',
      color: 'from-teal-400 to-cyan-500'
    }
  ];

  // Fetch stats using React Query with intersection observer
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['landing-stats'],
    queryFn: async () => {
      const BATCH_SIZE = 1000; // Fetch in batches for optimal performance
      
      // Fetch all completed orders using batched pagination
      const fetchAllCompletedOrders = async () => {
        let allOrders = [];
        let from = 0;
        let hasMore = true;
        
        // First, get total count of completed orders
        const { count, error: countError } = await supabase
          .from('orders')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'completed');
        
        if (countError) {
          throw countError;
        }
        
        // Fetch all batches - optimized sequential fetching for large datasets
        while (hasMore) {
          const to = from + BATCH_SIZE - 1;
          
          const { data, error } = await supabase
            .from('orders')
            .select('quantity, promotion_package_id, services(name, service_type), promotion_packages(name, service_type)')
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .range(from, to);
          
          if (error) {
            throw error;
          }
          
          if (data && data.length > 0) {
            allOrders = allOrders.concat(data);
            hasMore = data.length === BATCH_SIZE && allOrders.length < (count || Infinity);
            from += BATCH_SIZE;
          } else {
            hasMore = false;
          }
        }
        
        return allOrders;
      };
      
      const [ordersDataResult, ordersCountResult, usersResult] = await Promise.allSettled([
        fetchAllCompletedOrders(),
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'completed'),
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
      ]);

      let totalLikes = 0;
      let totalFollowers = 0;
      let totalViews = 0;
      let totalComments = 0;
      let ordersCount = 0;
      let usersCount = 0;

      // Service type matching functions (aligned with admin stats logic)
      const serviceTypeChecks = {
        like: (type, name) => type.includes('like') || name.includes('like'),
        follower: (type, name) => type.includes('follower') || name.includes('follower'),
        view: (type, name) => type.includes('view') || name.includes('view'),
        comment: (type, name) => type.includes('comment') || name.includes('comment'),
      };

      if (ordersDataResult.status === 'fulfilled' && ordersDataResult.value) {
        const ordersData = Array.isArray(ordersDataResult.value) ? ordersDataResult.value : [];
        
        ordersData.forEach(order => {
          const quantity = parseInt(order.quantity || 0);
          if (isNaN(quantity) || quantity <= 0) return;

          // Check if this is a promotion package order or regular service order
          const isPromotionPackage = !!order.promotion_package_id;
          
          // Use promotion package data if available, otherwise use service data
          // Match the exact logic from admin stats
          const serviceType = isPromotionPackage
            ? (order.promotion_packages?.service_type || '').toLowerCase()
            : (order.services?.service_type || '').toLowerCase();
          const serviceName = isPromotionPackage
            ? (order.promotion_packages?.name || '').toLowerCase()
            : (order.services?.name || '').toLowerCase();

          // Use the same matching logic as admin stats
          if (serviceTypeChecks.like(serviceType, serviceName)) {
            totalLikes += quantity;
          }
          if (serviceTypeChecks.follower(serviceType, serviceName)) {
            totalFollowers += quantity;
          }
          if (serviceTypeChecks.view(serviceType, serviceName)) {
            totalViews += quantity;
          }
          if (serviceTypeChecks.comment(serviceType, serviceName)) {
            totalComments += quantity;
          }
        });
      }

      if (ordersCountResult.status === 'fulfilled' && !ordersCountResult.value.error) {
        ordersCount = ordersCountResult.value.count || 0;
      }

      if (usersResult.status === 'fulfilled' && !usersResult.value.error) {
        usersCount = usersResult.value.count || 0;
      }

      return {
        totalOrders: ordersCount,
        totalLikes,
        totalFollowers,
        totalViews,
        totalUsers: usersCount,
        totalComments
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
    retry: 1,
    enabled: statsVisible // Only fetch when section is visible
  });

  // Intersection Observer for stats section
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setStatsVisible(true);
          }
        });
      },
      { threshold: 0.1 }
    );

    if (statsSectionRef.current) {
      observer.observe(statsSectionRef.current);
    }

    return () => {
      if (statsSectionRef.current) {
        observer.unobserve(statsSectionRef.current);
      }
    };
  }, []);

  const stats = useMemo(() => statsData || {
    totalOrders: 0,
    totalLikes: 0,
    totalFollowers: 0,
    totalViews: 0,
    totalUsers: 0,
    totalComments: 0
  }, [statsData]);

  // Fetch FAQ data from backend for schema
  const { data: faqData = [] } = useFAQ();

  // Generate comprehensive keywords
  const allKeywords = [
    ...primaryKeywords.smmPanel,
    ...primaryKeywords.instagram,
    ...primaryKeywords.tiktok,
    ...primaryKeywords.youtube,
    ...primaryKeywords.facebook,
    ...primaryKeywords.twitter,
    ...longTailKeywords.instagram.slice(0, 5),
    ...longTailKeywords.tiktok.slice(0, 5),
    ...longTailKeywords.youtube.slice(0, 5),
    ...questionKeywords.slice(0, 5),
    ...locationKeywords,
    'social media growth',
    'SMM services',
    'boost followers',
    'increase engagement',
    'instant delivery',
    'secure payment',
    'best prices'
  ];

  // Generate structured data
  const organizationSchema = generateOrganizationSchema();
  const websiteSchema = generateWebSiteSchema();
  const faqSchema = generateFAQSchema(faqData);

  const structuredDataArray = [
    organizationSchema,
    websiteSchema,
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      '@id': 'https://boostupgh.com/#service',
      name: 'Social Media Marketing Services',
      description: 'Professional SMM panel services for Instagram, TikTok, YouTube, Facebook, and Twitter. Get followers, likes, views, and engagement instantly.',
      provider: {
        '@id': 'https://boostupgh.com/#organization'
      },
      areaServed: {
        '@type': 'Country',
        name: 'Ghana'
      },
      serviceType: 'Social Media Marketing',
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'GHS',
        availability: 'https://schema.org/InStock'
      }
    },
    faqSchema
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <ScrollProgress />
      <SEO
        title="Boost Your Social Media Presence - SMM Panel | BoostUp GH"
        description="Grow your social media presence instantly with BoostUp GH. The most reliable SMM panel for Instagram followers, TikTok views, YouTube subscribers, Facebook likes, and Twitter followers. Buy Instagram followers Ghana, TikTok views, YouTube subscribers. Instant delivery, secure payment, best prices, 24/7 support."
        keywords={allKeywords}
        canonical="/"
        structuredDataArray={structuredDataArray}
      />
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 fixed top-0 left-0 right-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4 flex justify-between items-center">
          <div className="flex items-center">
            <img 
              src="/download.png" 
              alt="BoostUp GH Logo" 
              className="h-8 sm:h-10 max-w-full"
            />
          </div>
          <Button 
            data-testid="nav-get-started-btn"
            onClick={() => navigate('/auth')} 
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-4 md:px-6 py-2 h-9 sm:h-10 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200 text-sm sm:text-base"
          >
            Get Started
            <ArrowRight className="ml-1 sm:ml-2 w-3 h-3 sm:w-4 sm:h-4" />
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-28 sm:pt-36 md:pt-44 pb-12 sm:pb-16 md:pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto text-center">
          {/* Trust Badges Above Hero */}
          <div className="mb-8 sm:mb-10 md:mb-12 flex flex-wrap justify-center items-center gap-x-4 gap-y-2 sm:gap-x-6 text-xs sm:text-sm text-gray-600">
            <div className="flex items-center space-x-1.5">
              <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 flex-shrink-0" />
              <span className="font-medium whitespace-nowrap">Trusted by 10K+ users</span>
            </div>
            <span className="hidden sm:inline text-gray-400">•</span>
            <div className="flex items-center space-x-1.5">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 flex-shrink-0" />
              <span className="font-medium whitespace-nowrap">99.9% Uptime</span>
            </div>
            <span className="hidden sm:inline text-gray-400">•</span>
            <div className="flex items-center space-x-1.5">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 flex-shrink-0" />
              <span className="font-medium whitespace-nowrap">Instant Delivery</span>
            </div>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 sm:mb-8 leading-tight">
            Grow Your Social Media
            <br />
            <span className="text-indigo-600">
              Presence Instantly
            </span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-gray-600 mb-8 sm:mb-10 md:mb-12 max-w-2xl mx-auto leading-relaxed">
            The most reliable SMM panel for boosting your followers, likes, views, and engagement across all major platforms. Join thousands of satisfied customers today.
          </p>
          
          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 justify-center items-stretch sm:items-center mb-10 sm:mb-12 md:mb-16">
            <Button 
              data-testid="hero-get-started-btn"
              onClick={() => navigate('/auth')} 
              size="lg"
              className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-8 sm:px-10 py-3.5 sm:py-4 h-auto text-base sm:text-lg font-semibold rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all duration-200 shadow-lg hover:shadow-xl w-full sm:w-auto min-w-[200px]"
            >
              Start Boosting Now
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button 
              onClick={() => {
                const element = document.getElementById('pricing-preview');
                element?.scrollIntoView({ behavior: 'smooth' });
              }}
              size="lg"
              variant="outline"
              className="border-2 border-gray-300 hover:border-indigo-600 text-gray-700 hover:text-indigo-600 px-8 sm:px-10 py-3.5 sm:py-4 h-auto text-base sm:text-lg font-semibold rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all duration-200 w-full sm:w-auto min-w-[200px] bg-white"
            >
              View Pricing
            </Button>
          </div>

          {/* Platform Icons */}
          <div className="flex justify-center items-center gap-6 sm:gap-8 md:gap-10 mt-12 sm:mt-16 md:mt-20 flex-wrap">
            {platforms.map((platform) => (
              <div key={platform.name} className="flex flex-col items-center space-y-2.5 group">
                <div className="bg-white border border-gray-200 w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-lg flex items-center justify-center shadow-sm hover:shadow-lg hover:border-indigo-300 transition-all duration-200 group-hover:scale-105">
                  <platform.icon className={`w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 ${platform.color}`} />
                </div>
                <span className="text-xs sm:text-sm font-medium text-gray-700 group-hover:text-indigo-600 transition-colors duration-200">{platform.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Badges Section */}
      <TrustBadges />

      {/* Statistics Section */}
      <section ref={statsSectionRef} className="py-12 sm:py-16 lg:py-20 px-3 sm:px-4 md:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-center text-gray-900 mb-8 sm:mb-12">
            Our Impact in Numbers
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-5 md:gap-6">
            {/* Total Orders */}
            <div className="group relative bg-white rounded-xl p-5 sm:p-6 border border-gray-200 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center mb-3 sm:mb-4 shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform duration-300">
                  <TrendingUp className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                </div>
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-1 sm:mb-2">
                  {statsLoading ? (
                    <Skeleton className="h-8 sm:h-10 w-20 mx-auto bg-gray-200" />
                  ) : (
                    <AnimatedNumber value={stats.totalOrders} />
                  )}
                </div>
                <p className="text-xs sm:text-sm text-gray-600 font-semibold uppercase tracking-wide">Orders Completed</p>
              </div>
            </div>

            {/* Total Likes */}
            <div className="group relative bg-white rounded-xl p-5 sm:p-6 border border-gray-200 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-pink-500/5 to-rose-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-pink-500 to-rose-600 rounded-xl flex items-center justify-center mb-3 sm:mb-4 shadow-lg shadow-pink-500/20 group-hover:scale-110 transition-transform duration-300">
                  <Heart className="w-6 h-6 sm:w-7 sm:h-7 text-white fill-white" />
                </div>
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent mb-1 sm:mb-2">
                  {statsLoading ? (
                    <Skeleton className="h-8 sm:h-10 w-20 mx-auto bg-gray-200" />
                  ) : (
                    <AnimatedNumber value={stats.totalLikes} formatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toLocaleString()} />
                  )}
                </div>
                <p className="text-xs sm:text-sm text-gray-600 font-semibold uppercase tracking-wide">Likes Sent</p>
              </div>
            </div>

            {/* Total Followers */}
            <div className="group relative bg-white rounded-xl p-5 sm:p-6 border border-gray-200 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center mb-3 sm:mb-4 shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform duration-300">
                  <Users className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                </div>
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent mb-1 sm:mb-2">
                  {statsLoading ? (
                    <Skeleton className="h-8 sm:h-10 w-20 mx-auto bg-gray-200" />
                  ) : (
                    <AnimatedNumber value={stats.totalFollowers} formatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toLocaleString()} />
                  )}
                </div>
                <p className="text-xs sm:text-sm text-gray-600 font-semibold uppercase tracking-wide">Followers Sent</p>
              </div>
            </div>

            {/* Total Views */}
            <div className="group relative bg-white rounded-xl p-5 sm:p-6 border border-gray-200 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-cyan-500 to-teal-600 rounded-xl flex items-center justify-center mb-3 sm:mb-4 shadow-lg shadow-cyan-500/20 group-hover:scale-110 transition-transform duration-300">
                  <Eye className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                </div>
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-cyan-600 to-teal-600 bg-clip-text text-transparent mb-1 sm:mb-2">
                  {statsLoading ? (
                    <Skeleton className="h-8 sm:h-10 w-20 mx-auto bg-gray-200" />
                  ) : (
                    <AnimatedNumber value={stats.totalViews} formatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toLocaleString()} />
                  )}
                </div>
                <p className="text-xs sm:text-sm text-gray-600 font-semibold uppercase tracking-wide">Views Sent</p>
              </div>
            </div>

            {/* Total Comments */}
            <div className="group relative bg-white rounded-xl p-5 sm:p-6 border border-gray-200 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center mb-3 sm:mb-4 shadow-lg shadow-green-500/20 group-hover:scale-110 transition-transform duration-300">
                  <MessageCircle className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                </div>
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent mb-1 sm:mb-2">
                  {statsLoading ? (
                    <Skeleton className="h-8 sm:h-10 w-20 mx-auto bg-gray-200" />
                  ) : (
                    <AnimatedNumber value={stats.totalComments} formatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toLocaleString()} />
                  )}
                </div>
                <p className="text-xs sm:text-sm text-gray-600 font-semibold uppercase tracking-wide">Comments Sent</p>
              </div>
            </div>

            {/* Total Users */}
            <div className="group relative bg-white rounded-xl p-5 sm:p-6 border border-gray-200 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-violet-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl flex items-center justify-center mb-3 sm:mb-4 shadow-lg shadow-purple-500/20 group-hover:scale-110 transition-transform duration-300">
                  <Users className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                </div>
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-purple-600 to-violet-600 bg-clip-text text-transparent mb-1 sm:mb-2">
                  {statsLoading ? (
                    <Skeleton className="h-8 sm:h-10 w-20 mx-auto bg-gray-200" />
                  ) : (
                    <AnimatedNumber value={stats.totalUsers} formatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toLocaleString()} />
                  )}
                </div>
                <p className="text-xs sm:text-sm text-gray-600 font-semibold uppercase tracking-wide">Happy Users</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <Testimonials />

      {/* How It Works Section */}
      <HowItWorks />

      {/* Features Section */}
      <section className="py-12 sm:py-16 lg:py-20 px-3 sm:px-4 md:px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-center text-gray-900 mb-8 sm:mb-12">
            Why Choose BoostUp GH?
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8">
            {features.map((feature, index) => (
              <div 
                key={index} 
                className="bg-white border border-gray-200 rounded-lg p-5 sm:p-6 md:p-8 shadow-sm hover:shadow-lg transition-all duration-200"
              >
                <div className={`w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 bg-gradient-to-br ${feature.color} rounded-lg flex items-center justify-center mb-4 sm:mb-6 shadow-md`}>
                  <feature.icon className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-white" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:mb-3">{feature.title}</h3>
                <p className="text-sm sm:text-base text-gray-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Preview Section */}
      <div id="pricing-preview">
        <PricingPreview />
      </div>

      {/* FAQ Section */}
      <FAQ />

      {/* Final CTA Section */}
      <section className="py-12 sm:py-16 lg:py-20 px-3 sm:px-4 md:px-6 bg-gradient-to-br from-indigo-600 to-purple-600">
        <div className="max-w-4xl mx-auto bg-white border border-gray-200 rounded-lg p-6 sm:p-8 md:p-12 shadow-xl text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 md:mb-6">
            Ready to Boost Your Social Media?
          </h2>
          <p className="text-sm sm:text-base md:text-lg text-gray-600 mb-4 sm:mb-6 md:mb-8">
            Join thousands of satisfied customers and start growing today. No credit card required to get started.
          </p>
          <Button 
            data-testid="cta-get-started-btn"
            onClick={() => navigate('/auth')} 
            size="lg"
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-6 sm:px-8 py-3 sm:py-4 h-12 sm:h-14 text-base sm:text-lg rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            Get Started Free
            <ArrowRight className="ml-2 w-4 h-4 sm:w-5 sm:h-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 sm:py-8 px-3 sm:px-4 md:px-6 border-t border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto text-center text-xs sm:text-sm md:text-base text-gray-600">
          <p>&copy; 2025 BoostUp GH. All rights reserved.</p>
        </div>
      </footer>

      {/* Back to Top Button */}
      <BackToTop />
    </div>
  );
};

export default LandingPage;
