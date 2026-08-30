import React, { useState } from 'react';
import { ChevronRight, Video } from 'lucide-react';
import VideoModal from '@/components/VideoModal';

const ServiceVideoGuideCard = ({ 
  videoUrl, 
  title = 'Watch Video Guide', 
  serviceName = '',
  subtitle = 'Tap to watch and learn how it works',
  badgeText = "Highly recommended if you don't understand",
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!videoUrl) return null;

  const modalTitle = serviceName ? `${title} - ${serviceName}` : title;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(true);
          }
        }}
        className={`group my-3 p-3.5 sm:p-4 rounded-2xl bg-[#f5f0ff] hover:bg-[#ede4ff] border border-purple-200/90 hover:border-purple-300 transition-all duration-200 cursor-pointer shadow-sm active:scale-[0.99] text-left select-none ${className}`}
      >
        <div className="flex items-center gap-3.5">
          {/* Purple circular/rounded badge with clapperboard/film & play icon */}
          <div className="relative shrink-0 w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-300/40 group-hover:scale-105 transition-transform duration-200">
            <svg
              className="w-7 h-7 sm:w-8 sm:h-8 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="4" width="20" height="16" rx="3" />
              <path d="M2 9.5h20" />
              <path d="m6 4 2.5 5.5" />
              <path d="m11 4 2.5 5.5" />
              <path d="m16 4 2.5 5.5" />
              <polygon points="10 12.5 15 15.5 10 18.5 10 12.5" fill="currentColor" stroke="none" />
            </svg>
          </div>

          <div className="flex-1 min-w-0 pr-1">
            <div className="flex items-center justify-between gap-1">
              <h4 className="text-[15px] sm:text-base font-bold text-indigo-950 tracking-tight truncate group-hover:text-indigo-600 transition-colors">
                {title}
              </h4>
              <ChevronRight className="w-5 h-5 text-indigo-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>
            <p className="text-xs sm:text-[13px] text-gray-600 font-medium truncate mt-0.5">
              {subtitle}
            </p>
          </div>
        </div>

        {/* Footer recommendation note matching screenshot */}
        {badgeText && (
          <div className="flex items-center gap-1.5 pt-2.5 mt-2.5 border-t border-purple-100/90 text-xs font-semibold text-indigo-600">
            <Video className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span className="truncate">{badgeText}</span>
          </div>
        )}
      </div>

      {isOpen && (
        <VideoModal
          videoUrl={videoUrl}
          title={modalTitle}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
};

export default ServiceVideoGuideCard;
