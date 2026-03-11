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
      <div className="flex items-center justify-center h-full text-gray-500 bg-[#e5ddd5]">
        <div className="flex flex-col items-center gap-4 bg-white/80 p-8 rounded-2xl shadow-sm max-w-sm text-center">
          <div className="w-12 h-12 border-4 border-gray-100 border-t-[#075e54] rounded-full animate-spin"></div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">Connecting to support...</h3>
            <p className="text-sm text-gray-500">Please wait while we set up your secure chat session.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#e5ddd5] relative">
      {/* WhatsApp Header */}
      <div className="flex-shrink-0 bg-[#075e54] text-white p-2 sm:p-3 flex items-center gap-2 sm:gap-3 shadow-md z-10 relative">
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/20 flex items-center justify-center overflow-hidden border border-white/10">
          <img
            src="/avatar_user_2_1771801048478.png"
            alt="Support Avatar"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm sm:text-base truncate">BoostUp Support Team</h3>
          <div className="flex items-center gap-1.5 text-xs text-green-200">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
            <span>Online</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <MessageSearch />
        </div>
      </div>

      {/* Messages area with WhatsApp background pattern (simulated with color) */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0 overscroll-contain bg-[#e5ddd5]"
        style={{
          scrollbarWidth: 'thin',
          backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")',
          backgroundRepeat: 'repeat',
          opacity: 0.9
        }}
      >
        {hasMoreMessages && (
          <div className="flex justify-center mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadMoreMessages}
              disabled={isLoadingMoreMessages}
              className="text-gray-600 bg-white/50 hover:bg-white/80 rounded-full"
            >
              <ChevronUp className="w-4 h-4 mr-2" />
              {isLoadingMoreMessages ? 'Loading...' : 'Load older messages'}
            </Button>
          </div>
        )}

        {isLoadingMessages ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-[#075e54] rounded-full animate-spin"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="bg-white/80 px-4 py-2 rounded-lg shadow-sm text-sm">
              No messages yet. Start the conversation!
            </div>
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

      {/* File Upload Area */}
      {showFileUpload && (currentTicket || currentConversation) && (
        <div className="absolute bottom-20 left-4 right-4 z-20 bg-white rounded-lg shadow-xl p-4 border border-gray-200 animate-in slide-in-from-bottom-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">Attach File</span>
            <Button variant="ghost" size="sm" onClick={() => setShowFileUpload(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <FileUpload
            conversationId={currentConversation?.id || currentTicket?.id}
            onUploadComplete={handleFileUploadComplete}
          />
        </div>
      )}

      {/* Input Area */}
      <div className="bg-[#f0f2f5] p-2 sm:p-3 flex-shrink-0 border-t border-gray-200">
        {attachmentUrl && (
          <div className="mb-2 mx-2 p-2 bg-white rounded-lg border border-green-200 flex items-center gap-2 text-sm text-gray-600">
            <Paperclip className="w-4 h-4 text-[#075e54]" />
            <span className="flex-1 truncate">File attached</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAttachmentUrl(null);
                setAttachmentType(null);
              }}
              className="h-8 w-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}
        <form onSubmit={handleSendMessage} className="flex gap-2 items-end max-w-4xl mx-auto">
          <div className="flex-1 bg-white rounded-2xl flex items-end p-1 shadow-sm overflow-hidden border border-gray-200">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowFileUpload(!showFileUpload)}
              className="h-10 w-10 p-0 rounded-full text-gray-500 hover:bg-gray-100 flex-shrink-0"
              aria-label="Attach file"
            >
              <Paperclip className="w-5 h-5 rotate-45" />
            </Button>

            <textarea
              rows={1}
              placeholder="Type a message"
              value={messageContent}
              onChange={(e) => {
                handleInputChange(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              className="flex-1 bg-transparent border-none focus:ring-0 py-2.5 px-2 text-base max-h-32 resize-none"
              style={{ minHeight: '40px' }}
            />
          </div>

          <Button
            type="submit"
            disabled={!messageContent.trim() && !attachmentUrl}
            className={`h-10 w-10 sm:h-12 sm:w-12 p-0 rounded-full flex-shrink-0 transition-all ${messageContent.trim() || attachmentUrl
              ? 'bg-[#00a884] hover:bg-[#008f72] shadow-md'
              : 'bg-gray-400'
              }`}
            aria-label="Send message"
          >
            <Send className="w-4 h-4 sm:w-5 sm:h-5 text-white ml-0.5" />
          </Button>
        </form>
      </div>
    </div>
  );
};

