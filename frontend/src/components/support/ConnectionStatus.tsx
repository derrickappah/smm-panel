import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';

interface ConnectionStatusProps {
  userId?: string;
  conversationId?: string;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ userId, conversationId }) => {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userId || !conversationId) {
      setIsOnline(null);
      return;
    }

    const checkPresence = async () => {
      try {
        const now = new Date();
        const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000);
        const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);

        // Check typing indicators for recent activity (within 30 seconds)
        const { data: typingIndicator } = await supabase
          .from('typing_indicators')
          .select('updated_at')
          .eq('conversation_id', conversationId)
          .eq('user_id', userId)
          .single();

        if (typingIndicator && typingIndicator.updated_at) {
          const updatedAt = new Date(typingIndicator.updated_at);
          if (updatedAt >= thirtySecondsAgo) {
            setIsOnline(true);
            return;
          }
        }

        // Check last message timestamp (within 2 minutes)
        const { data: lastMessages } = await supabase
          .from('messages')
          .select('created_at')
          .eq('conversation_id', conversationId)
          .eq('sender_id', userId)
          .order('created_at', { ascending: false })
          .limit(1);

        if (lastMessages && lastMessages.length > 0 && lastMessages[0].created_at) {
          const messageTime = new Date(lastMessages[0].created_at);
          if (messageTime >= twoMinutesAgo) {
            setIsOnline(true);
            return;
          }
        }

        // If no recent activity, user is offline
        setIsOnline(false);
      } catch (error) {
        console.error('Error checking user presence:', error);
        setIsOnline(null);
      }
    };

    // Check immediately
    checkPresence();

    // Check every 10 seconds
    const interval = setInterval(checkPresence, 10000);

    return () => clearInterval(interval);
  }, [userId, conversationId]);

  // Don't render if no userId/conversationId provided or status is unknown
  if (!userId || !conversationId || isOnline === null) {
    return null;
  }

  return (
    <Badge
      variant="outline"
      className={`flex items-center gap-1.5 ${
        isOnline
          ? 'bg-green-100 text-green-700 border-green-200'
          : 'bg-red-100 text-red-700 border-red-200'
      }`}
    >
      {isOnline ? (
        <>
          <Wifi className="w-3 h-3" />
          Online
        </>
      ) : (
        <>
          <WifiOff className="w-3 h-3" />
          Offline
        </>
      )}
    </Badge>
  );
};

