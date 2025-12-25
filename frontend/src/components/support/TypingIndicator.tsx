import React from 'react';
import { useSupport } from '@/contexts/support-context';
import { Loader2 } from 'lucide-react';

export const TypingIndicator: React.FC = () => {
  const { typingIndicators, currentConversation } = useSupport();

  if (!currentConversation || typingIndicators.length === 0) {
    return null;
  }

  const typingUsers = typingIndicators.filter(
    (indicator) => indicator.conversation_id === currentConversation.id && indicator.is_typing
  );

  if (typingUsers.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span>
        {typingUsers.length === 1
          ? `${typingUsers[0].user?.name || 'Someone'} is typing...`
          : 'Multiple people are typing...'}
      </span>
    </div>
  );
};

