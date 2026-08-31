/**
 * Utility functions for parsing and handling video guide sources across
 * direct Supabase storage uploads, YouTube (standard & shorts), Vimeo (standard & unlisted), and Loom.
 */

/**
 * Parses timestamp string (e.g. "1h20m30s", "1m30s", "90s", "120", "1:30", "01:20:30", "1h 30m") into integer seconds.
 * @param {string|number} timeStr 
 * @returns {number|null}
 */
export const parseTimeString = (timeStr) => {
  if (timeStr === null || timeStr === undefined || timeStr === '') return null;
  if (typeof timeStr === 'number') return isFinite(timeStr) && timeStr > 0 ? Math.floor(timeStr) : null;
  
  const str = String(timeStr).trim().toLowerCase().replace(/\s+/g, '');
  if (!str) return null;

  // Format: 01:30:15 (HH:MM:SS) or 01:30 (MM:SS)
  if (str.includes(':')) {
    const parts = str.split(':').map(p => parseInt(p, 10));
    if (parts.every(p => !isNaN(p) && p >= 0)) {
      let total = 0;
      if (parts.length === 3) {
        total = parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2) {
        total = parts[0] * 60 + parts[1];
      }
      return total > 0 ? total : null;
    }
  }

  // Format: 1h20m30s or 20m30s or 90s or 1h30s or 1h30m
  const matchComplex = str.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
  if (matchComplex && (matchComplex[1] || matchComplex[2] || matchComplex[3])) {
    const hours = parseInt(matchComplex[1] || '0', 10);
    const minutes = parseInt(matchComplex[2] || '0', 10);
    const seconds = parseInt(matchComplex[3] || '0', 10);
    const total = hours * 3600 + minutes * 60 + seconds;
    return total > 0 ? total : null;
  }

  const num = parseInt(str, 10);
  return !isNaN(num) && num > 0 ? num : null;
};

/**
 * Extract timestamp parameter from URL query params or fragments.
 * @param {string} url 
 * @returns {number|null}
 */
