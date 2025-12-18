// Comprehensive keyword mapping for SEO optimization
// Maps keywords to pages, platforms, and service types

export const primaryKeywords = {
  smmPanel: [
    'SMM panel',
    'SMM panel Ghana',
    'social media marketing panel',
    'best SMM panel',
    'cheap SMM panel',
    'SMM panel service',
    'social media growth panel',
    'SMM reseller panel'
  ],
  instagram: [
    'Instagram followers',
    'buy Instagram followers',
    'Instagram followers Ghana',
    'cheap Instagram followers',
    'real Instagram followers',
    'Instagram likes',
    'buy Instagram likes',
    'Instagram views',
    'buy Instagram views',
    'Instagram comments',
    'Instagram story views',
    'Instagram engagement'
  ],
  tiktok: [
    'TikTok followers',
    'buy TikTok followers',
    'TikTok followers Ghana',
    'TikTok views',
    'buy TikTok views',
    'TikTok likes',
    'buy TikTok likes',
    'TikTok shares',
    'TikTok engagement'
  ],
  youtube: [
    'YouTube subscribers',
    'buy YouTube subscribers',
    'YouTube subscribers Ghana',
    'YouTube views',
    'buy YouTube views',
    'YouTube likes',
    'YouTube comments',
    'YouTube engagement'
  ],
  facebook: [
    'Facebook likes',
    'buy Facebook likes',
    'Facebook followers',
    'buy Facebook followers',
    'Facebook page likes',
    'Facebook post likes',
    'Facebook shares',
    'Facebook engagement'
  ],
  twitter: [
    'Twitter followers',
    'buy Twitter followers',
    'Twitter followers Ghana',
    'Twitter retweets',
    'buy Twitter retweets',
    'Twitter likes',
    'Twitter views',
    'Twitter engagement'
  ],
  whatsapp: [
    'WhatsApp group members',
    'buy WhatsApp members',
    'WhatsApp channel subscribers',
    'buy WhatsApp subscribers',
    'WhatsApp channel views',
    'buy WhatsApp views',
    'WhatsApp status reactions',
    'WhatsApp engagement'
  ],
  telegram: [
    'Telegram group members',
    'buy Telegram members',
    'Telegram channel subscribers',
    'buy Telegram subscribers',
    'Telegram channel views',
    'buy Telegram views',
    'Telegram reactions',
    'Telegram engagement'
  ]
};

export const longTailKeywords = {
  instagram: [
    'cheap Instagram followers Ghana',
    'real Instagram followers Ghana',
    'best SMM panel for Instagram',
    'how to get Instagram followers fast',
    'buy real Instagram followers',
    'increase Instagram engagement',
    'Instagram growth service',
    'Instagram followers cheap',
    'get Instagram followers instantly',
    'Instagram followers buy online'
  ],
  tiktok: [
    'real TikTok views Ghana',
    'cheap TikTok followers',
    'TikTok growth service',
    'how to grow TikTok account',
    'buy TikTok views cheap',
    'TikTok viral service',
    'increase TikTok engagement',
    'TikTok followers fast'
  ],
  youtube: [
    'buy real YouTube subscribers',
    'YouTube subscriber growth',
    'YouTube monetization growth',
    'increase YouTube subscribers',
    'YouTube views cheap',
    'YouTube growth service',
    'get YouTube subscribers fast'
  ],
  facebook: [
    'Facebook page growth',
    'increase Facebook likes',
    'Facebook followers cheap',
    'Facebook engagement service',
    'grow Facebook page'
  ],
  twitter: [
    'Twitter follower growth',
    'increase Twitter followers',
    'Twitter engagement service',
    'buy Twitter followers cheap',
    'grow Twitter account'
  ],
  whatsapp: [
    'WhatsApp group growth',
    'increase WhatsApp members',
    'WhatsApp channel growth',
    'buy WhatsApp subscribers cheap',
    'grow WhatsApp channel'
  ],
  telegram: [
    'Telegram group growth',
    'increase Telegram members',
    'Telegram channel growth',
    'buy Telegram subscribers cheap',
    'grow Telegram channel'
  ]
};

export const questionKeywords = [
  'How to buy Instagram followers?',
  'What is the best SMM panel?',
  'How to grow TikTok account?',
  'Where to buy YouTube subscribers?',
  'How to increase Instagram engagement?',
  'How to get more TikTok views?',
  'How to get YouTube subscribers?',
  'How to buy Facebook likes?',
  'How to get Twitter followers?',
  'What is an SMM panel?',
  'How does SMM panel work?',
  'Is SMM panel safe?',
  'How to use SMM panel?'
];

export const locationKeywords = [
  'Ghana',
  'Africa',
  'West Africa',
  'Accra',
  'Kumasi'
];

export const serviceTypeKeywords = {
  followers: ['followers', 'fans', 'subscribers', 'followers buy', 'get followers'],
  likes: ['likes', 'hearts', 'reactions', 'buy likes', 'get likes'],
  views: ['views', 'watches', 'impressions', 'buy views', 'get views'],
  comments: ['comments', 'replies', 'buy comments', 'get comments'],
  shares: ['shares', 'retweets', 'reposts', 'buy shares'],
  subscribers: ['subscribers', 'subs', 'buy subscribers', 'get subscribers'],
  members: ['members', 'group members', 'buy members', 'get members'],
  reactions: ['reactions', 'status reactions', 'buy reactions', 'get reactions'],
  watch_hours: ['watch hours', 'YouTube watch hours', 'buy watch hours', 'get watch hours'],
  live_stream_viewers: ['live viewers', 'stream viewers', 'buy live viewers', 'get live viewers']
};

// Generate keywords for a specific platform and service type
export const getServiceKeywords = (platform, serviceType) => {
  const platformKey = platform?.toLowerCase();
  const serviceTypeKey = serviceType?.toLowerCase();
  
  const keywords = [];
  
  // Add platform-specific keywords
  if (primaryKeywords[platformKey]) {
    keywords.push(...primaryKeywords[platformKey]);
  }
  
  // Add service type keywords
  if (serviceTypeKeywords[serviceTypeKey]) {
    keywords.push(...serviceTypeKeywords[serviceTypeKey]);
  }
  
  // Add combined keywords
  if (platformKey && serviceTypeKey) {
    keywords.push(`${platform} ${serviceTypeKey}`);
    keywords.push(`buy ${platform} ${serviceTypeKey}`);
    keywords.push(`${platform} ${serviceTypeKey} Ghana`);
    keywords.push(`cheap ${platform} ${serviceTypeKey}`);
    keywords.push(`real ${platform} ${serviceTypeKey}`);
  }
  
  // Add long-tail variations
  if (longTailKeywords[platformKey]) {
    keywords.push(...longTailKeywords[platformKey]);
  }
  
  return [...new Set(keywords)]; // Remove duplicates
};

// Generate meta description with keywords
export const generateMetaDescription = (platform, serviceType, baseDescription) => {
  const keywords = getServiceKeywords(platform, serviceType);
  const topKeywords = keywords.slice(0, 3).join(', ');
  return `${baseDescription} ${topKeywords}. Instant delivery, secure payment, 24/7 support.`;
};

// Generate page title with keywords
export const generatePageTitle = (platform, serviceType, baseTitle) => {
  if (platform && serviceType) {
    return `Buy ${platform} ${serviceType} - ${baseTitle} | BoostUp GH`;
  }
  return `${baseTitle} | BoostUp GH`;
};

