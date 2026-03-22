import React, { useState, useEffect } from 'react';
import { Check, CheckCheck, File, FileText, Image, Download, ExternalLink } from 'lucide-react';
import { MessageActions } from './MessageActions';
import { useSupport } from '@/contexts/support-context';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/lib/supabase';
import type { Message } from '@/types/support';
import { formatDistanceToNow } from 'date-fns';

interface MessageBubbleProps {
  message: Message;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const { isAdmin, editMessage, deleteMessage } = useSupport();
  const { data: userRole } = useUserRole();
  const isOwnMessage = message.sender_id === userRole?.userId;
  // Admins can edit/delete any message, users can only edit their own user messages
  const canEdit = isAdmin || (isOwnMessage && message.sender_role === 'user');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

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

  const handleFileDownload = (url: string, filename?: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'attachment';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Extract filename from URL if possible
  const getFilenameFromUrl = (url: string): string => {
    try {
      const urlParts = url.split('/');
      const filename = urlParts[urlParts.length - 1];
      // Remove query parameters if any
      const cleanFilename = filename.split('?')[0];
      // Try to decode if it's encoded
      return decodeURIComponent(cleanFilename) || 'Attachment';
    } catch {
      return 'Attachment';
    }
  };

  // Get file extension and icon
  const getFileInfo = (url: string) => {
    const filename = getFilenameFromUrl(url);
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    let icon = File;
    let typeLabel = 'File';

    if (['pdf'].includes(extension)) {
      icon = FileText;
      typeLabel = 'PDF';
    } else if (['doc', 'docx'].includes(extension)) {
      icon = FileText;
      typeLabel = 'Document';
    } else {
      icon = File;
      typeLabel = extension.toUpperCase() || 'File';
    }

    return { filename, extension, icon: icon, typeLabel };
  };

  // Check if content is just whitespace or the attachment placeholder
  const isAttachmentOnly = !message.content.trim() || message.content.trim() === '📎 Attachment';

  // Generate signed URL for images in private bucket
  useEffect(() => {
    if (message.attachment_type === 'image' && message.attachment_url) {
      // Extract file path from URL
      // URL format: https://project.supabase.co/storage/v1/object/public/support-attachments/support/conversation_id/filename
      // or: https://project.supabase.co/storage/v1/object/sign/support-attachments/support/conversation_id/filename
      let filePath = '';
      try {
        const url = new URL(message.attachment_url);
        // Try to extract path after bucket name
        const pathMatch = url.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/support-attachments\/(.+)$/);
        if (pathMatch) {
          filePath = pathMatch[1];
        } else {
          // Fallback: extract from full path
          const parts = url.pathname.split('/');
          const bucketIndex = parts.findIndex(p => p === 'support-attachments');
          if (bucketIndex !== -1 && bucketIndex < parts.length - 1) {
            filePath = parts.slice(bucketIndex + 1).join('/');
          } else {
            // Last resort: use the last part of the URL
            filePath = message.attachment_url.split('support-attachments/').pop() || '';
          }
        }
      } catch {
        // If URL parsing fails, try to extract from string
        const match = message.attachment_url.match(/support-attachments\/(.+)$/);
        filePath = match ? match[1] : message.attachment_url.split('/').slice(-2).join('/');
      }

      // Generate signed URL (valid for 1 hour)
      if (filePath) {
        supabase.storage
          .from('support-attachments')
          .createSignedUrl(filePath, 3600)
          .then(({ data, error }) => {
            if (error) {
              console.error('Error creating signed URL:', error);
              // Fallback to original URL
              setImageUrl(message.attachment_url);
            } else {
              setImageUrl(data.signedUrl);
            }
            setImageLoading(false);
          })
          .catch((error) => {
            console.error('Error creating signed URL:', error);
            // Fallback to original URL
            setImageUrl(message.attachment_url);
            setImageLoading(false);
          });
      } else {
        // If we can't extract path, use original URL
        setImageUrl(message.attachment_url);
        setImageLoading(false);
      }
    } else {
      setImageUrl(null);
      setImageLoading(false);
    }
  }, [message.attachment_url, message.attachment_type]);  return (
    <div
      className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-3 px-2 group`}
    >
      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2 shadow-sm relative transition-all ${isOwnMessage
            ? 'bg-indigo-600 text-white rounded-tr-none'
            : 'bg-white text-gray-800 rounded-tl-none border border-gray-100 shadow-sm'
          }`}
      >
        {/* Attachment - Show first if it exists */}
        {message.attachment_url && (
          <div className={`${isAttachmentOnly ? '' : 'mb-2'}`}>
            {message.attachment_type === 'image' ? (
              <div className="relative overflow-hidden rounded-xl bg-black/5">
                {imageLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-current opacity-50"></div>
                  </div>
                ) : imageError || !imageUrl ? (
                  <div
                    className="flex items-center gap-2 p-3 rounded-xl bg-black/5 hover:bg-black/10 transition-colors cursor-pointer"
                    onClick={() => handleImageClick(message.attachment_url!)}
                  >
                    <Image className="w-5 h-5 text-gray-500" />
                    <span className="text-sm font-medium truncate">View Image</span>
                  </div>
                ) : (
                  <img
                    src={imageUrl}
                    alt="Attachment"
                    className="max-w-full max-h-80 h-auto rounded-xl cursor-pointer transition-transform hover:scale-[1.02]"
                    onClick={() => handleImageClick(imageUrl)}
                    onError={() => setImageError(true)}
                  />
                )}
              </div>
            ) : (
              <div
                className={`flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer ${
                  isOwnMessage ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-50 hover:bg-gray-100'
                }`}
                onClick={() => handleFileDownload(message.attachment_url!, getFilenameFromUrl(message.attachment_url!))}
              >
                <div className={`p-2 rounded-lg ${isOwnMessage ? 'bg-white/20' : 'bg-white shadow-sm'}`}>
                  {React.createElement(getFileInfo(message.attachment_url!).icon, {
                    className: `w-5 h-5 ${isOwnMessage ? 'text-white' : 'text-indigo-600'}`,
                  })}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold truncate ${isOwnMessage ? 'text-white' : 'text-gray-900'}`}>
                    {getFilenameFromUrl(message.attachment_url!)}
                  </div>
                  <div className={`text-[10px] uppercase font-bold tracking-wider ${isOwnMessage ? 'text-indigo-100' : 'text-gray-500'}`}>
                    {getFileInfo(message.attachment_url!).typeLabel}
                  </div>
                </div>
                <Download className={`w-5 h-5 ${isOwnMessage ? 'text-white/70' : 'text-gray-400'}`} />
              </div>
            )}
          </div>
        )}

        {/* Message content */}
        {!isAttachmentOnly && (
          <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{message.content}</div>
        )}

        {/* Footer: Timestamp and read receipt */}
        <div
          className={`flex items-center justify-end gap-1.5 mt-1.5 opacity-80 ${
            isOwnMessage ? 'text-indigo-100' : 'text-gray-400'
          }`}
        >
          <span className="text-[10px] font-medium">{formatTime(message.created_at)}</span>
          {isOwnMessage && (
            <span className="flex-shrink-0">
              {message.read_at ? (
                <CheckCheck className="w-4 h-4 text-white" title="Read" />
              ) : (
                <Check className="w-4 h-4 text-indigo-300" title="Sent" />
              )}
            </span>
          )}
        </div>

        {/* Message Actions - Subtle on hover */}
        {canEdit && (
          <div className="absolute -right-12 top-0 opacity-0 group-hover:opacity-100 transition-opacity">
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
;
};

