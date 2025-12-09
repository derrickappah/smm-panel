// Meta tag generation utilities for SEO

const SITE_URL = 'https://boostupgh.com';
const SITE_NAME = 'BoostUp GH';
const DEFAULT_OG_IMAGE = '/favicon.svg';

// Generate meta tags for a page
export const generateMetaTags = (config) => {
  const {
    title,
    description,
    keywords = [],
    canonical,
    ogImage = DEFAULT_OG_IMAGE,
    ogType = 'website',
    twitterCard = 'summary_large_image',
    noindex = false,
    nofollow = false
  } = config;

  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  const fullCanonical = canonical ? `${SITE_URL}${canonical}` : SITE_URL;
  const fullOgImage = ogImage.startsWith('http') ? ogImage : `${SITE_URL}${ogImage}`;
  const keywordsString = Array.isArray(keywords) ? keywords.join(', ') : keywords;

  const robotsContent = [];
  if (noindex) robotsContent.push('noindex');
  if (nofollow) robotsContent.push('nofollow');
  if (robotsContent.length === 0) robotsContent.push('index', 'follow');

  return {
    title: fullTitle,
    description,
    keywords: keywordsString,
    canonical: fullCanonical,
    robots: robotsContent.join(', '),
    og: {
      title: fullTitle,
      description,
      type: ogType,
      url: fullCanonical,
      image: fullOgImage,
      siteName: SITE_NAME,
      locale: 'en_US'
    },
    twitter: {
      card: twitterCard,
      title: fullTitle,
      description,
      image: fullOgImage,
      site: '@boostupgh'
    }
  };
};

// Generate meta tags for service pages
export const generateServiceMetaTags = (service, platform, serviceType) => {
  const serviceName = service?.name || `${platform} ${serviceType}`;
  const title = `Buy ${platform} ${serviceType} - ${serviceName} | ${SITE_NAME}`;
  const description = service?.description 
    ? `${service.description} Buy ${platform} ${serviceType} from ${SITE_NAME}. Instant delivery, secure payment, 24/7 support.`
    : `Buy ${platform} ${serviceType} from ${SITE_NAME}. Get ${serviceType} for your ${platform} account. Instant delivery, secure payment, best prices.`;
  
  const keywords = [
    `buy ${platform} ${serviceType}`,
    `${platform} ${serviceType}`,
    `${platform} ${serviceType} Ghana`,
    `cheap ${platform} ${serviceType}`,
    `real ${platform} ${serviceType}`,
    `${platform} growth`,
    'SMM panel',
    'social media marketing'
  ];

  return generateMetaTags({
    title: `Buy ${platform} ${serviceType} - ${serviceName}`,
    description,
    keywords,
    canonical: `/services/${platform.toLowerCase()}/${serviceType.toLowerCase()}`,
    ogType: 'product',
    ogImage: `/images/services/${platform.toLowerCase()}-${serviceType.toLowerCase()}.jpg`
  });
};

// Generate meta tags for platform pages
export const generatePlatformMetaTags = (platform) => {
  const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
  const title = `${platformName} SMM Services - Buy ${platformName} Followers, Likes, Views | ${SITE_NAME}`;
  const description = `Buy ${platformName} followers, likes, views, and more from ${SITE_NAME}. The best ${platformName} SMM panel in Ghana. Instant delivery, secure payment, 24/7 support.`;
  
  const keywords = [
    `${platformName} SMM panel`,
    `buy ${platformName} followers`,
    `${platformName} growth service`,
    `${platformName} followers Ghana`,
    `${platformName} likes`,
    `${platformName} views`,
    `cheap ${platformName} services`,
    'SMM panel'
  ];

  return generateMetaTags({
    title: `${platformName} SMM Services`,
    description,
    keywords,
    canonical: `/${platform.toLowerCase()}-services`,
    ogType: 'website'
  });
};

// Generate meta tags for blog/content pages
export const generateBlogMetaTags = (post) => {
  const title = post.title;
  const description = post.excerpt || post.description || `${post.title} - Learn more about social media growth and SMM services.`;
  
  const keywords = [
    ...(post.keywords || []),
    'SMM panel',
    'social media marketing',
    'social media growth',
    'Instagram growth',
    'TikTok growth',
    'YouTube growth'
  ];

  return generateMetaTags({
    title,
    description,
    keywords,
    canonical: `/blog/${post.slug}`,
    ogType: 'article',
    ogImage: post.image || `/images/blog/${post.slug}.jpg`
  });
};

// Generate meta tags for guide pages
export const generateGuideMetaTags = (guide) => {
  const title = guide.title;
  const description = guide.description || `${guide.title} - Step-by-step guide to growing your social media presence.`;
  
  const keywords = [
    ...(guide.keywords || []),
    'how to',
    'guide',
    'tutorial',
    'social media growth',
    'SMM panel guide'
  ];

  return generateMetaTags({
    title,
    description,
    keywords,
    canonical: `/guides/${guide.slug}`,
    ogType: 'article',
    ogImage: guide.image || `/images/guides/${guide.slug}.jpg`
  });
};

