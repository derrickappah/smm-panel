import React, { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink, Play } from 'lucide-react';

const parseVideoUrl = (rawUrl) => {
  if (!rawUrl) return null;
  const url = rawUrl.trim();

  // YouTube Shorts: https://youtube.com/shorts/VIDEO_ID
  const ytShortsMatch = url.match(/youtube\.com\/shorts\/([\w-]{11})/i);
  if (ytShortsMatch) {
    const videoId = ytShortsMatch[1];
    return {
      type: 'youtube',
      videoId,
      isShort: true,
      directUrl: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&enablejsapi=1`
    };
  }

  // YouTube all formats (youtu.be, watch?v=, embed, live, m.youtube)
  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|live\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i);
  if (ytMatch) {
    const videoId = ytMatch[1];
    return {
      type: 'youtube',
      videoId,
      isShort: false,
      directUrl: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&enablejsapi=1`
    };
  }

  // Vimeo: vimeo.com/123456789
  const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?([0-9]+)/i);
  if (vimeoMatch) {
    return {
      type: 'vimeo',
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1&playsinline=1`
    };
  }

  // Loom: loom.com/share/ID or loom.com/embed/ID
  const loomMatch = url.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9_-]+)/i);
  if (loomMatch) {
    return {
      type: 'loom',
      embedUrl: `https://www.loom.com/embed/${loomMatch[1]}?autoplay=1`
    };
  }

  // Direct video file (mp4, webm, mov, ogg, etc.)
  return {
    type: 'html5',
    url: url
  };
};

const VideoModal = ({ videoUrl, title = 'Video Guide', onClose }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef(null);

  // Prevent background scrolling on body when modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow || '';
      document.body.style.touchAction = originalTouchAction || '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const videoInfo = useMemo(() => parseVideoUrl(videoUrl), [videoUrl]);

  const handlePlayToggle = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[99999] h-[100dvh] max-h-[100dvh] w-full flex flex-col justify-between bg-black/95 backdrop-blur-md select-none overflow-hidden animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose?.();
        }
      }}
    >
      {/* Top Header - High z-index & iOS safe-area top padding */}
      <header 
        style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)' }}
        className="relative z-50 flex items-center justify-between px-4 py-3 bg-black/90 sm:bg-black/70 backdrop-blur-lg border-b border-white/10 shrink-0 w-full"
      >
        <h2 className="text-white text-sm sm:text-base font-semibold truncate pr-3 select-none">
          {title}
        </h2>
        <button
          onClick={onClose}
          type="button"
          className="w-10 h-10 flex items-center justify-center bg-white/20 hover:bg-white/30 active:bg-white/40 text-white rounded-full transition-all active:scale-90 cursor-pointer shrink-0 shadow-md"
          aria-label="Close video modal"
        >
          <X size={20} className="stroke-[2.5]" />
        </button>
      </header>

      {/* Video Player Center Area - Contained and isolated to prevent overlap */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center p-3 sm:p-6 min-h-0 w-full overflow-hidden my-auto">
        {videoInfo?.type === 'youtube' || videoInfo?.type === 'vimeo' || videoInfo?.type === 'loom' ? (
          <div className={`w-full ${videoInfo.isShort ? 'max-w-[320px] aspect-[9/16] max-h-[60dvh]' : 'max-w-3xl aspect-video max-h-[60dvh] sm:max-h-[70dvh]'} mx-auto flex flex-col items-center justify-center`}>
            <div className="relative w-full h-full rounded-2xl sm:rounded-3xl overflow-hidden bg-black shadow-2xl ring-1 ring-white/20 animate-in zoom-in-95 duration-200">
              <iframe
                src={videoInfo.embedUrl}
                title={title}
                className="absolute inset-0 w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                loading="eager"
              />
            </div>
            {videoInfo.type === 'youtube' && (
              <a
                href={videoInfo.directUrl || videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white/90 hover:text-white text-[11px] sm:text-xs font-medium rounded-full transition-all border border-white/15"
              >
                <ExternalLink size={12} />
                <span>Tap here if video is blocked by YouTube</span>
              </a>
            )}
          </div>
        ) : (
          <div className="w-full max-w-xl mx-auto flex flex-col items-center justify-center max-h-[65dvh] sm:max-h-[75dvh]">
            <div className="relative w-full max-h-[65dvh] sm:max-h-[75dvh] rounded-2xl sm:rounded-3xl overflow-hidden bg-black shadow-2xl ring-1 ring-white/20 flex items-center justify-center group">
              <video
                ref={videoRef}
                src={videoInfo?.url || videoUrl}
                controls
                playsInline
                webkit-playsinline="true"
                preload="auto"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                className="w-full max-h-[65dvh] sm:max-h-[75dvh] object-contain rounded-2xl bg-black cursor-pointer"
                onClick={handlePlayToggle}
              >
                Your browser does not support the video tag.
              </video>

              {/* Big Tap to Play Button when paused */}
              {!isPlaying && (
                <button
                  type="button"
                  onClick={handlePlayToggle}
                  className="absolute inset-0 m-auto w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-indigo-600/90 hover:bg-indigo-600 active:bg-indigo-700 text-white flex items-center justify-center shadow-2xl shadow-indigo-500/50 hover:scale-110 active:scale-90 transition-all cursor-pointer z-20 pointer-events-auto"
                  aria-label="Play video"
                >
                  <Play className="w-8 h-8 sm:w-9 sm:h-9 fill-current ml-1" />
                </button>
              )}
            </div>
          </div>
        )}
      </main>
      
      {/* Bottom Actions - High z-index & iOS safe-area bottom padding */}
      <footer 
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
        className="relative z-50 p-3 sm:p-4 bg-black/90 sm:bg-black/60 backdrop-blur-lg border-t border-white/10 flex items-center justify-center gap-3 shrink-0 w-full"
      >
        {videoUrl && (
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-white/15 hover:bg-white/25 active:bg-white/30 text-white text-xs sm:text-sm font-medium rounded-full transition-colors flex items-center gap-1.5 shadow"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open Link</span>
          </a>
        )}
        <button
          type="button"
          onClick={onClose}
          className="px-8 py-2 bg-white active:bg-gray-200 text-black text-xs sm:text-sm font-bold rounded-full transition-all shadow-lg active:scale-95 cursor-pointer"
        >
          Done
        </button>
      </footer>
    </div>,
    document.body
  );
};

export default VideoModal;
