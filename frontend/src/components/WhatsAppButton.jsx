import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { X, MessageCircle, Phone } from 'lucide-react';
import HelpMenuOverlay from './HelpMenuOverlay';

const WhatsAppButton = ({ message, className = "" }) => {
  const { whatsappNumber, supportPhoneNumber } = usePaymentMethods();
  const buttonRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState(() => {
    // Always start in bottom-left corner (ignore saved position for now)
    // Shifted higher up to avoid phone button being off-screen initially
    return { x: 20, y: window.innerHeight - 160 };
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
      const maxY = window.innerHeight - (supportPhoneNumber ? 150 : 80);
      setPosition(prev => ({
        x: Math.min(prev.x, window.innerWidth - 80),
        y: Math.min(prev.y, maxY)
      }));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [supportPhoneNumber]);

  const handleMouseDown = (e) => {
    // Start dragging when clicking anywhere on the container (but not on the image or svg)
    if (!e.target.closest('img') && !e.target.closest('svg')) {
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
    // Start dragging when touching anywhere on the container (but not on the image or svg)
    if (!e.target.closest('img') && !e.target.closest('svg')) {
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
      const maxY = window.innerHeight - (supportPhoneNumber ? 150 : 80);

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
      const maxY = window.innerHeight - (supportPhoneNumber ? 150 : 80);

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

  const getCallUrl = () => {
    const number = supportPhoneNumber || "";
    const cleanNumber = number.replace(/\D/g, '');
    return `tel:${cleanNumber}`;
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
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          zIndex: 100,
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none',
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
          <HelpMenuOverlay 
            onClose={() => setShowPopup(false)} 
            whatsappUrl={getWhatsAppUrl()} 
          />
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
            height: '56px',
            animation: !hasBeenTapped ? 'pulse-glow 2s ease-in-out infinite' : 'none'
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

        {supportPhoneNumber && (
          <button
            onClick={(e) => {
              if (!hasDragged) {
                setHasBeenTapped(true);
                window.open(getCallUrl(), '_self');
              }
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 relative flex items-center justify-center"
            aria-label="Call Support"
            title="Call Support"
            style={{
              cursor: isDragging ? 'grabbing' : 'pointer',
              width: '56px',
              height: '56px'
            }}
          >
            <Phone className="w-5 h-5 select-none pointer-events-none" />
          </button>
        )}
      </div>
    </>
  );
};

export default WhatsAppButton;