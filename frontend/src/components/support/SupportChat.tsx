import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, ChevronUp, Paperclip, X } from 'lucide-react';
import { useSupport } from '@/contexts/support-context';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { FileUpload } from './FileUpload';
import { MessageSearch } from './MessageSearch';
import { ConnectionStatus } from './ConnectionStatus';
import { toast } from 'sonner';
import type { AttachmentType } from '@/types/support';

export const SupportChat: React.FC = () => {
  const {
    currentTicket,
    currentConversation,
    messages,
    isLoadingMessages,
    isLoadingMoreMessages,
    hasMoreMessages,
    loadMoreMessages,
    sendMessage,
    setTyping,
    isLoadingTickets,
    isLoadingConversations,
    isAdmin,
  } = useSupport();

  const [messageContent, setMessageContent] = useState('');
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [attachmentType, setAttachmentType] = useState<AttachmentType | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isAtBottomRef = useRef(true);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom on new messages (only if user is at bottom)
  useEffect(() => {
    if (isAtBottomRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    isAtBottomRef.current = isNearBottom;
  }, []);

  // Handle file upload complete
  const handleFileUploadComplete = useCallback(
    (result: { url: string; type: AttachmentType; filename: string }) => {
      setAttachmentUrl(result.url);
      setAttachmentType(result.type);
      setShowFileUpload(false);
      toast.success('File ready to send');
    },
    []
  );

  // Handle send message
  const handleSendMessage = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();

      if (!messageContent.trim() && !attachmentUrl) {
        return;
      }

      // Check ticket status if using tickets
      if (currentTicket) {
        if (!isAdmin && currentTicket.status !== 'Replied') {
          toast.error('Please wait for admin reply before sending another message');
          return;
        }
        if (currentTicket.status === 'Closed') {
          toast.error('This ticket is closed');
          return;
        }
      }

      if (!currentTicket && !currentConversation) {
        toast.error('No ticket or conversation selected');
        return;
      }

      // If there's an attachment but no text, use a minimal placeholder
      const content = messageContent.trim() || (attachmentUrl ? ' ' : '');
      await sendMessage(content, attachmentUrl || undefined, attachmentType || undefined);

      // Clear form
      setMessageContent('');
      setAttachmentUrl(null);
      setAttachmentType(null);
      setShowFileUpload(false);

      // Clear typing indicator (only for conversations)
      if (currentConversation && typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        await setTyping(currentConversation.id, false);
      }
    },
    [messageContent, attachmentUrl, attachmentType, currentTicket, currentConversation, sendMessage, setTyping, isAdmin]
  );

  // Handle typing indicator (only for conversations)
  const handleInputChange = useCallback(
    (value: string) => {
      setMessageContent(value);

      // Only set typing for conversations, not tickets
      if (!currentConversation || currentTicket) return;

      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Set typing indicator
      if (value.trim()) {
        setTyping(currentConversation.id, true);
        typingTimeoutRef.current = setTimeout(() => {
          setTyping(currentConversation.id, false);
        }, 3000);
      } else {
        setTyping(currentConversation.id, false);
      }
    },
    [currentConversation, currentTicket, setTyping]
  );

  // Determine if input should be disabled
  const isInputDisabled = currentTicket
    ? (!isAdmin && currentTicket.status !== 'Replied') || currentTicket.status === 'Closed'
    : false;

  // Get status message
  const getStatusMessage = () => {
    if (!currentTicket) return null;
    if (currentTicket.status === 'Pending') {
      return 'Waiting for admin reply...';
    }
    if (currentTicket.status === 'Closed') {
      return 'This ticket is closed';
    }
    return null;
  };

  if (!currentTicket && !currentConversation) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        {(isLoadingTickets || isLoadingConversations) ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-purple-600 rounded-full animate-spin"></div>
            <p>Loading...</p>
          </div>
        ) : (
          <p>Select a ticket to view messages</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Message Search */}
      <div className="flex-shrink-0 border-b border-gray-200">
        <MessageSearch />
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 overscroll-contain"
        style={{ scrollbarWidth: 'thin' }}
      >
        {hasMoreMessages && (
          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={loadMoreMessages}
              disabled={isLoadingMoreMessages}
            >
              <ChevronUp className="w-4 h-4 mr-2" />
              {isLoadingMoreMessages ? 'Loading...' : 'Load older messages'}
            </Button>
          </div>
        )}

        {isLoadingMessages ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div key={message.id} id={`message-${message.id}`}>
                <MessageBubble message={message} />
              </div>
            ))}
            {!currentTicket && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Status Message */}
      {getStatusMessage() && (
        <div className="border-t border-gray-200 p-4 flex-shrink-0 bg-yellow-50 border-yellow-200">
          <p className="text-sm text-yellow-700 text-center">{getStatusMessage()}</p>
        </div>
      )}

      {/* File Upload */}
      {showFileUpload && (currentTicket || currentConversation) && (
        <div className="border-t border-gray-200 p-4 flex-shrink-0">
          <FileUpload
            conversationId={currentConversation?.id || currentTicket?.id}
            onUploadComplete={handleFileUploadComplete}
          />
        </div>
      )}

      {/* Input */}
      <div className="border-t border-gray-200 p-4 flex-shrink-0">
        {attachmentUrl && (
          <div className="mb-2 flex items-center gap-2 text-sm text-gray-600">
            <Paperclip className="w-4 h-4" />
            <span>File attached</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAttachmentUrl(null);
                setAttachmentType(null);
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}
        <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowFileUpload(!showFileUpload)}
            disabled={isInputDisabled}
            className="h-10 w-10 p-0 flex-shrink-0 touch-manipulation"
            aria-label="Attach file"
          >
            <Paperclip className="w-4 h-4" />
          </Button>
          <Input
            ref={inputRef}
            type="text"
            placeholder={isInputDisabled ? getStatusMessage() || "Type your message..." : "Type your message..."}
            value={messageContent}
            onChange={(e) => handleInputChange(e.target.value)}
            disabled={isInputDisabled}
            className="flex-1 min-h-[2.5rem]"
          />
          <Button 
            type="submit" 
            disabled={isInputDisabled || (!messageContent.trim() && !attachmentUrl)}
            className="h-10 w-10 p-0 flex-shrink-0 touch-manipulation"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
};

