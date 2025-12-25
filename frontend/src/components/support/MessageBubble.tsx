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
  const canEdit = isOwnMessage && message.sender_role === 'user';
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
      className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-4 px-4`}
    >
      <div
        className={`max-w-[75%] rounded-lg px-4 py-2 ${
          isOwnMessage
            ? 'bg-indigo-600 text-white'
            : 'bg-white border border-gray-200 text-gray-900'
        }`}
      >
        {/* Attachment - Show first if it exists */}
        {message.attachment_url && (
          <div className={`${isAttachmentOnly ? '' : 'mb-2'}`}>
            {message.attachment_type === 'image' ? (
              <div className="relative group">
                {imageLoading ? (
                  <div className="flex items-center justify-center p-8 bg-gray-100 rounded-lg border border-gray-300">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                  </div>
                ) : imageError || !imageUrl ? (
                  <div
                    className="flex items-center gap-2 p-3 rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
                    onClick={() => handleImageClick(message.attachment_url!)}
                  >
                    <Image className="w-5 h-5 text-gray-600" />
                    <span className="text-sm text-gray-700">Image attachment</span>
                    <ExternalLink className="w-4 h-4 text-gray-500 ml-auto" />
                  </div>
                ) : (
                  <>
                    <img
                      src={imageUrl}
                      alt="Attachment"
                      className="max-w-full max-h-96 h-auto rounded-lg cursor-pointer border border-gray-300 shadow-sm hover:shadow-md transition-shadow"
                      onClick={() => handleImageClick(imageUrl)}
                      onError={() => {
                        setImageError(true);
                      }}
                      onLoad={() => setImageError(false)}
                    />
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="bg-black/50 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" />
                        <span>Open</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  isOwnMessage
                    ? 'bg-indigo-500/20 border-indigo-400/30'
                    : 'bg-gray-50 border-gray-300 hover:bg-gray-100'
                } transition-colors cursor-pointer group`}
                onClick={() => handleFileDownload(message.attachment_url!, getFilenameFromUrl(message.attachment_url!))}
              >
                <div
                  className={`p-2 rounded ${
                    isOwnMessage ? 'bg-indigo-500/30' : 'bg-white'
                  }`}
                >
                  {React.createElement(getFileInfo(message.attachment_url!).icon, {
                    className: `w-5 h-5 ${isOwnMessage ? 'text-indigo-200' : 'text-gray-600'}`,
                  })}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${isOwnMessage ? 'text-white' : 'text-gray-900'}`}>
                    {getFilenameFromUrl(message.attachment_url!)}
                  </div>
                  <div className={`text-xs ${isOwnMessage ? 'text-indigo-100' : 'text-gray-500'}`}>
                    {getFileInfo(message.attachment_url!).typeLabel}
                  </div>
                </div>
                <Download
                  className={`w-5 h-5 flex-shrink-0 ${
                    isOwnMessage ? 'text-indigo-200' : 'text-gray-500'
                  } group-hover:scale-110 transition-transform`}
                />
              </div>
            )}
          </div>
        )}

        {/* Message content - Hide if it's just the attachment placeholder */}
        {!isAttachmentOnly && (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
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

