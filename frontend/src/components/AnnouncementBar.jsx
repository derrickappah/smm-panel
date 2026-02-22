import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Filler messages shown when there aren't enough real claims
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

          // Always mix in fillers so we have at least 12 unique messages
          const combined = [...claimMessages];
          let fillerIdx = 0;
          while (combined.length < 12) {
            combined.push(FILLER_MESSAGES[fillerIdx % FILLER_MESSAGES.length]);
            fillerIdx++;
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

  // Quadruple to make the seam invisible
  const marqueeItems = [...messages, ...messages, ...messages, ...messages];

  // 1 second per message keeps it fast but readable
  const duration = Math.max(5, messages.length * 1);

  return (
    <div className="w-full bg-indigo-600 text-white overflow-hidden py-1.5 md:py-2 border-t border-indigo-700">
      <div className="marquee-track flex whitespace-nowrap">
        {marqueeItems.map((message, index) => (
          <span key={index} className="mx-10 text-xs sm:text-sm font-medium flex-shrink-0">
            {message}
          </span>
        ))}
      </div>
      <style>{`
        @keyframes marquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-25%); }
        }
        .marquee-track {
          animation: marquee ${duration}s linear infinite;
        }
        .marquee-track:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
};

export default AnnouncementBar;
