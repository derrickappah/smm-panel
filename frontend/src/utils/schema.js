// Schema.org structured data generation utilities

const SITE_URL = 'https://boostupgh.com';
const SITE_NAME = 'BoostUp GH';

// Generate Service schema
export const generateServiceSchema = (service) => {
  if (!service) return null;
  
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.description || `${service.platform} ${service.service_type} service`,
    provider: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/favicon.svg`
    },
    areaServed: {
      '@type': 'Country',
      name: 'Ghana'
    },
    serviceType: `${service.platform} ${service.service_type}`,
    offers: {
      '@type': 'Offer',
      price: service.rate,
      priceCurrency: 'GHS',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: service.rate,
        priceCurrency: 'GHS',
        unitText: 'per 1000'
      },
      availability: service.enabled ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition'
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      reviewCount: '1000',
      bestRating: '5',
      worstRating: '1'
    }
  };
};

// Generate BreadcrumbList schema
export const generateBreadcrumbSchema = (items) => {
  if (!items || items.length === 0) return null;
  
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url ? `${SITE_URL}${item.url}` : undefined
    }))
  };
};

// Generate FAQPage schema
export const generateFAQSchema = (faqs) => {
  if (!faqs || faqs.length === 0) return null;
  
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer
      }
    }))
  };
};

// Generate Article schema
export const generateArticleSchema = (article) => {
  if (!article) return null;
  
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    image: article.image ? `${SITE_URL}${article.image}` : `${SITE_URL}/favicon.svg`,
    datePublished: article.publishedDate || new Date().toISOString(),
    dateModified: article.modifiedDate || article.publishedDate || new Date().toISOString(),
    author: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/favicon.svg`
      }
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${SITE_URL}${article.url}`
    }
  };
};

// Generate HowTo schema
export const generateHowToSchema = (howTo) => {
  if (!howTo) return null;
  
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: howTo.name,
    description: howTo.description,
    step: howTo.steps?.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
      image: step.image ? `${SITE_URL}${step.image}` : undefined
    })) || []
  };
};

// Generate Organization schema
export const generateOrganizationSchema = () => {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/favicon.svg`,
    description: 'The most reliable SMM panel for boosting your followers, likes, views, and engagement across all major social media platforms',
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Service',
      email: 'admin@boostupgh.com',
      availableLanguage: 'English',
      areaServed: 'GH',
      hoursAvailable: {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: [
          'Monday',
          'Tuesday',
          'Wednesday',
          'Thursday',
          'Friday',
          'Saturday',
          'Sunday'
        ],
        opens: '00:00',
        closes: '23:59'
      }
    },
    sameAs: [],
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'GH'
    }
  };
};

// Generate WebSite schema with SearchAction
export const generateWebSiteSchema = () => {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description: 'Grow your social media presence instantly with our reliable SMM panel',
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME
    },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/services?search={search_term_string}`
      },
      'query-input': 'required name=search_term_string'
    }
  };
};

// Generate ItemList schema for services
export const generateServiceListSchema = (services) => {
  if (!services || services.length === 0) return null;
  
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Social Media Marketing Services',
    description: 'Browse our comprehensive list of SMM services for Instagram, TikTok, YouTube, Facebook, and Twitter',
    itemListElement: services.slice(0, 20).map((service, index) => ({
      '@type': 'Service',
      position: index + 1,
      name: service.name,
      description: service.description,
      provider: {
        '@type': 'Organization',
        name: SITE_NAME
      },
      offers: {
        '@type': 'Offer',
        price: service.rate,
        priceCurrency: 'GHS',
        availability: service.enabled ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'
      }
    }))
  };
};

// Generate LocalBusiness schema (if applicable)
export const generateLocalBusinessSchema = () => {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: SITE_NAME,
    image: `${SITE_URL}/favicon.svg`,
    '@id': `${SITE_URL}#organization`,
    url: SITE_URL,
    telephone: '',
    priceRange: '$$',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'GH'
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: '',
      longitude: ''
    },
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday'
      ],
      opens: '00:00',
      closes: '23:59'
    }
  };
};

// Generate Review/Rating schema
export const generateReviewSchema = (reviews) => {
  if (!reviews || reviews.length === 0) return null;
  
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${SITE_NAME} Services`,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      reviewCount: reviews.length.toString(),
      bestRating: '5',
      worstRating: '1'
    },
    review: reviews.map(review => ({
      '@type': 'Review',
      author: {
        '@type': 'Person',
        name: review.author || 'Anonymous'
      },
      datePublished: review.date || new Date().toISOString(),
      reviewBody: review.text,
      reviewRating: {
        '@type': 'Rating',
        ratingValue: review.rating || '5',
        bestRating: '5',
        worstRating: '1'
      }
    }))
  };
};

