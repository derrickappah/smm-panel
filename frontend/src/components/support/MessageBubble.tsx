import React from 'react';
import { Check, CheckCheck } from 'lucide-react';
import { MessageActions } from './MessageActions';
import { useSupport } from '@/contexts/support-context';
import { useUserRole } from '@/hooks/useUserRole';
import type { Message } from '@/types/support';
import { formatDistanceToNow } from 'date-fns';

interface MessageBubbleProps {
  message: Message;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const { isAdmin, editMessage, deleteMessage } = useSupport();
  const { data: userRole } = useUserRole();
  const isOwnMessage = message.sender_id === userRole?.userId;
  const canEdit = isOwnMessage && message.sender_role === 'user';

  const formatTime = (timestamp: string) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return new Date(timestamp).toLocaleTimeString();
    }
  };

  const handleImageClick = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div
      className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-4 px-4`}
    >
      <div
        className={`max-w-[75%] rounded-lg px-4 py-2 ${
          isOwnMessage
            ? 'bg-indigo-600 text-white'
            : 'bg-white border border-gray-200 text-gray-900'
        }`}
      >
        {/* Message content */}
        <div className="whitespace-pre-wrap break-words">{message.content}</div>

        {/* Attachment */}
        {message.attachment_url && (
          <div className="mt-2">
            {message.attachment_type === 'image' ? (
              <img
                src={message.attachment_url}
                alt="Attachment"
                className="max-w-full h-auto rounded cursor-pointer"
                onClick={() => handleImageClick(message.attachment_url!)}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <a
                href={message.attachment_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline flex items-center gap-1"
              >
                📎 View attachment
              </a>
            )}
          </div>
        )}

        {/* Timestamp and read receipt */}
        <div
          className={`flex items-center gap-2 mt-1 text-xs ${
            isOwnMessage ? 'text-indigo-100' : 'text-gray-500'
          }`}
        >
          <span>{formatTime(message.created_at)}</span>
          {isOwnMessage && (
            <span>
              {message.read_at ? (
                <CheckCheck className="w-4 h-4" title="Read" />
              ) : (
                <Check className="w-4 h-4" title="Sent" />
              )}
            </span>
          )}
        </div>

        {/* Actions for own messages */}
        {canEdit && (
          <div className="mt-2">
            <MessageActions
              messageId={message.id}
              content={message.content}
              onEdit={editMessage}
              onDelete={deleteMessage}
            />
          </div>
        )}
      </div>
    </div>
  );
};

