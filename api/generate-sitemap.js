// Dynamic sitemap generation API endpoint
// This endpoint generates a sitemap dynamically from the database and static pages

const SITE_URL = 'https://boostupgh.com';

// Service types by platform
const serviceTypes = {
  instagram: ['followers', 'likes', 'views', 'comments', 'story_views'],
  tiktok: ['followers', 'likes', 'views', 'shares'],
  youtube: ['subscribers', 'views', 'likes', 'comments', 'watch_hours', 'shares', 'live_stream_viewers'],
  facebook: ['page_likes', 'post_likes', 'followers', 'shares'],
  twitter: ['followers', 'retweets', 'likes', 'views'],
  whatsapp: ['members', 'views', 'subscribers', 'reactions'],
  telegram: ['members', 'subscribers', 'views', 'reactions']
};

// Static pages
const staticPages = [
  { url: '/', priority: '1.0', changefreq: 'weekly' },
  { url: '/auth', priority: '0.8', changefreq: 'monthly' },
  { url: '/services', priority: '0.9', changefreq: 'weekly' },
  { url: '/support', priority: '0.7', changefreq: 'weekly' },
  { url: '/blog', priority: '0.8', changefreq: 'weekly' }
];

// Platform pages
const platformPages = [
  { platform: 'instagram', priority: '0.9', changefreq: 'weekly' },
  { platform: 'tiktok', priority: '0.9', changefreq: 'weekly' },
  { platform: 'youtube', priority: '0.9', changefreq: 'weekly' },
  { platform: 'facebook', priority: '0.9', changefreq: 'weekly' },
  { platform: 'twitter', priority: '0.9', changefreq: 'weekly' },
  { platform: 'whatsapp', priority: '0.9', changefreq: 'weekly' },
  { platform: 'telegram', priority: '0.9', changefreq: 'weekly' }
];

// Blog posts
const blogPosts = [
  { slug: 'how-to-get-instagram-followers', priority: '0.8', changefreq: 'monthly' },
  { slug: 'tiktok-growth-strategies', priority: '0.8', changefreq: 'monthly' },
  { slug: 'youtube-subscriber-growth', priority: '0.8', changefreq: 'monthly' },
  { slug: 'social-media-marketing-tips', priority: '0.8', changefreq: 'monthly' },
  { slug: 'best-smm-panel-ghana', priority: '0.8', changefreq: 'monthly' },
  { slug: 'instagram-engagement-tips', priority: '0.8', changefreq: 'monthly' }
];

// Guide pages
const guidePages = [
  { slug: 'how-to-get-instagram-followers', priority: '0.8', changefreq: 'monthly' },
  { slug: 'tiktok-growth-strategies', priority: '0.8', changefreq: 'monthly' },
  { slug: 'youtube-subscriber-growth', priority: '0.8', changefreq: 'monthly' },
  { slug: 'social-media-marketing-tips', priority: '0.8', changefreq: 'monthly' },
  { slug: 'best-smm-panel-ghana', priority: '0.8', changefreq: 'monthly' },
  { slug: 'instagram-engagement-tips', priority: '0.8', changefreq: 'monthly' },
  { slug: 'tiktok-viral-strategies', priority: '0.7', changefreq: 'monthly' },
  { slug: 'youtube-monetization-growth', priority: '0.7', changefreq: 'monthly' },
  { slug: 'facebook-page-growth', priority: '0.7', changefreq: 'monthly' },
  { slug: 'twitter-follower-growth', priority: '0.7', changefreq: 'monthly' }
];

function generateSitemapXML(urls) {
  const urlEntries = urls.map(url => {
    return `  <url>
    <loc>${SITE_URL}${url.url}</loc>
    <lastmod>${url.lastmod || new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>${url.changefreq || 'weekly'}</changefreq>
    <priority>${url.priority || '0.8'}</priority>
  </url>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${urlEntries}
</urlset>`;
}

export default async function handler(req, res) {
  try {
    const urls = [];

    // Add static pages
    staticPages.forEach(page => {
      urls.push({
        ...page,
        lastmod: new Date().toISOString().split('T')[0]
      });
    });

    // Add platform pages
    platformPages.forEach(page => {
      urls.push({
        url: `/${page.platform}-services`,
        priority: page.priority,
        changefreq: page.changefreq,
        lastmod: new Date().toISOString().split('T')[0]
      });
    });

    // Add service pages
    Object.keys(serviceTypes).forEach(platform => {
      serviceTypes[platform].forEach(serviceType => {
        urls.push({
          url: `/services/${platform}/${serviceType}`,
          priority: '0.8',
          changefreq: 'weekly',
          lastmod: new Date().toISOString().split('T')[0]
        });
      });
    });

    // Add blog posts
    blogPosts.forEach(post => {
      urls.push({
        url: `/blog/${post.slug}`,
        priority: post.priority,
        changefreq: post.changefreq,
        lastmod: new Date().toISOString().split('T')[0]
      });
    });

    // Add guide pages
    guidePages.forEach(guide => {
      urls.push({
        url: `/guides/${guide.slug}`,
        priority: guide.priority,
        changefreq: guide.changefreq,
        lastmod: new Date().toISOString().split('T')[0]
      });
    });

    // Generate XML
    const sitemapXML = generateSitemapXML(urls);

    // Set headers
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

    // Send XML
    res.status(200).send(sitemapXML);
  } catch (error) {
    console.error('Error generating sitemap:', error);
    res.status(500).json({ error: 'Failed to generate sitemap' });
  }
}

