import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const VideoModal = ({ videoUrl, title, onClose }) => {
  // Prevent scrolling on body when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <h2 className="text-white text-lg font-semibold truncate pr-4">{title}</h2>
        <button
          onClick={onClose}
          className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors active:scale-95"
          aria-label="Close video"
        >
          <X size={24} />
        </button>
      </div>

      {/* Video Container */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 min-h-0 w-full">
        <div className="relative h-full max-h-[85vh] w-full max-w-[400px] bg-black rounded-3xl overflow-hidden shadow-2xl ring-1 ring-[rgba(255,255,255,0.15)] animate-in zoom-in-95 duration-300 flex mx-auto">
          {videoUrl ? (
            <video
              src={videoUrl}
              controls
              autoPlay
              className="w-full h-full object-contain"
              playsInline
            >
              Your browser does not support the video tag.
            </video>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-white/50 bg-gray-900 rounded-lg">
              <span className="text-4xl mb-4">🎥</span>
              <p>Video coming soon</p>
              <p className="text-sm mt-2 opacity-75">(Placeholder for {title})</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Bottom Actions */}
      <div className="p-6 md:p-8 flex justify-center pb-safe">
        <button
          onClick={onClose}
          className="px-8 py-3 bg-white text-black font-semibold rounded-full hover:bg-gray-100 transition-colors shadow-lg active:scale-95"
        >
          Done
        </button>
      </div>
    </div>,
    document.body
  );
};

export default VideoModal;
