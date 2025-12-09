import { Helmet } from 'react-helmet-async';

const SEO = ({
  title,
  description,
  keywords,
  ogImage = '/favicon.svg',
  canonical,
  structuredData,
  structuredDataArray, // Support multiple structured data objects
  noindex = false,
  nofollow = false,
  ogType = 'website',
  twitterCard = 'summary_large_image',
  author,
  publishedTime,
  modifiedTime,
  articleSection,
  tags,
}) => {
  const siteUrl = 'https://boostupgh.com';
  const siteName = 'BoostUp GH';
  const fullTitle = title ? `${title} | ${siteName}` : siteName;
  const fullCanonical = canonical ? `${siteUrl}${canonical}` : siteUrl;
  const fullOgImage = ogImage.startsWith('http') ? ogImage : `${siteUrl}${ogImage}`;

  const robotsContent = [];
  if (noindex) robotsContent.push('noindex');
  if (nofollow) robotsContent.push('nofollow');
  if (robotsContent.length === 0) robotsContent.push('index', 'follow');

  // Handle keywords - can be string or array
  const keywordsString = Array.isArray(keywords) ? keywords.join(', ') : keywords;

  // Prepare structured data array
  const allStructuredData = [];
  if (structuredData) {
    allStructuredData.push(structuredData);
  }
  if (structuredDataArray && Array.isArray(structuredDataArray)) {
    allStructuredData.push(...structuredDataArray);
  }

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      {keywordsString && <meta name="keywords" content={keywordsString} />}
      <meta name="robots" content={robotsContent.join(', ')} />
      <link rel="canonical" href={fullCanonical} />
      {author && <meta name="author" content={author} />}

      {/* Open Graph Tags */}
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={fullCanonical} />
      <meta property="og:image" content={fullOgImage} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:locale" content="en_US" />
      {publishedTime && <meta property="article:published_time" content={publishedTime} />}
      {modifiedTime && <meta property="article:modified_time" content={modifiedTime} />}
      {articleSection && <meta property="article:section" content={articleSection} />}
      {tags && Array.isArray(tags) && tags.map((tag, index) => (
        <meta key={index} property="article:tag" content={tag} />
      ))}

      {/* Twitter Card Tags */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:title" content={fullTitle} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={fullOgImage} />
      <meta name="twitter:site" content="@boostupgh" />

      {/* Structured Data (JSON-LD) - Support multiple schemas */}
      {allStructuredData.map((data, index) => (
        <script key={index} type="application/ld+json">
          {JSON.stringify(data)}
        </script>
      ))}
    </Helmet>
  );
};

export default SEO;











