import assert from 'node:assert/strict';
import { parseVideoUrl, parseTimeString, extractStartTime, getVideoMimeType } from '../frontend/src/lib/videoUtils.js';

console.log('--- Starting Video Playback and Embed Resolution Test Suite ---');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(err);
    throw err;
  }
}

// 1. Direct Supabase Storage & Native Video Files
test('Direct Supabase Storage MP4 upload', () => {
  const url = 'https://spihsvdchouynfbsotwq.supabase.co/storage/v1/object/public/service-videos/guide_deposit.mp4';
  const info = parseVideoUrl(url);
  assert.ok(info);
  assert.equal(info.type, 'direct');
  assert.equal(info.platform, 'supabase');
  assert.equal(info.isSupabaseStorage, true);
  assert.equal(info.mimeType, 'video/mp4');
  assert.equal(info.isShort, false);
  assert.equal(info.directUrl, url);
});

test('Direct Supabase Storage URL with encoded spaces & query parameters', () => {
  const url = 'https://spihsvdchouynfbsotwq.supabase.co/storage/v1/object/public/storage/WhatsApp%20Video%202025-12-17%20at%207.29.00%20PM.mp4?v=123';
  const info = parseVideoUrl(url);
  assert.ok(info);
  assert.equal(info.type, 'direct');
  assert.equal(info.platform, 'supabase');
  assert.equal(info.mimeType, 'video/mp4');
  assert.equal(info.isSupabaseStorage, true);
});

test('Direct Supabase Storage Quicktime MOV file', () => {
  const url = 'https://spihsvdchouynfbsotwq.supabase.co/storage/v1/object/public/storage/tutorial.MOV';
  const info = parseVideoUrl(url);
  assert.ok(info);
  assert.equal(info.type, 'direct');
  assert.equal(info.mimeType, 'video/quicktime');
  assert.equal(info.isSupabaseStorage, true);
});

test('Direct Supabase Storage signed URL with token and portrait orientation', () => {
  const url = 'https://spihsvdchouynfbsotwq.supabase.co/storage/v1/object/sign/videos/guide.mov?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9&orientation=portrait';
  const info = parseVideoUrl(url);
  assert.ok(info);
  assert.equal(info.type, 'direct');
  assert.equal(info.platform, 'supabase');
  assert.equal(info.mimeType, 'video/quicktime');
  assert.equal(info.isShort, true);
  assert.equal(info.isSupabaseStorage, true);
});

test('Direct WebM video file with vertical aspect flag', () => {
  const url = 'https://example.com/videos/demo.webm?aspect=vertical';
  const info = parseVideoUrl(url);
  assert.ok(info);
  assert.equal(info.type, 'direct');
  assert.equal(info.mimeType, 'video/webm');
  assert.equal(info.isShort, true);
});

test('Self-hosted Supabase URL recognition', () => {
  const url = 'https://api.myserver.com/storage/v1/object/public/videos/guide.mp4';
  const info = parseVideoUrl(url);
  assert.ok(info);
  assert.equal(info.type, 'direct');
  assert.equal(info.platform, 'supabase');
  assert.equal(info.isSupabaseStorage, true);
});

test('Direct MKV, OGG, M4V video MIME mapping', () => {
  assert.equal(getVideoMimeType('https://example.com/video.mkv'), 'video/x-matroska');
  assert.equal(getVideoMimeType('https://example.com/video.ogg'), 'video/ogg');
  assert.equal(getVideoMimeType('https://example.com/video.ogv'), 'video/ogg');
  assert.equal(getVideoMimeType('https://example.com/video.m4v'), 'video/mp4');
});

