import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink, Loader2, Play, RotateCcw, AlertTriangle, Copy, Check, Tv } from 'lucide-react';
import { parseVideoUrl } from '@/lib/videoUtils';

const VideoModal = ({ videoUrl, title = 'Video Guide', onClose }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false);
  const [isPortraitVideo, setIsPortraitVideo] = useState(false);
  const [copied, setCopied] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const videoRef = useRef(null);
  const isMountedRef = useRef(true);

  const videoInfo = useMemo(() => parseVideoUrl(videoUrl), [videoUrl]);

  // Lock body scroll and handle keyboard shortcuts
  useEffect(() => {
    isMountedRef.current = true;
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
      isMountedRef.current = false;
      document.body.style.overflow = originalOverflow || '';
      document.body.style.touchAction = originalTouchAction || '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Reset state whenever videoUrl changes
  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
    setErrorMessage('');
    setIsAutoplayBlocked(false);
    setIsPortraitVideo(false);
    setCopied(false);
  }, [videoUrl, retryKey]);

  // Attempt safe play on direct video
  const safePlay = useCallback(async () => {
    if (!videoRef.current || videoInfo?.type !== 'direct') return;
    try {
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        await playPromise;
        if (isMountedRef.current) {
          setIsAutoplayBlocked(false);
          setIsLoading(false);
        }
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      if (err.name === 'NotAllowedError') {
        // Autoplay with audio was prevented by browser policy
        setIsAutoplayBlocked(true);
        setIsLoading(false);
      } else if (err.name !== 'AbortError') {
        console.warn('Video safePlay error:', err);
      }
    }
  }, [videoInfo]);

  // Handle direct video error
  const handleVideoError = (e) => {
    if (!isMountedRef.current) return;
    console.warn('Video element error event:', e);
    const mediaError = videoRef.current?.error;
    let msg = 'Unable to play this video stream directly on this browser.';
    if (mediaError) {
      if (mediaError.code === 1) {
        msg = 'Video playback was aborted by the browser.';
      } else if (mediaError.code === 2) {
        msg = 'Network connection interrupted during video streaming.';
      } else if (mediaError.code === 3) {
        msg = 'Media decode error encountered while streaming this format.';
      } else if (mediaError.code === 4) {
        msg = 'Format or codec not natively supported by this browser engine.';
      }
    }
    setErrorMessage(msg);
    setHasError(true);
    setIsLoading(false);
  };

  const handleRetry = () => {
    setHasError(false);
    setIsLoading(true);
    setIsPortraitVideo(false);
    setRetryKey((prev) => prev + 1);
    if (videoRef.current) {
      videoRef.current.load();
      safePlay();
    }
  };

  const getAbsoluteUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//') || url.startsWith('blob:') || url.startsWith('data:')) {
      return url;
    }
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
    }
    return url;
  };

  const handleCopyLink = async () => {
    const rawLink = videoInfo?.directUrl || videoUrl;
    if (!rawLink) return;
    const directUrl = getAbsoluteUrl(rawLink);
    try {
      await navigator.clipboard.writeText(directUrl);
      setCopied(true);
      setTimeout(() => {
        if (isMountedRef.current) setCopied(false);
      }, 2000);
    } catch {
      // Fallback if clipboard API unavailable
      const textArea = document.createElement('textarea');
      textArea.value = directUrl;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => {
          if (isMountedRef.current) setCopied(false);
        }, 2000);
      } catch {
        // ignore
      }
      document.body.removeChild(textArea);
    }
  };

  const fallbackLink = videoInfo?.directUrl || videoUrl;
  const isDirect = videoInfo?.type === 'direct';
  const isShort = videoInfo?.isShort || isPortraitVideo;

  return createPortal(
    <div 
      className="fixed inset-0 z-[99999] h-[100dvh] max-h-[100dvh] w-full flex flex-col justify-between bg-black/95 backdrop-blur-md select-none overflow-hidden animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose?.();
        }
      }}
    >
      {/* Top Header - Safe Area compliant */}
      <header 
        style={{ 
          paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
          paddingLeft: 'max(env(safe-area-inset-left, 0px), 16px)',
          paddingRight: 'max(env(safe-area-inset-right, 0px), 16px)'
        }}
        className="relative z-50 flex items-center justify-between py-3 px-4 bg-black/90 sm:bg-black/75 backdrop-blur-lg border-b border-white/10 shrink-0 w-full"
      >
        <div className="flex items-center gap-2.5 min-w-0 pr-3">
          <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0 text-indigo-400">
            <Tv size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-white text-sm sm:text-base font-semibold truncate select-none leading-tight">
              {title}
            </h2>
            {videoInfo?.platformBadge && (
              <span className="text-[10px] text-gray-400 font-medium">
                {videoInfo.platformBadge}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={onClose}
          type="button"
          className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center bg-white/15 hover:bg-white/25 active:bg-white/40 text-white rounded-full transition-all active:scale-90 cursor-pointer shrink-0 shadow-lg border border-white/10"
          aria-label="Close video modal"
        >
          <X size={20} className="stroke-[2.5]" />
        </button>
      </header>

      {/* Video Player Center Area */}
      <main 
        style={{
          paddingLeft: 'max(env(safe-area-inset-left, 0px), 12px)',
          paddingRight: 'max(env(safe-area-inset-right, 0px), 12px)'
        }}
        className="relative z-10 flex-1 min-h-0 flex flex-col items-center p-3 sm:p-5 w-full overflow-y-auto overflow-x-hidden"
      >
        <div className={`w-full m-auto ${isShort ? 'max-w-[min(340px,calc(68dvh*9/16))] sm:max-w-[min(380px,calc(78dvh*9/16))]' : 'max-w-[min(56rem,calc(65dvh*16/9))] sm:max-w-[min(56rem,calc(75dvh*16/9))]'} flex flex-col items-center justify-center transition-all duration-200`}>
          
          <div className={`relative w-full ${isShort ? 'aspect-[9/16] max-h-[68dvh] sm:max-h-[78dvh]' : 'aspect-video max-h-[65dvh] sm:max-h-[75dvh]'} rounded-2xl sm:rounded-3xl overflow-hidden bg-black shadow-2xl ring-1 ring-white/20 flex items-center justify-center animate-in zoom-in-95 duration-200`}>
            
            {/* Missing or Invalid Video URL State */}
            {!videoInfo ? (
              <div className="flex flex-col items-center justify-center p-6 text-center text-white max-w-md mx-auto animate-in fade-in duration-200">
                <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-3">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold mb-1 text-white">No Video Available</p>
                <p className="text-xs text-gray-300 mb-4 leading-relaxed">
                  No valid video source or link was provided for this guide.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] px-6 py-2 bg-white hover:bg-gray-100 text-black text-xs font-bold rounded-full transition-all cursor-pointer shadow-md active:scale-95"
                >
                  Close
                </button>
              </div>
            ) : isDirect ? (
              /* Direct Video File (Supabase Storage, MP4, MOV, WebM, etc.) */
              <>
                {/* Loading buffering indicator */}
                {isLoading && !hasError && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs gap-2 text-white pointer-events-none transition-opacity duration-200">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                    <span className="text-xs text-white/90 font-medium">Loading video guide...</span>
                  </div>
                )}

                {/* Autoplay Blocked Tap-to-Play Overlay */}
                {isAutoplayBlocked && !hasError && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAutoplayBlocked(false);
                      if (videoRef.current) {
                        const p = videoRef.current.play();
                        if (p !== undefined) {
                          p.catch((err) => {
                            if (err.name !== 'AbortError') {
                              console.warn('Video safePlay error on tap:', err);
                            }
                          });
                        }
                      }
                    }}
                    className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/50 backdrop-blur-xs gap-3 text-white cursor-pointer group"
                    aria-label="Tap to play video"
                  >
                    <div className="w-16 h-16 rounded-full bg-indigo-600 group-hover:bg-indigo-500 group-active:scale-95 flex items-center justify-center shadow-xl shadow-indigo-500/40 transition-all">
                      <Play className="w-8 h-8 fill-current translate-x-0.5" />
                    </div>
                    <span className="text-xs sm:text-sm font-semibold tracking-wide bg-black/60 px-3.5 py-1 rounded-full border border-white/20">
                      Tap to Play
                    </span>
                  </button>
                )}

                {/* Media Error State with retry & fallback */}
                {hasError ? (
                  <div className="flex flex-col items-center justify-center p-6 text-center text-white max-w-md mx-auto animate-in fade-in duration-200">
                    <div className="w-12 h-12 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 mb-3">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-semibold mb-1 text-white">Playback Error</p>
                    <p className="text-xs text-gray-300 mb-4 leading-relaxed">
                      {errorMessage || 'Video stream could not be loaded on this browser.'}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2.5">
                      <button
                        type="button"
                        onClick={handleRetry}
                        className="min-h-[44px] px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                      >
                        <RotateCcw size={13} />
                        <span>Retry</span>
                      </button>
                      {fallbackLink && (
                        <a
                          href={getAbsoluteUrl(fallbackLink)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[44px] px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-lg transition-all active:scale-95 cursor-pointer"
                        >
                          <ExternalLink size={13} />
                          <span>Open in External Tab</span>
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <video
                    key={`${videoUrl}-${retryKey}`}
                    ref={videoRef}
                    playsInline
                    webkit-playsinline="true"
                    x5-playsinline="true"
                    preload="auto"
                    controls
                    controlsList="nodownload"
                    className="w-full h-full max-h-[68dvh] sm:max-h-[78dvh] object-contain bg-black"
                    onLoadStart={() => setIsLoading(true)}
                    onLoadedMetadata={(e) => {
                      setIsLoading(false);
                      if (e.currentTarget.videoHeight > e.currentTarget.videoWidth) {
                        setIsPortraitVideo(true);
                      }
                      if (videoInfo?.startTime && e.currentTarget.currentTime < videoInfo.startTime) {
                        try {
                          e.currentTarget.currentTime = videoInfo.startTime;
                        } catch (err) {
                          console.warn('Could not seek to startTime:', err);
                        }
                      }
                      safePlay();
                    }}
                    onCanPlay={(e) => {
                      setIsLoading(false);
                      if (e.currentTarget.videoHeight > e.currentTarget.videoWidth) {
                        setIsPortraitVideo(true);
                      }
                    }}
                    onWaiting={() => setIsLoading(true)}
                    onPlaying={() => {
                      setIsLoading(false);
                      setIsAutoplayBlocked(false);
                    }}
                    onError={handleVideoError}
                  >
                    <source 
                      src={videoInfo?.url || videoUrl} 
                      type={videoInfo?.mimeType || 'video/mp4'} 
                    />
                    <source 
                      src={videoInfo?.url || videoUrl} 
                    />
                    Your browser does not support HTML5 video streaming.
                  </video>
                )}
              </>
            ) : (
              /* External Embed (YouTube standard & shorts, Vimeo, Loom) */
              <iframe
                key={videoInfo?.embedUrl}
                src={videoInfo?.embedUrl}
                title={title}
                className="absolute inset-0 w-full h-full border-0 bg-black"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                loading="eager"
              />
            )}
          </div>

          {/* Embed Fallback Tap-Through Link (for YouTube / Vimeo / Loom) */}
          {!isDirect && videoInfo && (
            <div className="mt-2.5 flex items-center justify-center w-full">
              <a
                href={getAbsoluteUrl(videoInfo.directUrl || fallbackLink)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white/90 hover:text-white text-xs font-medium rounded-full transition-all border border-white/15 active:scale-95 shadow-sm min-h-[44px]"
              >
                <ExternalLink size={13} />
                <span>
                  Tap here if video is blocked by {videoInfo.platformName || 'provider'}
                </span>
              </a>
            </div>
          )}
        </div>
      </main>
      
      {/* Bottom Actions Footer - Safe Area compliant */}
      <footer 
        style={{ 
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 14px)',
          paddingLeft: 'max(env(safe-area-inset-left, 0px), 16px)',
          paddingRight: 'max(env(safe-area-inset-right, 0px), 16px)'
        }}
        className="relative z-50 p-3 sm:p-4 bg-black/90 sm:bg-black/75 backdrop-blur-lg border-t border-white/10 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 shrink-0 w-full"
      >
        {fallbackLink && (
          <a
            href={getAbsoluteUrl(fallbackLink)}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] px-4 py-2 bg-white/15 hover:bg-white/25 active:bg-white/35 text-white text-xs sm:text-sm font-medium rounded-full transition-all flex items-center gap-1.5 shadow border border-white/10 active:scale-95 cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open in New Tab</span>
          </a>
        )}

        {fallbackLink && (
          <button
            type="button"
            onClick={handleCopyLink}
            className="min-h-[44px] px-4 py-2 bg-white/15 hover:bg-white/25 active:bg-white/35 text-white text-xs sm:text-sm font-medium rounded-full transition-all flex items-center gap-1.5 shadow border border-white/10 active:scale-95 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-400" />
                <span className="text-green-300 font-semibold">Link Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Link</span>
              </>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="min-h-[44px] px-8 py-2 bg-white hover:bg-gray-100 active:bg-gray-200 text-black text-xs sm:text-sm font-bold rounded-full transition-all shadow-lg active:scale-95 cursor-pointer"
        >
          Done
        </button>
      </footer>
    </div>,
    document.body
  );
};

export default VideoModal;

