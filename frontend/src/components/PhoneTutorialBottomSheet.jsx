import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Heart, Users, Wallet, ChevronRight } from 'lucide-react';
import VideoModal from './VideoModal';
import { trackMetaEvent } from '@/lib/metaPixel';

const PhoneTutorialBottomSheet = ({ onClose }) => {
  const [activeVideo, setActiveVideo] = useState(null);

  // Prevent background scrolling when menu is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const handleAction = (item) => {
    trackMetaEvent('ViewContent', { content_name: item.modalTitle, content_category: 'Phone Guide Video' });
    setActiveVideo({ url: item.videoUrl, title: item.modalTitle });
  };

  const menuItems = [
    {
      id: 'likes',
      icon: <Heart className="w-6 h-6 text-[#ff3b6c]" strokeWidth={2} />,
      iconBg: 'bg-[#fff0f3]',
      titlePrefix: 'I want to ',
      highlightText: 'buy likes',
      highlightColor: 'text-[#ff3b6c]',
      titleSuffix: '',
      subtitle: 'Get real likes for your TikTok videos.',
      chevronColor: 'text-[#ff3b6c]',
      borderColor: 'border-pink-100 hover:border-pink-300',
      videoUrl: '/likes-and-views.mp4',
      modalTitle: 'How to Buy Likes'
    },
    {
      id: 'followers',
      icon: <Users className="w-6 h-6 text-[#2563eb]" strokeWidth={2} />,
      iconBg: 'bg-[#eff6ff]',
      titlePrefix: 'I want to ',
      highlightText: 'buy followers',
      highlightColor: 'text-[#2563eb]',
      titleSuffix: '',
      subtitle: 'Grow your followers and get noticed.',
      chevronColor: 'text-[#2563eb]',
      borderColor: 'border-blue-100 hover:border-blue-300',
      videoUrl: '/followers.mp4',
      modalTitle: 'How to Buy Followers'
    },
    {
      id: 'deposit',
      icon: <Wallet className="w-6 h-6 text-[#16a34a]" strokeWidth={2} />,
      iconBg: 'bg-[#f0fdf4]',
      titlePrefix: 'I want to ',
      highlightText: 'add money',
      highlightColor: 'text-[#16a34a]',
      titleSuffix: ' to my account',
      subtitle: 'Add balance to your account easily.',
      chevronColor: 'text-[#16a34a]',
      borderColor: 'border-emerald-100 hover:border-emerald-300',
      videoUrl: '/deposit.mp4',
      modalTitle: 'How to Add Money (Deposit)'
    }
  ];

  return createPortal(
    <>
      <div 
        className="fixed inset-0 z-[9000] bg-black/50 backdrop-blur-xs flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 animate-in fade-in duration-200"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div 
          className="w-full max-w-md bg-white rounded-t-[28px] sm:rounded-[28px] p-4 sm:p-5 pt-3 pb-8 sm:pb-6 shadow-2xl animate-in slide-in-from-bottom-6 duration-300 select-none"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top handle bar */}
          <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-4 mt-1" />

          {/* Action Cards */}
          <div className="flex flex-col gap-3">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleAction(item)}
                className={`w-full bg-white rounded-2xl border ${item.borderColor} p-3.5 sm:p-4 flex items-center justify-between text-left hover:bg-gray-50/70 active:scale-[0.99] transition-all duration-150 cursor-pointer shadow-xs group`}
              >
                {/* Left circular icon */}
                <div className={`w-12 h-12 rounded-full ${item.iconBg} flex items-center justify-center shrink-0 mr-3.5 transition-transform duration-200 group-hover:scale-105`}>
                  {item.icon}
                </div>

                {/* Text Content */}
                <div className="flex-1 min-w-0 pr-2">
                  <p className="text-[14px] sm:text-[15px] font-semibold text-gray-900 leading-snug">
                    {item.titlePrefix}
                    <span className={`${item.highlightColor} font-bold`}>
                      {item.highlightText}
                    </span>
                    {item.titleSuffix}
                  </p>
                  <p className="text-[12px] sm:text-[13px] text-gray-500 mt-0.5 font-normal truncate">
                    {item.subtitle}
                  </p>
                </div>

                {/* Right Arrow Chevron */}
                <ChevronRight className={`w-5 h-5 ${item.chevronColor} shrink-0 transition-transform duration-200 group-hover:translate-x-0.5`} strokeWidth={2.2} />
              </button>
            ))}
          </div>

          {/* Cancel button */}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 mt-3.5 bg-[#f3f4f6] hover:bg-gray-200 active:bg-gray-300 text-gray-800 font-bold rounded-2xl transition-all text-center text-sm sm:text-base cursor-pointer shadow-xs active:scale-[0.99]"
          >
            Cancel
          </button>
        </div>
      </div>

      {activeVideo && (
        <VideoModal
          videoUrl={activeVideo.url}
          title={activeVideo.title}
          onClose={() => setActiveVideo(null)}
        />
      )}
    </>,
    document.body
  );
};

export default PhoneTutorialBottomSheet;