// 2. YouTube Standard, Short links, Embeds, Timestamps, nocookie, HTML entities
test('YouTube Standard Watch URL with trimming & parameter normalization', () => {
  const url = '   https://www.youtube.com/watch?v=dQw4w9WgXcQ   ';
  const info = parseVideoUrl(url);
  assert.ok(info);
  assert.equal(info.type, 'youtube');
  assert.equal(info.videoId, 'dQw4w9WgXcQ');
  assert.equal(info.isShort, false);
  assert.equal(info.directUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.ok(info.embedUrl.includes('youtube-nocookie.com/embed/dQw4w9WgXcQ'));
  assert.ok(info.embedUrl.includes('autoplay=1'));
  assert.ok(info.embedUrl.includes('playsinline=1'));
});

test('YouTube Shortened youtu.be URL with complex timestamp (1m30s)', () => {
  const url = 'https://youtu.be/dQw4w9WgXcQ?t=1m30s';
  const info = parseVideoUrl(url);
  assert.ok(info);
  assert.equal(info.type, 'youtube');
  assert.equal(info.videoId, 'dQw4w9WgXcQ');
  assert.equal(info.startTime, 90);
  assert.ok(info.embedUrl.includes('start=90'));
  assert.equal(info.directUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s');
});

test('YouTube with &amp; HTML entity in query string', () => {
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&amp;t=90s';
  const info = parseVideoUrl(url);
  assert.ok(info);
  assert.equal(info.type, 'youtube');
  assert.equal(info.videoId, 'dQw4w9WgXcQ');
  assert.equal(info.startTime, 90);
});

test('YouTube Shorts vertical video link', () => {
  const url = 'https://www.youtube.com/shorts/AbCdEf12345';
  const info = parseVideoUrl(url);
  assert.ok(info);
  assert.equal(info.type, 'youtube');
  assert.equal(info.videoId, 'AbCdEf12345');
  assert.equal(info.isShort, true);
  assert.equal(info.directUrl, 'https://www.youtube.com/shorts/AbCdEf12345');
  assert.equal(info.fallbackWatchUrl, 'https://www.youtube.com/watch?v=AbCdEf12345');
  assert.ok(info.embedUrl.includes('youtube-nocookie.com/embed/AbCdEf12345'));
});

test('YouTube Shorts mobile link with query params and anchor tags', () => {
  const url = 'https://youtube.com/shorts/XYZ12345678?feature=share&si=abc123#player';
  const info = parseVideoUrl(url);
  assert.ok(info);
  assert.equal(info.type, 'youtube');
  assert.equal(info.videoId, 'XYZ12345678');
  assert.equal(info.isShort, true);
});

test('YouTube Live, Embed, and /e/ alias formats', () => {
  const liveUrl = 'https://www.youtube.com/live/LiveId12345';
  const liveInfo = parseVideoUrl(liveUrl);
  assert.ok(liveInfo);
  assert.equal(liveInfo.videoId, 'LiveId12345');

  const embedUrl = 'https://www.youtube.com/embed/EmbedId1234';
  const embedInfo = parseVideoUrl(embedUrl);
  assert.ok(embedInfo);
  assert.equal(embedInfo.videoId, 'EmbedId1234');

  const eUrl = 'https://www.youtube.com/e/EmbedId1234';
  const eInfo = parseVideoUrl(eUrl);
  assert.ok(eInfo);
  assert.equal(eInfo.videoId, 'EmbedId1234');
});

test('YouTube-nocookie domain parsing', () => {
  const embedUrl = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ';
  const embedInfo = parseVideoUrl(embedUrl);
  assert.ok(embedInfo);
  assert.equal(embedInfo.type, 'youtube');
  assert.equal(embedInfo.videoId, 'dQw4w9WgXcQ');

  const watchUrl = 'https://youtube-nocookie.com/watch?v=dQw4w9WgXcQ';
  const watchInfo = parseVideoUrl(watchUrl);
  assert.ok(watchInfo);
  assert.equal(watchInfo.type, 'youtube');
  assert.equal(watchInfo.videoId, 'dQw4w9WgXcQ');

  const shortsUrl = 'https://www.youtube-nocookie.com/shorts/dQw4w9WgXcQ';
  const shortsInfo = parseVideoUrl(shortsUrl);
  assert.ok(shortsInfo);
  assert.equal(shortsInfo.type, 'youtube');
  assert.equal(shortsInfo.videoId, 'dQw4w9WgXcQ');
  assert.equal(shortsInfo.isShort, true);
});

// 3. Vimeo Standard, Channels, Player, Showcase, Unlisted with hyphens/underscores
test('Vimeo standard URL', () => {
  const url = 'https://vimeo.com/76979871';
  const info = parseVideoUrl(url);
  assert.ok(info);
  assert.equal(info.type, 'vimeo');
  assert.equal(info.videoId, '76979871');
  assert.equal(info.directUrl, 'https://vimeo.com/76979871');
  assert.equal(info.embedUrl, 'https://player.vimeo.com/video/76979871?autoplay=1&playsinline=1&dnt=1');
});

test('Vimeo channel / group URL with trailing slash', () => {
  const url = 'https://vimeo.com/channels/staffpicks/123456789/?autoplay=0';
  const info = parseVideoUrl(url);
  assert.ok(info);
  assert.equal(info.type, 'vimeo');
  assert.equal(info.videoId, '123456789');
  assert.ok(info.embedUrl.includes('https://player.vimeo.com/video/123456789'));
});

test('Vimeo showcase and ondemand URLs', () => {
  const showcaseUrl = 'https://vimeo.com/showcase/123456/video/76979871';
  const showcaseInfo = parseVideoUrl(showcaseUrl);
  assert.ok(showcaseInfo);
  assert.equal(showcaseInfo.type, 'vimeo');
  assert.equal(showcaseInfo.videoId, '76979871');

  const ondemandUrl = 'https://vimeo.com/ondemand/filmname/76979871';
  const ondemandInfo = parseVideoUrl(ondemandUrl);
  assert.ok(ondemandInfo);
  assert.equal(ondemandInfo.type, 'vimeo');
  assert.equal(ondemandInfo.videoId, '76979871');
});

test('Vimeo unlisted video with hyphen and underscore in privacy hash', () => {
  const pathUrl = 'https://vimeo.com/123456789/abc-def_123';
  const pathInfo = parseVideoUrl(pathUrl);
  assert.ok(pathInfo);
  assert.equal(pathInfo.type, 'vimeo');
  assert.equal(pathInfo.videoId, '123456789');
  assert.equal(pathInfo.unlistedHash, 'abc-def_123');
  assert.ok(pathInfo.embedUrl.includes('h=abc-def_123'));

  const queryUrl = 'https://player.vimeo.com/video/123456789?h=abc-def_123';
  const queryInfo = parseVideoUrl(queryUrl);
  assert.ok(queryInfo);
  assert.equal(queryInfo.type, 'vimeo');
  assert.equal(queryInfo.videoId, '123456789');
  assert.equal(queryInfo.unlistedHash, 'abc-def_123');
});

test('Vimeo creator dashboard manage/videos URL', () => {
  const manageUrl = 'https://vimeo.com/manage/videos/987654321';
  const info = parseVideoUrl(manageUrl);
  assert.ok(info);
  assert.equal(info.type, 'vimeo');
  assert.equal(info.videoId, '987654321');
  assert.equal(info.directUrl, 'https://vimeo.com/987654321');
  assert.equal(info.embedUrl, 'https://player.vimeo.com/video/987654321?autoplay=1&playsinline=1&dnt=1');
});

// 4. Loom Share, Embed, and View URLs
test('Loom Share URL', () => {
  const url = 'https://www.loom.com/share/d41d8cd98f00b204e9800998ecf8427e';
  const info = parseVideoUrl(url);
  assert.ok(info);
  assert.equal(info.type, 'loom');
  assert.equal(info.videoId, 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(info.directUrl, 'https://www.loom.com/share/d41d8cd98f00b204e9800998ecf8427e');
  assert.ok(info.embedUrl.includes('https://www.loom.com/embed/d41d8cd98f00b204e9800998ecf8427e'));
  assert.ok(info.embedUrl.includes('autoplay=1'));
  assert.ok(info.embedUrl.includes('hide_owner=true'));
});

test('Loom Share URL with timestamp parameter', () => {
  const url = 'https://www.loom.com/share/d41d8cd98f00b204e9800998ecf8427e?t=75';
  const info = parseVideoUrl(url);
  assert.ok(info);
  assert.equal(info.type, 'loom');
  assert.equal(info.videoId, 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(info.startTime, 75);
  assert.equal(info.directUrl, 'https://www.loom.com/share/d41d8cd98f00b204e9800998ecf8427e?t=75');
  assert.ok(info.embedUrl.includes('&t=75'));
});

test('Loom View /v/ link', () => {
  const url = 'https://www.loom.com/v/d41d8cd98f00b204e9800998ecf8427e';
  const info = parseVideoUrl(url);
  assert.ok(info);
  assert.equal(info.type, 'loom');
  assert.equal(info.videoId, 'd41d8cd98f00b204e9800998ecf8427e');
  assert.ok(info.embedUrl.includes('https://www.loom.com/embed/d41d8cd98f00b204e9800998ecf8427e'));
});

test('Loom Direct Embed URL input with timestamp', () => {
  const url = 'https://www.loom.com/embed/d41d8cd98f00b204e9800998ecf8427e?t=45s';
  const info = parseVideoUrl(url);
  assert.ok(info);
  assert.equal(info.type, 'loom');
  assert.equal(info.videoId, 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(info.startTime, 45);
  assert.ok(info.embedUrl.includes('t=45'));
});

// 5. Edge cases, Null, Empty, Whitespace, Relative paths, Time parsing
test('YouTube URL with slash before query (watch/?v=)', () => {
  const url = 'https://www.youtube.com/watch/?v=dQw4w9WgXcQ';
  const info = parseVideoUrl(url);
  assert.ok(info);
  assert.equal(info.type, 'youtube');
  assert.equal(info.videoId, 'dQw4w9WgXcQ');
});

test('Vimeo URL with timestamp preserves #t= in directUrl', () => {
  const url = 'https://vimeo.com/76979871?t=1m30s';
  const info = parseVideoUrl(url);
  assert.ok(info);
  assert.equal(info.type, 'vimeo');
  assert.equal(info.videoId, '76979871');
  assert.equal(info.startTime, 90);
  assert.equal(info.directUrl, 'https://vimeo.com/76979871#t=90s');
  assert.ok(info.embedUrl.includes('#t=90s'));
});

test('Direct Supabase Storage video with timestamp', () => {
  const url = 'https://spihsvdchouynfbsotwq.supabase.co/storage/v1/object/public/service-videos/guide.mp4?t=45';
  const info = parseVideoUrl(url);
  assert.ok(info);
  assert.equal(info.type, 'direct');
  assert.equal(info.startTime, 45);
});

test('Relative local MP4 video file path', () => {
  const url = '/howtodeposit.mp4';
  const info = parseVideoUrl(url);
  assert.ok(info);
  assert.equal(info.type, 'direct');
  assert.equal(info.platform, 'direct');
  assert.equal(info.mimeType, 'video/mp4');
  assert.equal(info.directUrl, '/howtodeposit.mp4');
});

test('Edge cases: null, undefined, empty string, whitespace, non-strings', () => {
  assert.equal(parseVideoUrl(null), null);
  assert.equal(parseVideoUrl(undefined), null);
  assert.equal(parseVideoUrl(''), null);
  assert.equal(parseVideoUrl('   '), null);
  assert.equal(parseVideoUrl(12345), null);
  assert.equal(parseVideoUrl({}), null);
});

test('Timestamp parser helper comprehensive coverage', () => {
  assert.equal(parseTimeString('01:30:15'), 5415);
  assert.equal(parseTimeString('02:45'), 165);
  assert.equal(parseTimeString('1h30m15s'), 5415);
  assert.equal(parseTimeString('1h 30m 15s'), 5415);
  assert.equal(parseTimeString('1h 30m'), 5400);
  assert.equal(parseTimeString('2m45s'), 165);
  assert.equal(parseTimeString('45s'), 45);
  assert.equal(parseTimeString('120'), 120);
  assert.equal(parseTimeString(90), 90);
  assert.equal(parseTimeString('1h'), 3600);
  assert.equal(parseTimeString('30m'), 1800);
  assert.equal(parseTimeString('1h30m'), 5400);
  assert.equal(parseTimeString('0'), null);
  assert.equal(parseTimeString('-10'), null);
  assert.equal(parseTimeString('invalid'), null);
  assert.equal(parseTimeString(''), null);
  assert.equal(parseTimeString(null), null);
});

console.log(`\nAll ${passedTests}/${totalTests} tests passed successfully!`);

