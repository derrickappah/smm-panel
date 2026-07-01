/**
 * Order Validation Utility
 *
 * Provides pure, platform-agnostic helpers for:
 *  1. cleanUrl()            — extract the first valid URL from arbitrary pasted text
 *  2. classifyUrl()         — detect whether a URL points to a post/content or a profile/page
 *  3. validateUrlForService() — return a validation result given the service's required url_type
 *  4. isProviderError()     — categorise a provider error string for auto-refund logic
 *
 * Adding a new platform: add one entry to PLATFORM_RULES below. No other changes needed.
 */

// ---------------------------------------------------------------------------
// 1. URL Cleaning
// ---------------------------------------------------------------------------

/**
 * Extracts the first valid http(s):// URL from an arbitrary string.
 * Customers often paste links with surrounding text like:
 *   "Check this out https://vt.tiktok.com/ZSCup9dfB/ 😂"
 *
 * @param {string} rawInput
 * @returns {string|null} Clean URL, or null if none found
 */
export function cleanUrl(rawInput) {
    if (!rawInput || typeof rawInput !== 'string') return null;

    // Match the first http(s):// URL.
    // Stops at whitespace, common trailing punctuation, or emoji boundaries.
    const match = rawInput.match(/https?:\/\/[^\s"'<>）】\u200B-\uFFFF]+/i);
    if (!match) return null;

    // Strip trailing punctuation that is unlikely to be part of the URL
    let url = match[0].replace(/[.,;!?)\]]+$/, '');

    // Basic sanity check: must have a host
    try {
        new URL(url);
        return url;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// 2. URL Classification
// ---------------------------------------------------------------------------

/**
 * Platform rules map.
 * Each entry defines an array of matchers for 'post' and 'profile' URLs.
 * A matcher is a RegExp tested against the full URL.
 *
 * Order matters: more-specific rules (post) should come before fallback (profile).
 * If neither matches, the platform returns 'unknown'.
 *
 * To add a new platform: add a new key with { post: [...], profile: [...] }.
 */
const PLATFORM_RULES = {
    // ------------------------------------------------------------------
    tiktok: {
        // Short links (vt.tiktok.com) and long video links → post
        post: [
            /vt\.tiktok\.com\//i,                         // short link e.g. vt.tiktok.com/ZSCup9dfB/
            /tiktok\.com\/@[^/]+\/video\//i,              // @user/video/123…
            /tiktok\.com\/t\//i,                           // another short form
        ],
        // Profile: @username with no /video/ path
        profile: [
            /tiktok\.com\/@[^/]+\/?(\?.*)?$/i,
        ],
    },

    // ------------------------------------------------------------------
    instagram: {
        post: [
            /instagram\.com\/(p|reel|tv|stories)\/[^/]+/i,
        ],
        profile: [
            /instagram\.com\/[^/]+\/?(\?.*)?$/i,
        ],
    },

    // ------------------------------------------------------------------
    facebook: {
        post: [
            /facebook\.com\/share\/p\//i,
            /facebook\.com\/[^/]+\/posts\//i,
            /facebook\.com\/[^/]+\/videos\//i,
            /facebook\.com\/[^/]+\/photos\//i,
            /facebook\.com\/permalink\.php/i,
            /facebook\.com\/story\.php/i,
            /fb\.watch\//i,
            /fb\.me\//i,
        ],
        profile: [
            /facebook\.com\/(profile\.php|pages\/|groups\/)/i,
            /facebook\.com\/[^/]+\/?(\?.*)?$/i,
        ],
    },

    // ------------------------------------------------------------------
    youtube: {
        post: [
            /youtu\.be\/[^/]+/i,                         // youtu.be/id
            /youtube\.com\/watch\?v=/i,                  // youtube.com/watch?v=id
            /youtube\.com\/shorts\/[^/]+/i,              // Shorts
            /youtube\.com\/live\/[^/]+/i,                // Live stream
            /youtube\.com\/embed\/[^/]+/i,               // Embed
        ],
        profile: [
            /youtube\.com\/@[^/]+\/?(\?.*)?$/i,          // /@handle
            /youtube\.com\/channel\/[^/]+\/?(\?.*)?$/i,  // /channel/UC…
            /youtube\.com\/c\/[^/]+\/?(\?.*)?$/i,         // /c/name
            /youtube\.com\/user\/[^/]+\/?(\?.*)?$/i,      // /user/name (legacy)
        ],
    },

    // ------------------------------------------------------------------
    // X / Twitter
    twitter: {
        post: [
            /x\.com\/[^/]+\/status\/\d+/i,
            /twitter\.com\/[^/]+\/status\/\d+/i,
        ],
        profile: [
            /x\.com\/[^/]+\/?(\?.*)?$/i,
            /twitter\.com\/[^/]+\/?(\?.*)?$/i,
        ],
    },

    // ------------------------------------------------------------------
    telegram: {
        // Post: channel/group name followed by a numeric message ID
        post: [
            /t\.me\/[^/]+\/\d+/i,
        ],
        // Profile: channel/group name with no message ID
        profile: [
            /t\.me\/[^/]+\/?(\?.*)?$/i,
        ],
    },

    // ------------------------------------------------------------------
    // WhatsApp — provider validates the link format; we treat all as 'unknown'
    // so validation is skipped (the admin can set url_type to null for WA services)
    whatsapp: {
        post: [],
        profile: [],
    },
};

/**
 * Determines whether a URL is a post/content URL or a profile/page URL.
 *
 * @param {string} url - A clean URL (output of cleanUrl)
 * @returns {'post'|'profile'|'unknown'}
 */
export function classifyUrl(url) {
    if (!url || typeof url !== 'string') return 'unknown';

    for (const [, rules] of Object.entries(PLATFORM_RULES)) {
        // Test post patterns first (more specific)
        for (const pattern of rules.post) {
            if (pattern.test(url)) return 'post';
        }
        // Then profile patterns
        for (const pattern of rules.profile) {
            if (pattern.test(url)) return 'profile';
        }
    }

    // URL belongs to a platform not in the rules — skip validation
    return 'unknown';
}

// ---------------------------------------------------------------------------
// 3. Service URL Validation
// ---------------------------------------------------------------------------

/**
 * Validates a cleaned URL against the service's required url_type.
 *
 * @param {string} url           - Clean URL
 * @param {'post'|'profile'|null} serviceUrlType - Value from services.url_type
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateUrlForService(url, serviceUrlType) {
    // If no url_type is configured for this service, skip validation
    if (!serviceUrlType) return { valid: true };

    const detected = classifyUrl(url);

    // If we cannot classify the URL for a known platform, skip validation
    // (avoids blocking legitimate but unrecognised URL formats)
    if (detected === 'unknown') return { valid: true };

    if (serviceUrlType === 'post' && detected !== 'post') {
        return { valid: false, message: 'Enter a valid post link.' };
    }

    if (serviceUrlType === 'profile' && detected !== 'profile') {
        return { valid: false, message: 'Enter a valid profile link.' };
    }

    return { valid: true };
}

// ---------------------------------------------------------------------------
// 4. Provider Error Classification
// ---------------------------------------------------------------------------

/**
 * Provider error types that determine auto-refund behaviour.
 *
 * 'insufficient_balance' → refund + mark refunded
 * 'invalid_service'      → should be caught pre-deduction; if post-deduction, refund
 * 'placement_failed'     → refund + mark refunded
 * 'other'                → refund (safe default — never leave customer without money)
 */
export const PROVIDER_ERROR_TYPES = {
    INSUFFICIENT_BALANCE: 'insufficient_balance',
    INVALID_SERVICE: 'invalid_service',
    PLACEMENT_FAILED: 'placement_failed',
    OTHER: 'other',
};

/**
 * Patterns for each error type (tested case-insensitively).
 */
const PROVIDER_ERROR_PATTERNS = {
    insufficient_balance: [
        /insufficient.?balance/i,
        /balance.?too.?low/i,
        /low.?balance/i,
        /not.?enough.?funds/i,
        /not.?enough.?money/i,
        /insufficient.?funds/i,
        /balance.?is.?not.?enough/i,
    ],
    invalid_service: [
        /service.?not.?found/i,
        /invalid.?service/i,
        /service.?deleted/i,
        /deleted.?service/i,
        /service.?disabled/i,
        /service.?unavailable/i,
        /invalid.?service.?mapping/i,
        /service.?does.?not.?exist/i,
        /service.?id.?not.?found/i,
        /no.?such.?service/i,
    ],
    placement_failed: [
        /placement.?failed/i,
        /order.?failed/i,
        /order.?rejected/i,
        /could.?not.?place.?order/i,
        /failed.?to.?place/i,
        /order.?not.?placed/i,
        /^failed$/i,
        /^rejected$/i,
        /order.?error/i,
    ],
};

/**
 * Classifies a provider error message.
 *
 * @param {string} errorMessage
 * @returns {string} One of PROVIDER_ERROR_TYPES values
 */
export function classifyProviderError(errorMessage) {
    if (!errorMessage || typeof errorMessage !== 'string') {
        return PROVIDER_ERROR_TYPES.OTHER;
    }

    for (const [type, patterns] of Object.entries(PROVIDER_ERROR_PATTERNS)) {
        for (const pattern of patterns) {
            if (pattern.test(errorMessage)) return type;
        }
    }

    return PROVIDER_ERROR_TYPES.OTHER;
}

/**
 * Returns true if the error warrants an automatic refund.
 * Currently ALL provider errors after balance deduction trigger a refund.
 *
 * @param {string} errorMessage
 * @returns {boolean}
 */
export function shouldAutoRefund(errorMessage) {
    // Always refund on any provider failure — customer should never lose money
    // due to provider-side issues.
    return true;
}

/**
 * Returns true if the error indicates the service is invalid/unavailable
 * (used for pre-deduction validation).
 *
 * @param {string} errorMessage
 * @returns {boolean}
 */
export function isInvalidServiceError(errorMessage) {
    return classifyProviderError(errorMessage) === PROVIDER_ERROR_TYPES.INVALID_SERVICE;
}
