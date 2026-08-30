import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink } from 'lucide-react';

const parseVideoUrl = (rawUrl) => {
  if (!rawUrl) return null;
  const url = rawUrl.trim();

  // YouTube Shorts: https://youtube.com/shorts/VIDEO_ID
  const ytShortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/i);
  if (ytShortsMatch) {
    return {
      type: 'youtube',
      isShort: true,
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytShortsMatch[1]}?autoplay=1&rel=0&playsinline=1`
    };
  }

  // YouTube standard watch or share: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  if (ytMatch) {
    return {
      type: 'youtube',
      isShort: false,
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?autoplay=1&rel=0&playsinline=1`
    };
  }

  // Vimeo: vimeo.com/123456789
  const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?([0-9]+)/i);
  if (vimeoMatch) {
    return {
      type: 'vimeo',
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`
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
  // Prevent scrolling on body when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const videoInfo = useMemo(() => parseVideoUrl(videoUrl), [videoUrl]);

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex flex-col bg-black/90 backdrop-blur-md animate-in fade-in duration-300"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose?.();
        }
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <h2 className="text-white text-base sm:text-lg font-semibold truncate pr-4">{title}</h2>
        <button
          onClick={onClose}
          className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors active:scale-95 cursor-pointer"
          aria-label="Close video"
        >
          <X size={22} />
        </button>
      </div>

      {/* Video Container */}
      <div className="flex-1 flex items-center justify-center p-3 sm:p-6 min-h-0 w-full">
        {videoInfo ? (
          videoInfo.type === 'youtube' || videoInfo.type === 'vimeo' || videoInfo.type === 'loom' ? (
            <div className={`relative w-full ${videoInfo.isShort ? 'max-w-[380px] aspect-[9/16] max-h-[80vh]' : 'max-w-[800px] aspect-video max-h-[80vh]'} bg-black rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/15 animate-in zoom-in-95 duration-300 flex mx-auto`}>
              <iframe
                src={videoInfo.embedUrl}
                title={title}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="relative h-full max-h-[85vh] w-full max-w-[480px] bg-black rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/15 animate-in zoom-in-95 duration-300 flex mx-auto">
              <video
                src={videoInfo.url}
                controls
                autoPlay
                className="w-full h-full object-contain"
                playsInline
              >
                Your browser does not support the video tag.
              </video>
            </div>
          )
        ) : (
          <div className="w-full max-w-[400px] aspect-video flex flex-col items-center justify-center text-white/60 bg-gray-900/80 rounded-2xl p-6 border border-white/10">
            <span className="text-4xl mb-3">🎥</span>
            <p className="text-sm font-medium">No video URL available</p>
          </div>
        )}
      </div>
      
      {/* Bottom Actions */}
      <div className="p-4 sm:p-6 flex justify-center gap-3 pb-safe">
        {videoUrl && (
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm font-medium rounded-full transition-colors flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open Source Link
          </a>
        )}
        <button
          onClick={onClose}
          className="px-8 py-2.5 bg-white text-black text-xs sm:text-sm font-bold rounded-full hover:bg-gray-100 transition-colors shadow-lg active:scale-95 cursor-pointer"
        >
          Done
        </button>
      </div>
    </div>,
    document.body
  );
};

export default VideoModal;
