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
import { LandingHero } from '@/components/landing/LandingHero';
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
  const [isScrolled, setIsScrolled] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const updateProgress = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const progress = (scrollTop / (documentHeight - windowHeight)) * 100;
      setScrollProgress(progress);
      setIsScrolled(scrollTop > 20);
    };

    window.addEventListener('scroll', updateProgress);
    updateProgress();
    return () => window.removeEventListener('scroll', updateProgress);
  }, []);

  return (
    <>
      <div className="fixed top-0 left-0 right-0 h-1 bg-gray-100 z-[60]">
        <div
          className="h-full bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 animate-gradient transition-all duration-150"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'bg-white/90 backdrop-blur-xl border-b border-gray-100 py-3 shadow-sm' : 'bg-transparent py-5'
        }`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center cursor-pointer group" onClick={() => navigate('/')}>
            <img src="/download.png" alt="BoostUpGH" className="h-10 sm:h-12 drop-shadow-md transition-all duration-300 transform group-hover:scale-105" />
          </div>
          <div className="flex items-center space-x-4">
            <Button
              onClick={() => navigate('/services')}
              variant="ghost"
              className="hidden md:flex text-gray-700 hover:text-indigo-600 font-medium"
            >
              Services
            </Button>
            <Button
              data-testid="nav-get-started-btn"
              onClick={() => navigate('/auth')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 rounded-xl shadow-lg shadow-indigo-500/25 transition-all duration-300 hover:scale-105 active:scale-95"
            >
              Sign In
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </div>
        </div>
      </nav>
    </>
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
      <ScrollProgress />

      {/* Hero Section */}
      <LandingHero />

      {/* Trust Badges Section */}
      <TrustBadges />

      {/* Statistics Section */}
      <section ref={statsSectionRef} className="py-24 px-3 sm:px-4 md:px-6 bg-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50/50 rounded-full blur-3xl -z-10" />
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 mb-4 tracking-tight">
              Powering Global Social Growth
            </h2>
            <div className="w-24 h-1.5 bg-indigo-600 mx-auto rounded-full" />
          </div>
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
      <section className="py-24 px-3 sm:px-4 md:px-6 bg-gray-50/50 relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 mb-4 tracking-tight">
              Why Professionals Trust Us
            </h2>
            <div className="w-24 h-1.5 bg-indigo-600 mx-auto rounded-full" />
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="group bg-white border border-gray-100 rounded-3xl p-8 shadow-sm hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 relative overflow-hidden"
              >
                <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${feature.color} opacity-[0.03] group-hover:opacity-[0.08] transition-opacity duration-500 rounded-bl-full`} />

                <div className={`w-16 h-16 bg-gradient-to-br ${feature.color} rounded-2xl flex items-center justify-center mb-8 shadow-lg group-hover:scale-110 transition-transform duration-500`}>
                  <feature.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed text-lg">{feature.description}</p>
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
      <section className="py-24 px-3 sm:px-4 md:px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-indigo-600 -z-20" />
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-700 -z-10 opacity-90" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-white/10 rounded-full blur-3xl -z-10 animate-pulse" />

        <div className="max-w-4xl mx-auto bg-gray-900/40 backdrop-blur-2xl border border-white/20 rounded-[40px] p-8 sm:p-12 md:p-16 shadow-2xl text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white mb-6 leading-tight">
            Ready to Dominate <br />
            Social Media?
          </h2>
          <p className="text-lg sm:text-xl text-white/90 mb-10 max-w-2xl mx-auto leading-relaxed">
            Join 100K+ satisfied customers and start growing today.
            The best time to boost your presence was yesterday. The second best time is now.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              data-testid="cta-get-started-btn"
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              size="lg"
              className="bg-white text-indigo-900 hover:bg-gray-100 px-10 py-4 h-auto text-lg font-bold rounded-2xl transition-all duration-300 hover:scale-105 shadow-xl"
            >
              Get Started Free
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-3 sm:px-4 md:px-6 bg-white border-t border-gray-100">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center">
            <div className="mr-3">
              <img src="/download.png" alt="Logo" className="h-8" />
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 text-sm font-medium text-gray-500">
            <a href="/terms" className="hover:text-indigo-600 transition-colors">Terms of Service</a>
            <a href="/privacy" className="hover:text-indigo-600 transition-colors">Privacy Policy</a>
            <a href="/contact" className="hover:text-indigo-600 transition-colors">Contact Us</a>
            <a href="/faq" className="hover:text-indigo-600 transition-colors">Help Center</a>
          </div>

          <div className="text-sm text-gray-400 font-medium">
            &copy; 2025 BoostUp GH. Premium Social Solutions.
          </div>
        </div>
      </footer>

      {/* Back to Top Button */}
      <BackToTop />
    </div>
  );
};

export default LandingPage;
