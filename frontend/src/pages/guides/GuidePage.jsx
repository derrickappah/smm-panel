import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SEO from '@/components/SEO';
import Navbar from '@/components/Navbar';
import { generateHowToSchema, generateArticleSchema, generateBreadcrumbSchema } from '@/utils/schema';
import { generateGuideMetaTags } from '@/utils/metaTags';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Guide content - in a real app, this would come from a CMS or database
const guidesContent = {
  'how-to-get-instagram-followers': {
    title: 'How to Get Instagram Followers: Step-by-Step Guide',
    description: 'Complete step-by-step guide to getting more Instagram followers. Learn proven strategies and techniques.',
    keywords: ['how to get Instagram followers', 'Instagram growth', 'get followers fast', 'Instagram marketing'],
    steps: [
      {
        name: 'Optimize Your Profile',
        text: 'Create a compelling bio, use a clear profile picture, and add a link to your website or landing page.',
        image: null
      },
      {
        name: 'Post Consistently',
        text: 'Post at least once per day and use Instagram Stories to stay active throughout the day.',
        image: null
      },
      {
        name: 'Use Relevant Hashtags',
        text: 'Research and use hashtags that are relevant to your niche. Mix popular and niche-specific hashtags.',
        image: null
      },
      {
        name: 'Engage with Your Audience',
        text: 'Respond to comments, like and comment on other posts in your niche, and use Instagram Stories to interact.',
        image: null
      },
      {
        name: 'Use SMM Services',
        text: 'Boost your initial follower count with SMM services from BoostUp GH to increase visibility and credibility.',
        image: null
      }
    ]
  },
  'tiktok-growth-strategies': {
    title: 'TikTok Growth Strategies: Complete Guide',
    description: 'Learn proven TikTok growth strategies to increase your followers, views, and engagement.',
    keywords: ['TikTok growth', 'TikTok strategies', 'grow TikTok account', 'TikTok marketing'],
    steps: [
      {
        name: 'Create Trend-Based Content',
        text: 'Jump on trending sounds, challenges, and hashtags to increase your visibility on TikTok.',
        image: null
      },
      {
        name: 'Post at Optimal Times',
        text: 'Post when your audience is most active, typically in the evening hours.',
        image: null
      },
      {
        name: 'Engage with Your Audience',
        text: 'Respond to comments, create duets, and engage with other creators in your niche.',
        image: null
      },
      {
        name: 'Use SMM Services',
        text: 'Boost your TikTok growth with views, likes, and followers from BoostUp GH.',
        image: null
      }
    ]
  },
  'youtube-subscriber-growth': {
    title: 'How to Get More YouTube Subscribers: Complete Guide',
    description: 'Learn how to grow your YouTube channel and get more subscribers with these proven strategies.',
    keywords: ['YouTube subscribers', 'YouTube growth', 'get subscribers', 'YouTube marketing'],
    steps: [
      {
        name: 'Create Valuable Content',
        text: 'Create content that solves problems or entertains your audience. Focus on quality over quantity.',
        image: null
      },
      {
        name: 'Optimize Your Videos',
        text: 'Use relevant titles, descriptions, and tags. Create eye-catching thumbnails that stand out.',
        image: null
      },
      {
        name: 'Post Consistently',
        text: 'Maintain a consistent posting schedule to keep your audience engaged and coming back.',
        image: null
      },
      {
        name: 'Promote Your Channel',
        text: 'Promote your videos across all your social media platforms and consider using SMM services.',
        image: null
      }
    ]
  },
  'social-media-marketing-tips': {
    title: 'Social Media Marketing Tips: Expert Guide',
    description: 'Essential social media marketing tips to boost your online presence and grow your brand.',
    keywords: ['social media marketing', 'SMM tips', 'digital marketing', 'social media strategy'],
    steps: [
      {
        name: 'Know Your Audience',
        text: 'Understand who your audience is, what they want to see, and when they are most active.',
        image: null
      },
      {
        name: 'Create Quality Content',
        text: 'Focus on creating high-quality, valuable content that resonates with your audience.',
        image: null
      },
      {
        name: 'Be Consistent',
        text: 'Post regularly and maintain a consistent brand voice across all platforms.',
        image: null
      },
      {
        name: 'Engage with Your Audience',
        text: 'Respond to comments, messages, and engage with your followers regularly.',
        image: null
      },
      {
        name: 'Use Analytics',
        text: 'Track your performance and adjust your strategy based on data and insights.',
        image: null
      },
      {
        name: 'Leverage SMM Services',
        text: 'Use SMM panels like BoostUp GH to boost your initial growth and increase visibility.',
        image: null
      }
    ]
  },
  'best-smm-panel-ghana': {
    title: 'Best SMM Panel in Ghana: Complete Guide',
    description: 'Find the best SMM panel in Ghana for your social media growth needs. Compare features and services.',
    keywords: ['SMM panel Ghana', 'best SMM panel', 'Ghana SMM', 'social media services Ghana'],
    steps: [
      {
        name: 'Research Available Options',
        text: 'Research different SMM panels available in Ghana and compare their features and pricing.',
        image: null
      },
      {
        name: 'Check Service Range',
        text: 'Ensure the SMM panel offers services for all platforms you need (Instagram, TikTok, YouTube, etc.).',
        image: null
      },
      {
        name: 'Compare Pricing',
        text: 'Compare prices across different SMM panels to find the best value for your budget.',
        image: null
      },
      {
        name: 'Check Support Quality',
        text: 'Look for SMM panels with 24/7 customer support and good response times.',
        image: null
      },
      {
        name: 'Choose BoostUp GH',
        text: 'BoostUp GH offers the best combination of services, pricing, and support in Ghana.',
        image: null
      }
    ]
  },
  'instagram-engagement-tips': {
    title: 'How to Increase Instagram Engagement: Complete Guide',
    description: 'Learn proven strategies to boost your Instagram engagement rate and increase likes, comments, and shares.',
    keywords: ['Instagram engagement', 'increase engagement', 'Instagram tips', 'engagement rate'],
    steps: [
      {
        name: 'Create Interactive Content',
        text: 'Use questions, polls, and interactive stories to encourage engagement from your audience.',
        image: null
      },
      {
        name: 'Post at Optimal Times',
        text: 'Post when your audience is most active to maximize engagement.',
        image: null
      },
      {
        name: 'Use Relevant Hashtags',
        text: 'Use hashtags that are relevant to your content and audience to increase discoverability.',
        image: null
      },
      {
        name: 'Engage with Others',
        text: 'Like and comment on other posts in your niche to build relationships and increase visibility.',
        image: null
      },
      {
        name: 'Use SMM Services',
        text: 'Boost your initial engagement with SMM services to increase visibility and attract organic engagement.',
        image: null
      }
    ]
  },
  'tiktok-viral-strategies': {
    title: 'TikTok Viral Strategies: How to Go Viral',
    description: 'Learn the strategies that help TikTok videos go viral and increase your reach.',
    keywords: ['TikTok viral', 'go viral', 'TikTok strategies', 'viral content'],
    steps: [
      {
        name: 'Create Trend-Based Content',
        text: 'Jump on trending sounds, challenges, and hashtags to increase your chances of going viral.',
        image: null
      },
      {
        name: 'Hook Viewers Early',
        text: 'Create an engaging opening that hooks viewers within the first 3 seconds of your video.',
        image: null
      },
      {
        name: 'Use Trending Music',
        text: 'Use popular and trending music to increase your video\'s discoverability.',
        image: null
      },
      {
        name: 'Post Consistently',
        text: 'Post multiple times per day to increase your chances of creating viral content.',
        image: null
      },
      {
        name: 'Boost with SMM Services',
        text: 'Use SMM services to boost your initial views and increase your chances of going viral.',
        image: null
      }
    ]
  },
  'youtube-monetization-growth': {
    title: 'YouTube Monetization Growth: Complete Guide',
    description: 'Learn how to grow your YouTube channel and reach monetization requirements.',
    keywords: ['YouTube monetization', 'YouTube growth', 'channel monetization', 'YouTube earnings'],
    steps: [
      {
        name: 'Reach 1,000 Subscribers',
        text: 'Focus on creating valuable content and promoting your channel to reach 1,000 subscribers.',
        image: null
      },
      {
        name: 'Get 4,000 Watch Hours',
        text: 'Create longer-form content and optimize for watch time to reach 4,000 watch hours.',
        image: null
      },
      {
        name: 'Optimize for SEO',
        text: 'Use relevant titles, descriptions, and tags to help your videos rank in search results.',
        image: null
      },
      {
        name: 'Engage Your Audience',
        text: 'Encourage likes, comments, and shares to increase engagement and watch time.',
        image: null
      },
      {
        name: 'Use SMM Services',
        text: 'Boost your subscriber count and watch hours with SMM services to reach monetization faster.',
        image: null
      }
    ]
  },
  'facebook-page-growth': {
    title: 'Facebook Page Growth: Complete Guide',
    description: 'Learn how to grow your Facebook page and increase your followers and engagement.',
    keywords: ['Facebook page growth', 'Facebook followers', 'Facebook marketing', 'grow Facebook page'],
    steps: [
      {
        name: 'Optimize Your Page',
        text: 'Create a compelling page description, add a profile picture and cover photo, and include all relevant information.',
        image: null
      },
      {
        name: 'Post Engaging Content',
        text: 'Post content that encourages engagement, such as questions, polls, and interactive posts.',
        image: null
      },
      {
        name: 'Engage with Your Audience',
        text: 'Respond to comments and messages promptly to build relationships with your audience.',
        image: null
      },
      {
        name: 'Use Facebook Ads',
        text: 'Consider using Facebook ads to promote your page and reach a wider audience.',
        image: null
      },
      {
        name: 'Use SMM Services',
        text: 'Boost your page likes and followers with SMM services from BoostUp GH.',
        image: null
      }
    ]
  },
  'twitter-follower-growth': {
    title: 'Twitter Follower Growth: Complete Guide',
    description: 'Learn how to grow your Twitter following and increase your engagement.',
    keywords: ['Twitter followers', 'Twitter growth', 'grow Twitter', 'Twitter marketing'],
    steps: [
      {
        name: 'Optimize Your Profile',
        text: 'Create a compelling bio, use a clear profile picture, and add a link to your website.',
        image: null
      },
      {
        name: 'Tweet Consistently',
        text: 'Tweet multiple times per day to stay active and increase your visibility.',
        image: null
      },
      {
        name: 'Use Relevant Hashtags',
        text: 'Use trending and relevant hashtags to increase your tweet\'s discoverability.',
        image: null
      },
      {
        name: 'Engage with Others',
        text: 'Reply to tweets, retweet relevant content, and engage with other users in your niche.',
        image: null
      },
      {
        name: 'Use SMM Services',
        text: 'Boost your follower count with SMM services to increase your credibility and visibility.',
        image: null
      }
    ]
  }
};

