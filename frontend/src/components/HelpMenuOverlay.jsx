import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Wallet, Heart, Users, Headset, MessageCircle, X } from 'lucide-react';
import VideoModal from './VideoModal';

const HelpMenuOverlay = ({ onClose, whatsappUrl }) => {
  const navigate = useNavigate();
  const [activeVideo, setActiveVideo] = useState(null); // { url: string, title: string }

  // Prevent background scrolling when menu is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleCardClick = (action) => {
    if (action.type === 'video') {
      setActiveVideo({ url: action.url, title: action.title });
    } else if (action.type === 'navigate') {
      onClose();
      navigate(action.path);
    } else if (action.type === 'whatsapp') {
      onClose();
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const cards = [
    {
      id: 'deposit',
      icon: (
        <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-inner shadow-white/20">
          <Wallet className="text-white" size={24} />
          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-yellow-400 rounded-full border-2 border-white flex items-center justify-center shadow-sm">
            <span className="text-[10px] font-bold text-yellow-800">$</span>
          </div>
        </div>
      ),
      title: 'How to add money\n(Deposit)',
      subtitle: 'Watch video',
      action: { type: 'video', url: '/howtodeposit.mp4', title: 'How to add money (Deposit)' }
    },
    {
      id: 'order',
      icon: (
        <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center shadow-inner shadow-white/20">
          <Heart className="text-white absolute -ml-3 -mt-3" size={18} fill="currentColor" />
          <Users className="text-white absolute ml-3 mt-3" size={18} />
          <div className="absolute top-1 right-1 bg-blue-500 w-4 h-4 rounded-full border border-white flex items-center justify-center">
             <span className="text-[8px] text-white">👍</span>
          </div>
        </div>
      ),
      title: 'How to buy\nlikes & followers',
      subtitle: 'Watch video',
      titleColor: 'text-gray-800',
      subtitleColor: 'text-purple-600',
      action: { type: 'video', url: '/howtogetlikes.mp4', title: 'How to buy likes & followers' }
    },
    {
      id: 'support',
      icon: (
        <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center shadow-inner shadow-white/20">
          <Headset className="text-white" size={24} />
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center shadow-sm">
             <MessageCircle className="text-white p-[2px]" size={14} fill="currentColor" />
          </div>
        </div>
      ),
      title: 'I bought likes or followers\nbut it\'s not coming',
      subtitle: 'Talk to support',
      highlightWord: 'not coming',
      action: { type: 'navigate', path: '/support' }
    },
    {
      id: 'payment',
      icon: (
        <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-green-300 to-green-500 flex items-center justify-center shadow-inner shadow-white/20">
           <img src="/rYZqPCBaG70.png" alt="WA" className="w-7 h-7 object-contain drop-shadow-md" />
        </div>
      ),
      title: 'I paid but it\'s not\nin my account',
      subtitle: 'Contact a WhatsApp agent',
      highlightWord: 'not\nin my account',
      action: { type: 'whatsapp' }
    }
  ];

  const renderTitle = (card) => {
    if (!card.highlightWord) {
      return card.title.split('\n').map((line, i) => (
        <React.Fragment key={i}>
          {line}
          {i === 0 && <br />}
        </React.Fragment>
      ));
    }

    // A simple hack to highlight specific words based on the card text
    if (card.id === 'support') {
      return (
        <>
          I bought likes or followers<br/>
          but it's <span className="text-red-500 font-semibold">not coming</span>
        </>
      );
    }
    
    if (card.id === 'payment') {
      return (
        <>
          I paid but it's <span className="text-red-500 font-semibold">not</span><br/>
          <span className="text-red-500 font-semibold">in my account</span>
        </>
      );
    }

    return card.title;
  };

  return createPortal(
    <>
      <div 
        className="fixed inset-0 z-[9000] bg-black/40 backdrop-blur-[8px] animate-in fade-in duration-300 flex flex-col pt-safe px-4 pb-10 sm:p-6"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="relative w-full max-w-sm mx-auto mt-auto mb-auto animate-in zoom-in-95 fade-in duration-300">
          
          <button
            onClick={onClose}
            className="absolute -top-12 right-0 p-2 bg-white/20 hover:bg-white/30 text-white rounded-full backdrop-blur-md transition-all active:scale-95"
          >
            <X size={20} />
          </button>
          
          <div className="grid grid-cols-2 gap-3 sm:gap-4 select-none">
            {cards.map((card, idx) => (
              <button
                key={card.id}
                onClick={() => handleCardClick(card.action)}
                className="bg-white/95 backdrop-blur-xl rounded-3xl p-4 sm:p-5 flex flex-col items-start text-left shadow-xl ring-1 ring-white hover:bg-white active:scale-95 transition-all duration-200 group"
                style={{
                  boxShadow: '0 10px 40px -10px rgba(0,0,0,0.1), inset 0px 1px 0px rgba(255,255,255,0.5)',
                  minHeight: '160px'
                }}
              >
                <div className="mb-4 transform group-hover:scale-105 transition-transform duration-300 group-hover:-rotate-3">
                  {card.icon}
                </div>
                
                <h3 className={`text-[13px] sm:text-[14px] font-bold leading-snug mb-2 ${card.titleColor || 'text-gray-800'}`}>
                  {renderTitle(card)}
                </h3>
                
                <p className={`text-[11px] sm:text-[12px] font-medium mt-auto ${card.subtitleColor || 'text-gray-500'}`}>
                  {card.subtitle}
                </p>
              </button>
            ))}
          </div>

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

export default HelpMenuOverlay;