export const extractStartTime = (url) => {
  if (!url || typeof url !== 'string') return null;
  try {
    const normalizedUrl = url.replace(/&amp;/g, '&');
    const match = normalizedUrl.match(/[?&#](?:t|start|time_continue)=([a-zA-Z0-9:]+)/i);
    if (match && match[1]) {
      return parseTimeString(match[1]);
    }
  } catch {
    // ignore
  }
  return null;
};

/**
 * Determines appropriate MIME type for direct video files.
 * @param {string} url 
 * @returns {string}
 */
export const getVideoMimeType = (url) => {
  if (!url || typeof url !== 'string') return 'video/mp4';
  const cleanUrl = url.split('#')[0].split('?')[0].toLowerCase();
  if (cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.m4v') || cleanUrl.endsWith('.m4p')) return 'video/mp4';
  if (cleanUrl.endsWith('.mov') || cleanUrl.endsWith('.qt')) return 'video/quicktime';
  if (cleanUrl.endsWith('.webm')) return 'video/webm';
  if (cleanUrl.endsWith('.ogg') || cleanUrl.endsWith('.ogv')) return 'video/ogg';
  if (cleanUrl.endsWith('.mkv')) return 'video/x-matroska';
  if (cleanUrl.endsWith('.avi')) return 'video/x-msvideo';
  if (cleanUrl.endsWith('.3gp') || cleanUrl.endsWith('.3gpp')) return 'video/3gpp';
  if (cleanUrl.endsWith('.ts')) return 'video/mp2t';
  if (cleanUrl.endsWith('.m3u8')) return 'application/x-mpegURL';
  if (cleanUrl.endsWith('.mpd')) return 'application/dash+xml';
  return 'video/mp4';
};

/**
 * Parses any video URL into structured player configuration.
 * Supports:
 * - YouTube (watch, embed, shortened youtu.be, shorts, live, v, e, youtube-nocookie)
 * - Vimeo (standard, unlisted with privacy hash, channels, groups, showcase, ondemand, player, manage/videos)
 * - Loom (share, embed, view /v/)
 * - Direct files & Supabase Storage (.mp4, .mov, .webm, .mkv, .ogg, .avi, etc.)
 * 
 * @param {string} rawUrl 
 * @returns {object|null}
 */
export const parseVideoUrl = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const url = rawUrl.trim();
  if (!url) return null;

  const normalizedUrl = url.replace(/&amp;/g, '&');
  const startTime = extractStartTime(normalizedUrl);
  const startQueryParam = startTime ? `&start=${startTime}` : '';

  // 1. YouTube Shorts: https://youtube.com/shorts/VIDEO_ID or https://www.youtube-nocookie.com/shorts/VIDEO_ID or youtu.be/shorts/VIDEO_ID
  const ytShortsMatch = normalizedUrl.match(/(?:youtube\.com|youtube-nocookie\.com|youtu\.be)\/shorts\/([a-zA-Z0-9_-]{11})/i);
  if (ytShortsMatch) {
    const videoId = ytShortsMatch[1];
    return {
      type: 'youtube',
      platform: 'youtube',
      videoId,
      isShort: true,
      startTime,
      directUrl: `https://www.youtube.com/shorts/${videoId}${startTime ? `?t=${startTime}s` : ''}`,
      fallbackWatchUrl: `https://www.youtube.com/watch?v=${videoId}${startTime ? `&t=${startTime}s` : ''}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1${startQueryParam}`,
      platformName: 'YouTube Shorts',
      platformBadge: 'YouTube Shorts'
    };
  }

  // 2. YouTube all other formats (youtu.be, watch?v=, watch/?v=, embed/, v/, e/, live/, m.youtube.com, youtube-nocookie.com)
  const ytMatch = normalizedUrl.match(/(?:youtu\.be\/|(?:youtube\.com|youtube-nocookie\.com)\/(?:embed\/|v\/|e\/|live\/|watch\/?\?(?:.*&)?v=))([a-zA-Z0-9_-]{11})/i);
  if (ytMatch) {
    const videoId = ytMatch[1];
    const isExplicitShort = normalizedUrl.toLowerCase().includes('shorts') || normalizedUrl.toLowerCase().includes('aspect=vertical');
    return {
      type: 'youtube',
      platform: 'youtube',
      videoId,
      isShort: isExplicitShort,
      startTime,
      directUrl: `https://www.youtube.com/watch?v=${videoId}${startTime ? `&t=${startTime}s` : ''}`,
      fallbackWatchUrl: `https://www.youtube.com/watch?v=${videoId}${startTime ? `&t=${startTime}s` : ''}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1${startQueryParam}`,
      platformName: 'YouTube',
      platformBadge: 'YouTube'
    };
  }

  // 3. Vimeo: vimeo.com/123456789, player.vimeo.com/video/123456789, channels, showcase, ondemand, manage/videos, unlistedHash
  const vimeoMatch = normalizedUrl.match(/(?:vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/[^\/]+\/videos\/|showcase\/[^\/]+\/video\/|ondemand\/[^\/]+\/|manage\/videos\/|video\/|)|player\.vimeo\.com\/video\/)([0-9]+)/i);
  if (vimeoMatch) {
    const videoId = vimeoMatch[1];
    // Check for unlisted privacy hash in URL path or query (?h=hash or /videoId/hash)
    const unlistedHashMatch = normalizedUrl.match(/(?:vimeo\.com\/(?:manage\/videos\/)?[0-9]+\/([a-zA-Z0-9_-]+)|[?&]h=([a-zA-Z0-9_-]+))/i);
    const unlistedHash = unlistedHashMatch ? (unlistedHashMatch[1] || unlistedHashMatch[2]) : null;
    const hashParam = unlistedHash ? `&h=${unlistedHash}` : '';
    const hashDirect = unlistedHash ? `/${unlistedHash}` : '';

    return {
      type: 'vimeo',
      platform: 'vimeo',
      videoId,
      unlistedHash,
      isShort: false,
      startTime,
      directUrl: `https://vimeo.com/${videoId}${hashDirect}${startTime ? `#t=${startTime}s` : ''}`,
      embedUrl: `https://player.vimeo.com/video/${videoId}?autoplay=1&playsinline=1&dnt=1${hashParam}${startTime ? `#t=${startTime}s` : ''}`,
      platformName: 'Vimeo',
      platformBadge: 'Vimeo'
    };
  }

  // 4. Loom: loom.com/share/ID, loom.com/embed/ID, or loom.com/v/ID
  const loomMatch = normalizedUrl.match(/loom\.com\/(?:share|embed|v)\/([a-zA-Z0-9_-]+)/i);
  if (loomMatch) {
    const videoId = loomMatch[1];
    const loomTimeParam = startTime ? `&t=${startTime}` : '';
    return {
      type: 'loom',
      platform: 'loom',
      videoId,
      isShort: false,
      startTime,
      directUrl: `https://www.loom.com/share/${videoId}${startTime ? `?t=${startTime}` : ''}`,
      embedUrl: `https://www.loom.com/embed/${videoId}?autoplay=1&hide_owner=true&hide_share=true&hide_title=true&hideEmbedTopBar=true${loomTimeParam}`,
      platformName: 'Loom',
      platformBadge: 'Loom'
    };
  }

  // 5. Direct video file (Supabase storage, mp4, mov, webm, mkv, ogg, etc.)
  const isSupabase = normalizedUrl.includes('supabase.co/storage/v1/') || 
                     normalizedUrl.includes('supabase.in/storage/v1/') || 
                     /\/storage\/v1\/(object|render|s3)\//i.test(normalizedUrl);
  const mimeType = getVideoMimeType(normalizedUrl);
  const isVertical = normalizedUrl.toLowerCase().includes('aspect=vertical') || 
                     normalizedUrl.toLowerCase().includes('shorts=1') || 
                     normalizedUrl.toLowerCase().includes('orientation=portrait') ||
                     normalizedUrl.toLowerCase().includes('aspect=9:16') ||
                     normalizedUrl.toLowerCase().includes('vertical=1');

  return {
    type: 'direct',
    platform: isSupabase ? 'supabase' : 'direct',
    url: url,
    directUrl: url,
    isShort: isVertical,
    startTime,
    mimeType,
    isSupabaseStorage: isSupabase,
    platformName: isSupabase ? 'Supabase Storage' : 'Direct Video',
    platformBadge: isSupabase ? 'Cloud Storage' : 'Direct Video'
  };
};
