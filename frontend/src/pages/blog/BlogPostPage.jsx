import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SEO from '@/components/SEO';
import Navbar from '@/components/Navbar';
import { generateArticleSchema, generateBreadcrumbSchema } from '@/utils/schema';
import { generateBlogMetaTags } from '@/utils/metaTags';
import { ArrowLeft, Calendar, Clock, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Blog posts content - in a real app, this would come from a CMS or database
const blogPostsContent = {
  'how-to-get-instagram-followers': {
    title: 'How to Get Instagram Followers Fast: Complete Guide 2024',
    excerpt: 'Learn proven strategies to grow your Instagram followers organically and through SMM services. Tips, tricks, and best practices.',
    image: '/images/blog/instagram-followers.jpg',
    publishedDate: '2024-01-15',
    modifiedDate: '2024-01-15',
    readTime: '8 min read',
    category: 'Guides',
    keywords: ['Instagram followers', 'social media growth', 'Instagram marketing', 'get followers fast'],
    content: `
      <h2>Introduction</h2>
      <p>Growing your Instagram followers is essential for building a strong online presence. In this comprehensive guide, we'll explore both organic and SMM panel strategies to help you gain followers quickly and effectively.</p>
      
      <h2>Organic Growth Strategies</h2>
      <h3>1. Optimize Your Profile</h3>
      <p>Your Instagram profile is the first thing people see. Make sure you have:</p>
      <ul>
        <li>A clear, recognizable profile picture</li>
        <li>A compelling bio that describes what you do</li>
        <li>A link to your website or landing page</li>
      </ul>
      
      <h3>2. Post Consistently</h3>
      <p>Consistency is key to Instagram growth. Post at least once per day, and use Instagram Stories to stay active throughout the day.</p>
      
      <h3>3. Use Relevant Hashtags</h3>
      <p>Research and use hashtags that are relevant to your niche. Mix popular and niche-specific hashtags for maximum reach.</p>
      
      <h2>Using SMM Panels for Growth</h2>
      <p>While organic growth is important, SMM panels can help you kickstart your follower count. Here's how to use them effectively:</p>
      <ul>
        <li>Start with a small number to test quality</li>
        <li>Choose reputable SMM panels like BoostUp GH</li>
        <li>Combine SMM services with organic growth strategies</li>
      </ul>
      
      <h2>Conclusion</h2>
      <p>Growing your Instagram followers requires a combination of organic strategies and smart use of SMM services. By following these tips, you'll be on your way to building a strong Instagram presence.</p>
    `
  },
  'tiktok-growth-strategies': {
    title: 'TikTok Growth Strategies: Go Viral in 2024',
    excerpt: 'Discover the best TikTok growth strategies to increase your followers, views, and engagement. Learn what works in 2024.',
    image: '/images/blog/tiktok-growth.jpg',
    publishedDate: '2024-01-10',
    modifiedDate: '2024-01-10',
    readTime: '6 min read',
    category: 'Strategies',
    keywords: ['TikTok growth', 'TikTok marketing', 'viral content', 'TikTok strategies'],
    content: `
      <h2>Introduction</h2>
      <p>TikTok has become one of the fastest-growing social media platforms. Here are proven strategies to grow your TikTok account in 2024.</p>
      
      <h2>Content Creation Tips</h2>
      <h3>1. Create Trend-Based Content</h3>
      <p>Jump on trending sounds, challenges, and hashtags to increase your visibility.</p>
      
      <h3>2. Post at Optimal Times</h3>
      <p>Post when your audience is most active. Typically, this is in the evening hours.</p>
      
      <h2>Engagement Strategies</h2>
      <p>Engage with your audience by responding to comments and creating content that encourages interaction.</p>
      
      <h2>Using SMM Services</h2>
      <p>Boost your TikTok growth with SMM services like views, likes, and followers from BoostUp GH to increase your visibility and credibility.</p>
    `
  },
  'youtube-subscriber-growth': {
    title: 'How to Get More YouTube Subscribers: Ultimate Guide',
    excerpt: 'Complete guide to growing your YouTube channel. Learn how to get more subscribers, increase views, and monetize your content.',
    image: '/images/blog/youtube-subscribers.jpg',
    publishedDate: '2024-01-05',
    modifiedDate: '2024-01-05',
    readTime: '10 min read',
    category: 'Guides',
    keywords: ['YouTube subscribers', 'YouTube growth', 'channel growth', 'YouTube marketing'],
    content: `
      <h2>Introduction</h2>
      <p>Growing your YouTube channel requires consistent effort and the right strategies. Here's your complete guide.</p>
      
      <h2>Content Strategy</h2>
      <p>Create valuable, engaging content that solves problems or entertains your audience. Consistency is key.</p>
      
      <h2>Optimization Tips</h2>
      <p>Optimize your videos with relevant titles, descriptions, and tags. Use thumbnails that stand out.</p>
      
      <h2>Promotion Strategies</h2>
      <p>Promote your videos across all your social media platforms and consider using SMM services to boost initial visibility.</p>
    `
  },
  'social-media-marketing-tips': {
    title: '10 Social Media Marketing Tips for 2024',
    excerpt: 'Essential social media marketing tips to boost your online presence. Learn from experts and grow your brand.',
    image: '/images/blog/social-media-tips.jpg',
    publishedDate: '2024-01-01',
    modifiedDate: '2024-01-01',
    readTime: '7 min read',
    category: 'Tips',
    keywords: ['social media marketing', 'SMM tips', 'digital marketing', 'social media strategy'],
    content: `
      <h2>Introduction</h2>
      <p>Here are 10 essential social media marketing tips to help you succeed in 2024.</p>
      
      <h2>1. Know Your Audience</h2>
      <p>Understand who your audience is and what they want to see.</p>
      
      <h2>2. Create Quality Content</h2>
      <p>Focus on creating high-quality, valuable content that resonates with your audience.</p>
      
      <h2>3. Be Consistent</h2>
      <p>Post regularly and maintain a consistent brand voice across all platforms.</p>
      
      <h2>4. Engage with Your Audience</h2>
      <p>Respond to comments, messages, and engage with your followers regularly.</p>
      
      <h2>5. Use Analytics</h2>
      <p>Track your performance and adjust your strategy based on data.</p>
      
      <h2>6. Leverage SMM Services</h2>
      <p>Use SMM panels like BoostUp GH to boost your initial growth and increase visibility.</p>
      
      <h2>7. Collaborate with Others</h2>
      <p>Partner with influencers and other brands to expand your reach.</p>
      
      <h2>8. Stay Updated with Trends</h2>
      <p>Keep up with the latest social media trends and adapt your strategy accordingly.</p>
      
      <h2>9. Optimize for Each Platform</h2>
      <p>Tailor your content for each platform's unique features and audience.</p>
      
      <h2>10. Be Patient</h2>
      <p>Social media growth takes time. Stay consistent and patient.</p>
    `
  },
  'best-smm-panel-ghana': {
    title: 'Best SMM Panel in Ghana: Complete Review 2024',
    excerpt: 'Find the best SMM panel in Ghana for your social media growth needs. Compare features, prices, and services.',
    image: '/images/blog/smm-panel-review.jpg',
    publishedDate: '2023-12-28',
    modifiedDate: '2023-12-28',
    readTime: '5 min read',
    category: 'Reviews',
    keywords: ['SMM panel Ghana', 'best SMM panel', 'social media services', 'Ghana SMM'],
    content: `
      <h2>Introduction</h2>
      <p>Looking for the best SMM panel in Ghana? Here's a comprehensive review of BoostUp GH and what makes it the top choice.</p>
      
      <h2>Why Choose BoostUp GH?</h2>
      <h3>1. Comprehensive Service Range</h3>
      <p>We offer services for Instagram, TikTok, YouTube, Facebook, and Twitter.</p>
      
      <h3>2. Competitive Pricing</h3>
      <p>Our prices are among the most competitive in the market, with transparent pricing.</p>
      
      <h3>3. Instant Delivery</h3>
      <p>Most orders start within minutes of payment confirmation.</p>
      
      <h3>4. 24/7 Support</h3>
      <p>Our dedicated support team is available around the clock to help you.</p>
      
      <h2>Conclusion</h2>
      <p>BoostUp GH is the best SMM panel in Ghana for all your social media growth needs.</p>
    `
  },
  'instagram-engagement-tips': {
    title: 'How to Increase Instagram Engagement: 15 Proven Tips',
    excerpt: 'Learn how to boost your Instagram engagement rate with these proven strategies. Increase likes, comments, and shares.',
    image: '/images/blog/instagram-engagement.jpg',
    publishedDate: '2023-12-25',
    modifiedDate: '2023-12-25',
    readTime: '9 min read',
    category: 'Tips',
    keywords: ['Instagram engagement', 'increase engagement', 'Instagram tips', 'engagement rate'],
    content: `
      <h2>Introduction</h2>
      <p>High engagement is crucial for Instagram success. Here are 15 proven tips to increase your engagement rate.</p>
      
      <h2>Content Strategies</h2>
      <p>Create content that encourages interaction, such as questions, polls, and interactive stories.</p>
      
      <h2>Posting Best Practices</h2>
      <p>Post at optimal times, use relevant hashtags, and engage with your audience consistently.</p>
      
      <h2>Using SMM Services</h2>
      <p>Boost your initial engagement with SMM services to increase visibility and attract organic engagement.</p>
    `
  }
};

const BlogPostPage = ({ user, onLogout }) => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const post = blogPostsContent[slug];

  if (!post) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar user={user} onLogout={onLogout} />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Post Not Found</h1>
            <p className="text-gray-600 mb-6">The blog post you're looking for doesn't exist.</p>
            <Button onClick={() => navigate('/blog')}>Back to Blog</Button>
          </div>
        </div>
      </div>
    );
  }

  const seoData = generateBlogMetaTags(post);
  const articleSchema = generateArticleSchema({
    ...post,
    url: `/blog/${slug}`
  });
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Blog', url: '/blog' },
    { name: post.title, url: `/blog/${slug}` }
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} onLogout={onLogout} />
      <SEO
        title={seoData.title}
        description={seoData.description}
        keywords={seoData.keywords}
        canonical={seoData.canonical}
        structuredDataArray={[articleSchema, breadcrumbSchema]}
        ogType="article"
        publishedTime={post.publishedDate}
        modifiedTime={post.modifiedDate}
        articleSection={post.category}
        tags={post.keywords}
      />

      <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <Button
          variant="ghost"
          onClick={() => navigate('/blog')}
          className="mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Blog
        </Button>

        <header className="mb-8">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
            <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded">{post.category}</span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(post.publishedDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {post.readTime}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
            {post.title}
          </h1>
          <p className="text-xl text-gray-600">
            {post.excerpt}
          </p>
        </header>

        <div className="aspect-video bg-gray-200 rounded-lg mb-8">
          <div className="w-full h-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center rounded-lg">
            <span className="text-white text-2xl font-bold">{post.category}</span>
          </div>
        </div>

        <div
          className="prose prose-lg max-w-none"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        <div className="mt-12 pt-8 border-t border-gray-200">
          <Button
            variant="outline"
            onClick={() => navigate('/services')}
            className="w-full sm:w-auto"
          >
            Explore Our Services
            <ArrowLeft className="w-4 h-4 ml-2 rotate-180" />
          </Button>
        </div>
      </article>
    </div>
  );
};

export default BlogPostPage;

