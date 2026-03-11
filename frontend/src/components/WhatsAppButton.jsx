import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { X, MessageCircle } from 'lucide-react';

const WhatsAppButton = ({ message, className = "" }) => {
  const buttonRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState(() => {
    // Always start in bottom-left corner (ignore saved position for now)
    return { x: 20, y: window.innerHeight - 80 };
  });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hasDragged, setHasDragged] = useState(false);
  const navigate = useNavigate();
  const [showPopup, setShowPopup] = useState(false);
  const [hasBeenTapped, setHasBeenTapped] = useState(() => {
    // Check localStorage to see if user has already tapped the button
    return localStorage.getItem('whatsapp-button-tapped') === 'true';
  });


  // Save position to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('whatsapp-button-position', JSON.stringify(position));
  }, [position]);

  // Save tapped state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('whatsapp-button-tapped', hasBeenTapped.toString());
  }, [hasBeenTapped]);

  // Update position when window resizes
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({
        x: Math.min(prev.x, window.innerWidth - 80),
        y: Math.min(prev.y, window.innerHeight - 80)
      }));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMouseDown = (e) => {
    // Start dragging when clicking anywhere on the container (but not on the image)
    if (!e.target.closest('img')) {
      setIsDragging(true);
      setHasDragged(false);
      setHasBeenTapped(true); // Stop pulsing when dragged
      const rect = buttonRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      e.preventDefault();
    }
  };

  const handleTouchStart = (e) => {
    // Start dragging when touching anywhere on the container (but not on the image)
    if (!e.target.closest('img')) {
      setIsDragging(true);
      setHasDragged(false);
      setHasBeenTapped(true); // Stop pulsing when dragged
      const rect = buttonRef.current.getBoundingClientRect();
      const touch = e.touches[0];
      setDragOffset({
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setHasDragged(true);
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;

      // Keep button within viewport bounds
      const maxX = window.innerWidth - 80;
      const maxY = window.innerHeight - 80;

      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    }
  };

  const handleTouchMove = (e) => {
    if (isDragging) {
      setHasDragged(true);
      const touch = e.touches[0];
      const newX = touch.clientX - dragOffset.x;
      const newY = touch.clientY - dragOffset.y;

      // Keep button within viewport bounds
      const maxX = window.innerWidth - 80;
      const maxY = window.innerHeight - 80;

      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
      e.preventDefault();
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const { whatsappNumber } = usePaymentMethods();
  const [isTikTok, setIsTikTok] = useState(false);

  useEffect(() => {
    const isTikTokBrowser = /TikTok/i.test(navigator.userAgent);
    setIsTikTok(isTikTokBrowser);
  }, []);

  const getWhatsAppUrl = () => {
    const number = whatsappNumber || "";
    // Format: https://wa.me/233XXXXXXXXX (no +, no spaces)
    const cleanNumber = number.replace(/\D/g, '');
    const finalNumber = cleanNumber.startsWith('0') ? cleanNumber.substring(1) : cleanNumber;
    return `https://wa.me/233${finalNumber}`;
  };

  // Add global mouse and touch event listeners when dragging
  useEffect(() => {
    if (isDragging) {
      // Mouse events
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      // Touch events
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);

      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    } else {
      // Mouse events
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      // Touch events
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);

      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      // Mouse events
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      // Touch events
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);

      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  return (
    <>
      {/* CSS for pulsing glow animation */}
      <style>
        {`
          @keyframes pulse-glow {
            0% {
              box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
            }
            50% {
              box-shadow: 0 0 0 10px rgba(239, 68, 68, 0);
            }
            100% {
              box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
            }
          }
        `}
      </style>

      <div
        ref={buttonRef}
        className={!hasBeenTapped ? 'animate-pulse' : ''}
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          zIndex: 100,
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          animation: !hasBeenTapped ? 'pulse-glow 2s ease-in-out infinite' : 'none',
          borderRadius: '50%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px'
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        {/* WhatsApp Popup */}
        {showPopup && (
          <div
            className="absolute bottom-full mb-4 w-[320px] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300"
            style={{
              left: position.x > window.innerWidth / 2 ? 'auto' : '0',
              right: position.x > window.innerWidth / 2 ? '0' : 'auto',
              background: 'rgba(255, 255, 255, 0.95)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              zIndex: 101
            }}
          >
            {/* Header */}
            <div className="bg-[#25D366] p-4 text-white relative">
              <div className="flex items-center gap-3">
                <div className="bg-white p-2 rounded-full flex items-center justify-center shadow-sm">
                  <img
                    src="/rYZqPCBaG70.png"
                    alt="WA"
                    className="w-5 h-5 object-contain"
                  />
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-tight">Start a Conversation</h3>
                  <p className="text-xs font-light opacity-90">Click one of our members below to chat</p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPopup(false);
                }}
                className="absolute top-4 right-4 p-1 hover:bg-black/10 rounded-full transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Support List */}
            <div className="p-3 space-y-2 bg-white">
              {[
                {
                  title: "Order & Boost Issues",
                  subtitle: "Live Agent",
                  avatar: "/images.jpg"
                },
                {
                  title: "Payment Support",
                  subtitle: "Payment Admin",
                  avatar: "/avatar_user_2_1771801048478.png"
                },
                {
                  title: "General Support",
                  subtitle: "Live Agent",
                  avatar: "/download (1).jpg"
                }
              ].map((item, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.title === "Payment Support") {
                      window.open(getWhatsAppUrl(), '_blank', 'noopener');
                    } else {
                      navigate('/support');
                    }
                    setShowPopup(false);
                  }}
                  className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-green-50/50 transition-all duration-200 group text-left border border-transparent hover:border-green-100"
                >
                  <div className="relative">
                    <img
                      src={item.avatar}
                      alt={item.title}
                      className="w-14 h-14 rounded-full border-2 border-gray-50 object-cover shadow-sm group-hover:border-green-200 transition-colors"
                    />
                    <div className="absolute bottom-1 right-1 w-3.5 h-3.5 bg-green-500 border-2 border-white rounded-full"></div>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-800 text-sm group-hover:text-green-700 transition-colors">
                      {item.title}
                    </h4>
                    <p className="text-xs text-gray-400 italic font-medium leading-relaxed">{item.subtitle}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Fallback Message for TikTok WebView */}
        {isTikTok && (
          <div
            className="bg-black/80 text-white text-[10px] py-1 px-2 rounded-md whitespace-nowrap pointer-events-none select-none"
            style={{
              transform: 'translateY(-4px)',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}
          >
            If WhatsApp does not open, tap the three dots (•••) <br />
            in the top right and choose ‘Open in browser’.
          </div>
        )}

        <button
          onClick={(e) => {
            if (!hasDragged) {
              setHasBeenTapped(true);
              setShowPopup(!showPopup);
            }
          }}
          className={`bg-green-500 hover:bg-green-600 text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 relative flex items-center justify-center ${className}`}
          aria-label="Chat on WhatsApp"
          title="Chat on WhatsApp"
          style={{
            cursor: isDragging ? 'grabbing' : 'pointer',
            width: '56px',
            height: '56px'
          }}
        >
          <img
            src="/rYZqPCBaG70.png"
            alt="WhatsApp"
            className="w-6 h-6 select-none pointer-events-none"
            draggable={false}
          />

          {/* Notification Indicator */}
          <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-md border-2 border-white">
            <span className="text-[10px] leading-none">!</span>
          </div>
        </button>
      </div>
    </>
  );
};

export default WhatsAppButton;