import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Zap, Shield, TrendingUp, Instagram, Youtube, Facebook, Twitter, Music, Users, Heart, Eye, MessageCircle } from 'lucide-react';
import SEO from '@/components/SEO';
import { supabase } from '@/lib/supabase';

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

const LandingPage = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalLikes: 0,
    totalFollowers: 0,
    totalViews: 0,
    totalUsers: 0,
    totalComments: 0
  });
  const [loading, setLoading] = useState(true);

  const platforms = [
    { name: 'Instagram', icon: Instagram, color: 'text-pink-600' },
    { name: 'TikTok', icon: Music, color: 'text-gray-800' },
    { name: 'YouTube', icon: Youtube, color: 'text-red-600' },
    { name: 'Facebook', icon: Facebook, color: 'text-blue-600' },
    { name: 'Twitter', icon: Twitter, color: 'text-sky-500' },
  ];

  const features = [
    {
      icon: Zap,
      title: 'Instant Delivery',
      description: 'Get your orders started within minutes of placing them'
    },
    {
      icon: Shield,
      title: 'Secure & Safe',
      description: 'Your data and orders are protected with enterprise-grade security'
    },
    {
      icon: TrendingUp,
      title: 'Real Growth',
      description: 'High-quality engagement from real accounts'
    }
  ];

  // Helper function to fetch all records using pagination
  const fetchAllRecords = async (table, select, filters = {}, batchSize = 1000) => {
    let allRecords = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const to = from + batchSize - 1;
      // Create a fresh query for each batch to avoid mutation
      let query = supabase.from(table).select(select);
      
      // Apply filters
      if (filters.eq) {
        Object.entries(filters.eq).forEach(([field, val]) => {
          query = query.eq(field, val);
        });
      }
      
      if (filters.orderBy) {
        query = query.order(filters.orderBy.field, { ascending: filters.orderBy.ascending !== false });
      }
      
      // Apply range last
      query = query.range(from, to);

      const { data, error } = await query;
      
      if (error) {
        console.error(`Error fetching batch ${from}-${to}:`, error);
        throw error;
      }

      if (data && data.length > 0) {
        allRecords = [...allRecords, ...data];
        hasMore = data.length === batchSize;
        from = to + 1;
      } else {
        hasMore = false;
      }
    }

    console.log(`Fetched ${allRecords.length} total records from ${table}`);
    return allRecords;
  };

  // Fetch public statistics
  useEffect(() => {
    const fetchStats = async () => {
      try {
        console.log('Starting to fetch stats...');
        // Use efficient queries: fetch only recent sample (last 5000 orders) for stats calculation
        // This is much faster than fetching all orders and provides accurate enough statistics
        const SAMPLE_SIZE = 5000;
        const [ordersDataResult, ordersCountResult, usersResult] = await Promise.allSettled([
          supabase
            .from('orders')
            .select('quantity, services(name, service_type)')
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(SAMPLE_SIZE),
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

        // Process orders data - only process sample
        if (ordersDataResult.status === 'fulfilled' && ordersDataResult.value?.data) {
          const ordersData = ordersDataResult.value.data;
          console.log(`Processing ${ordersData.length} recent orders for stats...`);
          
          ordersData.forEach(order => {
            const quantity = parseInt(order.quantity || 0);
            if (isNaN(quantity) || quantity <= 0) return;

            const serviceType = (order.services?.service_type || '').toLowerCase();
            const serviceName = (order.services?.name || '').toLowerCase();

            if (serviceType.includes('like') || serviceName.includes('like')) {
              totalLikes += quantity;
            }
            if (serviceType.includes('follower') || serviceName.includes('follower')) {
              totalFollowers += quantity;
            }
            if (serviceType.includes('view') || serviceName.includes('view')) {
              totalViews += quantity;
            }
            if (serviceType.includes('comment') || serviceName.includes('comment')) {
              totalComments += quantity;
            }
          });
          
          // If we got a full sample, we can extrapolate for display purposes
          // But for landing page, showing recent activity is more meaningful
          console.log('Calculated totals from recent orders:', { totalLikes, totalFollowers, totalViews, totalComments });
        } else if (ordersDataResult.status === 'rejected') {
          console.error('Failed to fetch orders:', ordersDataResult.reason);
        }

        // Process orders count
        if (ordersCountResult.status === 'fulfilled' && !ordersCountResult.value.error) {
          ordersCount = ordersCountResult.value.count || 0;
        }

        // Process users count
        if (usersResult.status === 'fulfilled' && !usersResult.value.error) {
          usersCount = usersResult.value.count || 0;
        }

        // Update stats with actual data
        setStats({
          totalOrders: ordersCount,
          totalLikes: totalLikes,
          totalFollowers: totalFollowers,
          totalViews: totalViews,
          totalUsers: usersCount,
          totalComments: totalComments
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
        // If error, keep current stats or set to 0
        setStats(prev => ({
          totalOrders: prev.totalOrders || 0,
          totalLikes: prev.totalLikes || 0,
          totalFollowers: prev.totalFollowers || 0,
          totalViews: prev.totalViews || 0,
          totalUsers: prev.totalUsers || 0,
          totalComments: prev.totalComments || 0
        }));
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://boostupgh.com/#organization',
        name: 'BoostUp GH',
        url: 'https://boostupgh.com',
        logo: 'https://boostupgh.com/favicon.svg',
        description: 'The most reliable SMM panel for boosting your followers, likes, views, and engagement across all major social media platforms',
        sameAs: [],
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'Customer Service',
          availableLanguage: 'English'
        }
      },
      {
        '@type': 'WebSite',
        '@id': 'https://boostupgh.com/#website',
        url: 'https://boostupgh.com',
        name: 'BoostUp GH',
        description: 'Grow your social media presence instantly with our reliable SMM panel',
        publisher: {
          '@id': 'https://boostupgh.com/#organization'
        },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: 'https://boostupgh.com/services?search={search_term_string}'
          },
          'query-input': 'required name=search_term_string'
        }
      },
      {
        '@type': 'Service',
        '@id': 'https://boostupgh.com/#service',
        name: 'Social Media Marketing Services',
        description: 'Professional SMM panel services for Instagram, TikTok, YouTube, Facebook, and Twitter. Get followers, likes, views, and engagement instantly.',
        provider: {
          '@id': 'https://boostupgh.com/#organization'
        },
        areaServed: 'Worldwide',
        serviceType: 'Social Media Marketing'
      }
    ]
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <SEO
        title="Boost Your Social Media Presence - SMM Panel | BoostUp GH"
        description="Grow your social media presence instantly with BoostUp GH. The most reliable SMM panel for Instagram followers, TikTok views, YouTube subscribers, Facebook likes, and Twitter followers. Instant delivery, secure & safe."
        keywords="SMM panel, social media marketing, Instagram followers, TikTok views, YouTube subscribers, Facebook likes, Twitter followers, social media growth, SMM services, boost followers, increase engagement"
        canonical="/"
        structuredData={structuredData}
      />
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 fixed top-0 left-0 right-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl sm:text-2xl font-bold text-gray-900">BoostUp GH</span>
          </div>
          <Button 
            data-testid="nav-get-started-btn"
            onClick={() => navigate('/auth')} 
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 sm:px-6 py-2 h-10 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200"
          >
            Get Started
            <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-24 sm:pt-32 pb-16 sm:pb-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto text-center animate-fadeIn">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-gray-900 mb-4 sm:mb-6 leading-tight">
            Grow Your Social Media
            <br />
            <span className="text-indigo-600">
              Presence Instantly
            </span>
          </h1>
          <p className="text-base sm:text-lg text-gray-600 mb-8 sm:mb-10 max-w-2xl mx-auto">
            The most reliable SMM panel for boosting your followers, likes, views, and engagement across all major platforms
          </p>
          <Button 
            data-testid="hero-get-started-btn"
            onClick={() => navigate('/auth')} 
            size="lg"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 sm:px-8 py-3 sm:py-4 h-12 sm:h-14 text-base sm:text-lg rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200"
          >
            Start Boosting Now
            <ArrowRight className="ml-2 w-4 h-4 sm:w-5 sm:h-5" />
          </Button>

          {/* Platform Icons */}
          <div className="flex justify-center items-center gap-6 sm:gap-8 mt-12 sm:mt-16 flex-wrap">
            {platforms.map((platform) => (
              <div key={platform.name} className="flex flex-col items-center space-y-2 animate-slideUp">
                <div className="bg-white border border-gray-200 w-14 h-14 sm:w-16 sm:h-16 rounded-lg flex items-center justify-center shadow-sm hover:shadow-md transition-shadow duration-200">
                  <platform.icon className={`w-7 h-7 sm:w-8 sm:h-8 ${platform.color}`} />
                </div>
                <span className="text-xs sm:text-sm font-medium text-gray-700">{platform.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Statistics Section */}
      <section className="py-12 sm:py-16 lg:py-20 px-4 sm:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-center text-gray-900 mb-8 sm:mb-12">
            Our Impact in Numbers
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6">
            {/* Total Orders */}
            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 rounded-lg p-4 sm:p-6 text-center shadow-sm hover:shadow-md transition-shadow duration-200">
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-indigo-600 rounded-lg flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <TrendingUp className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              </div>
              <div className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-1 sm:mb-2">
                {loading ? '...' : <AnimatedNumber value={stats.totalOrders} />}
              </div>
              <p className="text-xs sm:text-sm text-gray-600 font-medium">Orders Completed</p>
            </div>

            {/* Total Likes */}
            <div className="bg-gradient-to-br from-pink-50 to-pink-100 border border-pink-200 rounded-lg p-4 sm:p-6 text-center shadow-sm hover:shadow-md transition-shadow duration-200">
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-pink-600 rounded-lg flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <Heart className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              </div>
              <div className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-1 sm:mb-2">
                {loading ? '...' : <AnimatedNumber value={stats.totalLikes} formatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toLocaleString()} />}
              </div>
              <p className="text-xs sm:text-sm text-gray-600 font-medium">Likes Sent</p>
            </div>

            {/* Total Followers */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4 sm:p-6 text-center shadow-sm hover:shadow-md transition-shadow duration-200">
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-blue-600 rounded-lg flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <Users className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              </div>
              <div className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-1 sm:mb-2">
                {loading ? '...' : <AnimatedNumber value={stats.totalFollowers} formatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toLocaleString()} />}
              </div>
              <p className="text-xs sm:text-sm text-gray-600 font-medium">Followers Sent</p>
            </div>

            {/* Total Views */}
            <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 border border-cyan-200 rounded-lg p-4 sm:p-6 text-center shadow-sm hover:shadow-md transition-shadow duration-200">
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-cyan-600 rounded-lg flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <Eye className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              </div>
              <div className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-1 sm:mb-2">
                {loading ? '...' : <AnimatedNumber value={stats.totalViews} formatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toLocaleString()} />}
              </div>
              <p className="text-xs sm:text-sm text-gray-600 font-medium">Views Sent</p>
            </div>

            {/* Total Comments */}
            <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-4 sm:p-6 text-center shadow-sm hover:shadow-md transition-shadow duration-200">
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-green-600 rounded-lg flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <MessageCircle className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              </div>
              <div className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-1 sm:mb-2">
                {loading ? '...' : <AnimatedNumber value={stats.totalComments} formatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toLocaleString()} />}
              </div>
              <p className="text-xs sm:text-sm text-gray-600 font-medium">Comments Sent</p>
            </div>

            {/* Total Users */}
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-4 sm:p-6 text-center shadow-sm hover:shadow-md transition-shadow duration-200">
              <div className="w-12 h-12 sm:w-14 sm:h-14 bg-purple-600 rounded-lg flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <Users className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              </div>
              <div className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-1 sm:mb-2">
                {loading ? '...' : <AnimatedNumber value={stats.totalUsers} formatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toLocaleString()} />}
              </div>
              <p className="text-xs sm:text-sm text-gray-600 font-medium">Happy Users</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-12 sm:py-16 lg:py-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-center text-gray-900 mb-8 sm:mb-12">
            Why Choose BoostUp GH?
          </h2>
          <div className="grid md:grid-cols-3 gap-6 sm:gap-8">
            {features.map((feature, index) => (
              <div 
                key={index} 
                className="bg-white border border-gray-200 rounded-lg p-6 sm:p-8 shadow-sm hover:shadow-md transition-shadow duration-200 animate-slideUp"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-indigo-100 rounded-lg flex items-center justify-center mb-4 sm:mb-6">
                  <feature.icon className="w-6 h-6 sm:w-7 sm:h-7 text-indigo-600" />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:mb-3">{feature.title}</h3>
                <p className="text-sm sm:text-base text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 sm:py-16 lg:py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto bg-white border border-gray-200 rounded-lg p-8 sm:p-12 shadow-sm text-center">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4 sm:mb-6">
            Ready to Boost Your Social Media?
          </h2>
          <p className="text-base sm:text-lg text-gray-600 mb-6 sm:mb-8">
            Join thousands of satisfied customers and start growing today
          </p>
          <Button 
            data-testid="cta-get-started-btn"
            onClick={() => navigate('/auth')} 
            size="lg"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 sm:px-8 py-3 sm:py-4 h-12 sm:h-14 text-base sm:text-lg rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200"
          >
            Get Started Free
            <ArrowRight className="ml-2 w-4 h-4 sm:w-5 sm:h-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 sm:py-8 px-4 sm:px-6 border-t border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto text-center text-sm sm:text-base text-gray-600">
          <p>&copy; 2025 BoostUp GH. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;