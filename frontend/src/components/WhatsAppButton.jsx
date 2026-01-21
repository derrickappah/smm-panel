import React, { useState, useEffect, useRef } from 'react';

const WhatsAppButton = ({ message, className = "" }) => {
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [position, setPosition] = useState(() => {
    // Always start in bottom-left corner (ignore saved position for now)
    return { x: 20, y: window.innerHeight - 80 };
  });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [hasDragged, setHasDragged] = useState(false);

  // WhatsApp support options
  const supportOptions = [
    "I am having problems with ordering",
    "I am having problems with depositing",
    "I am having problems with _________"
  ];

  // Close options menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showOptions && !buttonRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) {
        setShowOptions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showOptions]);

  // Save position to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('whatsapp-button-position', JSON.stringify(position));
  }, [position]);

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
      setShowOptions(false); // Close options when starting to drag
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
      setShowOptions(false); // Close options when starting to drag
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

  const handleWhatsAppClick = (e) => {
    // Only show options if we haven't dragged (i.e., it was just a click)
    if (!hasDragged) {
      e.preventDefault();
      setShowOptions(!showOptions);
    }
  };

  const handleOptionSelect = (option) => {
    const phoneNumber = "+233550069661"; // Ghana WhatsApp number
    const encodedMessage = encodeURIComponent(option);
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;

    // Open WhatsApp in new tab/window
    window.open(whatsappUrl, '_blank');
    setShowOptions(false);
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
      <div
        ref={buttonRef}
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          zIndex: 50,
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none' // Prevent default touch behaviors
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <button
          onClick={handleWhatsAppClick}
          className={`bg-green-500 hover:bg-green-600 text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 relative ${className}`}
          aria-label="Contact us on WhatsApp - Drag to move"
          title="Contact us on WhatsApp - Drag to reposition"
          style={{
            cursor: isDragging ? 'grabbing' : 'pointer'
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

      {/* Options Menu */}
      {showOptions && (
        <div
          ref={menuRef}
          className="fixed z-40 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden"
          style={{
            left: `${position.x}px`,
            top: position.y < 100 ? `${position.y + 80}px` : `${position.y - 160}px`, // Position below if near top, above otherwise
            minWidth: '160px',
            maxWidth: '200px'
          }}
        >
          {supportOptions.map((option, index) => (
            <button
              key={index}
              onClick={() => handleOptionSelect(option)}
              className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-green-50 hover:text-green-700 transition-colors duration-200 border-b border-gray-100 last:border-b-0 focus:outline-none focus:bg-green-50 focus:text-green-700"
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </>
  );
};

export default WhatsAppButton;