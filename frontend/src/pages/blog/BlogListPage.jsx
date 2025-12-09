import React from 'react';
import { useNavigate } from 'react-router-dom';
import SEO from '@/components/SEO';
import Navbar from '@/components/Navbar';
import { generateBreadcrumbSchema } from '@/utils/schema';
import { ArrowRight, Calendar, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Blog posts data - in a real app, this would come from a CMS or database
const blogPosts = [
  {
    id: 1,
    slug: 'how-to-get-instagram-followers',
    title: 'How to Get Instagram Followers Fast: Complete Guide 2024',
    excerpt: 'Learn proven strategies to grow your Instagram followers organically and through SMM services. Tips, tricks, and best practices.',
    image: '/images/blog/instagram-followers.jpg',
    publishedDate: '2024-01-15',
    readTime: '8 min read',
    category: 'Guides',
    keywords: ['Instagram followers', 'social media growth', 'Instagram marketing']
  },
  {
    id: 2,
    slug: 'tiktok-growth-strategies',
    title: 'TikTok Growth Strategies: Go Viral in 2024',
    excerpt: 'Discover the best TikTok growth strategies to increase your followers, views, and engagement. Learn what works in 2024.',
    image: '/images/blog/tiktok-growth.jpg',
    publishedDate: '2024-01-10',
    readTime: '6 min read',
    category: 'Strategies',
    keywords: ['TikTok growth', 'TikTok marketing', 'viral content']
  },
  {
    id: 3,
    slug: 'youtube-subscriber-growth',
    title: 'How to Get More YouTube Subscribers: Ultimate Guide',
    excerpt: 'Complete guide to growing your YouTube channel. Learn how to get more subscribers, increase views, and monetize your content.',
    image: '/images/blog/youtube-subscribers.jpg',
    publishedDate: '2024-01-05',
    readTime: '10 min read',
    category: 'Guides',
    keywords: ['YouTube subscribers', 'YouTube growth', 'channel growth']
  },
  {
    id: 4,
    slug: 'social-media-marketing-tips',
    title: '10 Social Media Marketing Tips for 2024',
    excerpt: 'Essential social media marketing tips to boost your online presence. Learn from experts and grow your brand.',
    image: '/images/blog/social-media-tips.jpg',
    publishedDate: '2024-01-01',
    readTime: '7 min read',
    category: 'Tips',
    keywords: ['social media marketing', 'SMM tips', 'digital marketing']
  },
  {
    id: 5,
    slug: 'best-smm-panel-ghana',
    title: 'Best SMM Panel in Ghana: Complete Review 2024',
    excerpt: 'Find the best SMM panel in Ghana for your social media growth needs. Compare features, prices, and services.',
    image: '/images/blog/smm-panel-review.jpg',
    publishedDate: '2023-12-28',
    readTime: '5 min read',
    category: 'Reviews',
    keywords: ['SMM panel Ghana', 'best SMM panel', 'social media services']
  },
  {
    id: 6,
    slug: 'instagram-engagement-tips',
    title: 'How to Increase Instagram Engagement: 15 Proven Tips',
    excerpt: 'Learn how to boost your Instagram engagement rate with these proven strategies. Increase likes, comments, and shares.',
    image: '/images/blog/instagram-engagement.jpg',
    publishedDate: '2023-12-25',
    readTime: '9 min read',
    category: 'Tips',
    keywords: ['Instagram engagement', 'increase engagement', 'Instagram tips']
  }
];

const BlogListPage = ({ user, onLogout }) => {
  const navigate = useNavigate();

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Blog', url: '/blog' }
  ]);

  const keywords = [
    'social media blog',
    'SMM blog',
    'Instagram tips',
    'TikTok strategies',
    'YouTube growth',
    'social media marketing blog',
    'digital marketing blog',
    'social media guides'
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} onLogout={onLogout} />
      <SEO
        title="Social Media Marketing Blog - Tips, Guides & Strategies | BoostUp GH"
        description="Read our comprehensive blog about social media marketing, Instagram growth, TikTok strategies, YouTube subscriber growth, and more. Expert tips and guides."
        keywords={keywords}
        canonical="/blog"
        structuredDataArray={[breadcrumbSchema]}
      />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white py-12 sm:py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
              Social Media Marketing Blog
            </h1>
            <p className="text-lg sm:text-xl text-indigo-100 max-w-2xl mx-auto">
              Expert tips, guides, and strategies to grow your social media presence
            </p>
          </div>
        </div>
      </section>

      {/* Blog Posts Grid */}
      <section className="py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {blogPosts.map((post) => (
              <article
                key={post.id}
                className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/blog/${post.slug}`)}
              >
                <div className="aspect-video bg-gray-200">
                  {/* Image placeholder - in production, use actual images */}
                  <div className="w-full h-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
                    <span className="text-white text-2xl font-bold">{post.category}</span>
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                    <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded">{post.category}</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(post.publishedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {post.readTime}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2 line-clamp-2">
                    {post.title}
                  </h2>
                  <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                    {post.excerpt}
                  </p>
                  <Button
                    variant="ghost"
                    className="w-full justify-between group"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/blog/${post.slug}`);
                    }}
                  >
                    Read More
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default BlogListPage;

