import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';

const FILLER_MESSAGES = [
  '🚀 Deposit today and unlock free TikTok likes!',
  '⭐ Get free views just by depositing daily!',
  '🎯 Grow your TikTok with BoostUp GH rewards!',
  '💥 Claim your daily bonus — it\'s completely free!',
  '🌟 New users: deposit once and start earning rewards!',
  '🎁 Hundreds of users claim daily bonuses every day!',
  '🔥 Top up your balance and claim free engagement!',
  '✅ Safe, fast and real — BoostUp GH delivers!',
];

const AnnouncementBar = () => {
  const [messages, setMessages] = useState(FILLER_MESSAGES);
  const trackRef = useRef(null);

  useEffect(() => {
    const fetchRecentClaims = async () => {
      try {
        const { data, error } = await supabase
          .from('daily_reward_claims')
          .select(`id, reward_type, reward_amount, created_at, profiles!inner(name)`)
          .order('created_at', { ascending: false })
          .limit(20);

        if (!error && data && data.length > 0) {
          const claimMessages = data.map((claim) => {
            const name = claim.profiles?.name || 'Someone';
            const amount = claim.reward_amount
              ? parseInt(claim.reward_amount).toLocaleString()
              : null;
            const type = claim.reward_type === 'views' ? 'TikTok views' : 'TikTok likes';
            return amount
              ? `🎉 ${name} just claimed free ${amount} ${type}!`
              : `🎁 ${name} just claimed their daily bonus!`;
          });

          // Always pad with fillers so we have at least 12 unique items
          const combined = [...claimMessages];
          let i = 0;
          while (combined.length < 12) {
            combined.push(FILLER_MESSAGES[i % FILLER_MESSAGES.length]);
            i++;
          }
          setMessages(combined);
        }
      } catch (_) {
        // Keep filler messages on error
      }
    };

    fetchRecentClaims();
    const interval = setInterval(fetchRecentClaims, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // The key to a seamless loop:
  // Render messages TWICE side-by-side, then animate by exactly HALF the total width.
  // When the first copy scrolls fully off screen, the animation resets to 0 — which
  // looks identical because the second copy has now taken the first copy's position.
  const doubled = [...messages, ...messages];

  // Speed: pixels per second. Higher = faster.
  const PX_PER_SECOND = 80;

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    // Wait for the DOM to paint so we can measure actual pixel widths
    const raf = requestAnimationFrame(() => {
      const halfWidth = track.scrollWidth / 2;
      const duration = halfWidth / PX_PER_SECOND;

      track.style.setProperty('--marquee-half', `-${halfWidth}px`);
      track.style.setProperty('--marquee-duration', `${duration}s`);
    });

    return () => cancelAnimationFrame(raf);
  }, [messages]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-2">
      <div className="w-full bg-indigo-600 text-white overflow-hidden py-1.5 md:py-2 rounded-lg shadow-md border border-indigo-500">
        <div
          ref={trackRef}
          className="marquee-ticker flex whitespace-nowrap"
        >
          {doubled.map((message, index) => (
            <span key={index} className="mx-10 text-xs sm:text-sm font-medium flex-shrink-0">
              {message}
            </span>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(var(--marquee-half, -50%)); }
        }
        .marquee-ticker {
          will-change: transform;
          animation: ticker var(--marquee-duration, 12s) linear infinite;
        }
        .marquee-ticker:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
};

export default AnnouncementBar;
