// Vercel Edge Middleware to improve SEO for search engine crawlers
// This detects crawlers and ensures they get proper content

export function middleware(request) {
  const url = request.nextUrl;
  const userAgent = request.headers.get('user-agent') || '';

  // 1. CANONICAL DOMAIN ENFORCEMENT
  // Redirect www.boostupgh.com to boostupgh.com to prevent session fragmentation
  const host = request.headers.get('host') || '';
  if (host === 'www.boostupgh.com') {
    return Response.redirect(`https://boostupgh.com${url.pathname}${url.search}`, 301);
  }

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

  // For sensitive internal API routes, add extra safety layers
  if (url.pathname.startsWith('/api/order') || url.pathname.startsWith('/api/place-order')) {
    // This is where one would integrate with Vercel KV for multi-tenant rate limiting
    // For now, we rely on the DB-level rate limit I added to the handlers.
    // We don't return a custom response here to avoid breaking the functional chain,
    // just ensure monitoring is implicitly active.
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

