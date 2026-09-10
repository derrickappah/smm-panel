import React, { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAnnouncement, DEFAULT_ANNOUNCEMENT } from '@/hooks/useAnnouncement';

const THEME_STYLES = {
  navy: 'bg-[#061727] text-white border-y border-[#0d2a45]',
  emerald: 'bg-[#062c1e] text-emerald-100 border-y border-[#0a4630]',
  amber: 'bg-[#2a1705] text-amber-200 border-y border-[#48280a]',
  crimson: 'bg-[#2a0808] text-rose-100 border-y border-[#481212]',
};

const SPEED_SETTINGS = {
  slow: 35,   // seconds for full track
  normal: 22,
  fast: 14,
};

const AnnouncementBar = () => {
  const location = useLocation();
  const { data: announcement = DEFAULT_ANNOUNCEMENT } = useAnnouncement();

  const isVisible = useMemo(() => {
    if (!announcement || announcement.enabled === false) return false;
    
    // Support page should be clean without announcement distractions if needed, or follow display_scope
    if (location.pathname === '/support') return false;

    if (announcement.display_scope === 'dashboard') {
      return location.pathname === '/dashboard';
    }

    // 'all' scope: show on all authenticated and main app pages
    return true;
  }, [announcement, location.pathname]);

  if (!isVisible) {
    return null;
  }

  const messageText = (announcement.message || DEFAULT_ANNOUNCEMENT.message).trim();
  const themeClass = THEME_STYLES[announcement.theme] || THEME_STYLES.navy;
  const animDuration = SPEED_SETTINGS[announcement.speed] || SPEED_SETTINGS.normal;

  // We repeat the message multiple times to ensure continuous fill on wide monitors
  const items = [messageText, messageText, messageText, messageText];

  return (
    <div
      className={`w-full overflow-hidden shadow-sm relative z-40 select-none pointer-events-auto ${themeClass}`}
      role="region"
      aria-label="Announcement banner"
    >
      <div className="relative flex items-center h-8 sm:h-9 overflow-hidden">
        {/* Continuous ticker track */}
        <div 
          className="announcement-marquee flex items-center whitespace-nowrap will-change-transform"
          style={{
            animationDuration: `${animDuration}s`,
          }}
        >
          {/* First set of items */}
          <div className="flex items-center flex-shrink-0">
            {items.map((item, idx) => (
              <div key={`track-a-${idx}`} className="flex items-center">
                <span className="mx-6 sm:mx-10 text-xs sm:text-sm font-bold uppercase tracking-wider">
                  {item}
                </span>
                <span className="opacity-40 text-xs font-bold select-none">•</span>
              </div>
            ))}
          </div>

          {/* Second duplicate set for seamless infinite loop */}
          <div className="flex items-center flex-shrink-0" aria-hidden="true">
            {items.map((item, idx) => (
              <div key={`track-b-${idx}`} className="flex items-center">
                <span className="mx-6 sm:mx-10 text-xs sm:text-sm font-bold uppercase tracking-wider">
                  {item}
                </span>
                <span className="opacity-40 text-xs font-bold select-none">•</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes announcement-scroll {
          0% {
            transform: translate3d(0, 0, 0);
          }
          100% {
            transform: translate3d(-50%, 0, 0);
          }
        }
        .announcement-marquee {
          display: flex;
          width: max-content;
          animation-name: announcement-scroll;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        .announcement-marquee:hover,
        .announcement-marquee:active {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
};

export default AnnouncementBar;
