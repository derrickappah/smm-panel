// Vercel Edge Middleware to improve SEO for search engine crawlers
// This detects crawlers and ensures they get proper content

export function middleware(request) {
  const url = request.nextUrl;
  const userAgent = request.headers.get('user-agent') || '';
  
  // Detect search engine crawlers
  const isCrawler = /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|sogou|exabot|facebot|ia_archiver/i.test(userAgent);
  
  // For crawlers, we want to ensure they can access the content
  // The React app will handle rendering, but we can add headers to help
  if (isCrawler) {
    const response = new Response();
    
    // Add headers to help crawlers
    response.headers.set('X-Robots-Tag', 'index, follow');
    response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    
    return response;
  }
  
  // For regular users, continue normally
  return;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};