const GuidePage = ({ user, onLogout }) => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const guide = guidesContent[slug];

  if (!guide) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar user={user} onLogout={onLogout} />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Guide Not Found</h1>
            <p className="text-gray-600 mb-6">The guide you're looking for doesn't exist.</p>
            <Button onClick={() => navigate('/blog')}>Back to Blog</Button>
          </div>
        </div>
      </div>
    );
  }

  const seoData = generateGuideMetaTags({
    ...guide,
    slug
  });
  
  const howToSchema = generateHowToSchema({
    name: guide.title,
    description: guide.description,
    steps: guide.steps
  });
  
  const articleSchema = generateArticleSchema({
    title: guide.title,
    description: guide.description,
    url: `/guides/${slug}`,
    publishedDate: new Date().toISOString()
  });
  
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: '/' },
    { name: 'Guides', url: '/blog' },
    { name: guide.title, url: `/guides/${slug}` }
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} onLogout={onLogout} />
      <SEO
        title={seoData.title}
        description={seoData.description}
        keywords={seoData.keywords}
        canonical={seoData.canonical}
        structuredDataArray={[howToSchema, articleSchema, breadcrumbSchema]}
        ogType="article"
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
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
            {guide.title}
          </h1>
          <p className="text-xl text-gray-600">
            {guide.description}
          </p>
        </header>

        <div className="bg-white border border-gray-200 rounded-lg p-6 sm:p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Step-by-Step Guide</h2>
          <ol className="space-y-6">
            {guide.steps.map((step, index) => (
              <li key={index} className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold">
                    {index + 1}
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{step.name}</h3>
                  <p className="text-gray-600">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

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

export default GuidePage;

