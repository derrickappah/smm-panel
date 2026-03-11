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
  }, [message.attachment_url, message.attachment_type]);

  return (
    <div
      className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-2 px-2`}
    >
      <div
        className={`max-w-[85%] sm:max-w-[70%] rounded-lg px-3 py-1.5 shadow-sm relative ${isOwnMessage
            ? 'bg-[#dcf8c6] text-gray-800 rounded-tr-none'
            : 'bg-white text-gray-800 rounded-tl-none'
          }`}
      >
        {/* Attachment - Show first if it exists */}
        {message.attachment_url && (
          <div className={`${isAttachmentOnly ? '' : 'mb-1'}`}>
            {message.attachment_type === 'image' ? (
              <div className="relative group overflow-hidden rounded">
                {imageLoading ? (
                  <div className="flex items-center justify-center p-8 bg-gray-100/50">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#075e54]"></div>
                  </div>
                ) : imageError || !imageUrl ? (
                  <div
                    className="flex items-center gap-2 p-2 rounded bg-black/5 hover:bg-black/10 transition-colors cursor-pointer"
                    onClick={() => handleImageClick(message.attachment_url!)}
                  >
                    <Image className="w-4 h-4 text-gray-600" />
                    <span className="text-xs text-gray-700 truncate max-w-[150px]">Image</span>
                  </div>
                ) : (
                  <img
                    src={imageUrl}
                    alt="Attachment"
                    className="max-w-full max-h-72 h-auto rounded cursor-pointer transition-opacity hover:opacity-90"
                    onClick={() => handleImageClick(imageUrl)}
                    onError={() => setImageError(true)}
                  />
                )}
              </div>
            ) : (
              <div
                className={`flex items-center gap-2 p-2 rounded bg-black/5 hover:bg-black/10 transition-colors cursor-pointer group`}
                onClick={() => handleFileDownload(message.attachment_url!, getFilenameFromUrl(message.attachment_url!))}
              >
                <div className="p-1.5 rounded bg-white shadow-sm">
                  {React.createElement(getFileInfo(message.attachment_url!).icon, {
                    className: "w-4 h-4 text-gray-600",
                  })}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">
                    {getFilenameFromUrl(message.attachment_url!)}
                  </div>
                  <div className="text-[10px] text-gray-500 uppercase">
                    {getFileInfo(message.attachment_url!).typeLabel}
                  </div>
                </div>
                <Download className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
              </div>
            )}
          </div>
        )}

        {/* Message content */}
        {!isAttachmentOnly && (
          <div className="text-[14px] leading-relaxed whitespace-pre-wrap break-words">{message.content}</div>
        )}

        {/* Timestamp and read receipt footer */}
        <div
          className="flex items-center justify-end gap-1 mt-0.5 ml-2 float-right"
        >
          <span className="text-[10px] text-gray-500">{formatTime(message.created_at)}</span>
          {isOwnMessage && (
            <span className="flex-shrink-0">
              {message.read_at ? (
                <CheckCheck className="w-3.5 h-3.5 text-blue-500" title="Read" />
              ) : (
                <Check className="w-3.5 h-3.5 text-gray-400" title="Sent" />
              )}
            </span>
          )}
        </div>

        {/* Actions for own messages */}
        {canEdit && (
          <div className="clear-both pt-1">
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

