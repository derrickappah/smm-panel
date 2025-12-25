import React, { useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, X, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { AttachmentType, FileUploadResult } from '@/types/support';

interface FileUploadProps {
  conversationId: string;
  onUploadComplete: (result: FileUploadResult) => void;
  disabled?: boolean;
}

const ALLOWED_TYPES = {
  image: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],
  file: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
};

const ALLOWED_EXTENSIONS = {
  image: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  file: ['.pdf', '.doc', '.docx'],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Compress image
const compressImage = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // Resize if larger than 1920px
        if (width > 1920) {
          height = (height * 1920) / width;
          width = 1920;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          file.type,
          0.8 // quality
        );
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
};

// Validate file
const validateFile = (file: File): { valid: boolean; type?: AttachmentType; error?: string } => {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'File size must be less than 10MB' };
  }

  // Check MIME type
  const mimeType = file.type.toLowerCase();
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();

  // Check if it's an image
  if (ALLOWED_TYPES.image.includes(mimeType) && ALLOWED_EXTENSIONS.image.includes(extension)) {
    return { valid: true, type: 'image' };
  }

  // Check if it's a file
  if (ALLOWED_TYPES.file.includes(mimeType) && ALLOWED_EXTENSIONS.file.includes(extension)) {
    return { valid: true, type: 'file' };
  }

  return { valid: false, error: 'Invalid file type. Allowed: jpg, png, webp, gif, pdf, doc, docx' };
};

export const FileUpload: React.FC<FileUploadProps> = ({
  conversationId,
  onUploadComplete,
  disabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  const uploadFile = useCallback(
    async (file: File) => {
      // Validate file
      const validation = validateFile(file);
      if (!validation.valid || !validation.type) {
        toast.error(validation.error || 'Invalid file');
        return;
      }

      setIsUploading(true);
      setUploadProgress(0);

      try {
        // Validate conversation_id is a valid UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(conversationId)) {
          throw new Error('Invalid conversation ID');
        }

        let fileToUpload = file;
        let fileType = validation.type;

        // Compress images
        if (fileType === 'image') {
          try {
            const compressedBlob = await compressImage(file);
            fileToUpload = new File([compressedBlob], file.name, { type: file.type });
          } catch (error) {
            console.warn('Failed to compress image, using original:', error);
          }
        }

        // Generate random UUID for filename
        const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
        const randomUUID = crypto.randomUUID();
        const fileName = `${randomUUID}${fileExtension}`;
        const filePath = `support/${conversationId}/${fileName}`;

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
          .from('support-attachments')
          .upload(filePath, fileToUpload, {
            cacheControl: '3600',
            upsert: false,
          });

        if (error) throw error;

        // Get public URL
        const {
          data: { publicUrl },
        } = supabase.storage.from('support-attachments').getPublicUrl(filePath);

        // Sanitize URL before using
        const sanitizedUrl = publicUrl.replace(/[<>"']/g, '');

        setUploadProgress(100);
        onUploadComplete({
          url: sanitizedUrl,
          type: fileType,
          filename: file.name,
        });

        toast.success('File uploaded successfully');
      } catch (error: any) {
        console.error('Error uploading file:', error);
        toast.error(error.message || 'Failed to upload file');
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [conversationId, onUploadComplete]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadFile(file);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      uploadFile(file);
    }
  };

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-4 transition-colors ${
        dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => !disabled && fileInputRef.current?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
        accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx"
        disabled={disabled || isUploading}
      />

      <div className="flex flex-col items-center justify-center gap-2">
        {isUploading ? (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <p className="text-sm text-gray-600">Uploading... {uploadProgress}%</p>
          </>
        ) : (
          <>
            <Upload className="w-8 h-8 text-gray-400" />
            <p className="text-sm text-gray-600">
              Drag and drop a file here, or click to select
            </p>
            <p className="text-xs text-gray-500">
              Supported: JPG, PNG, WebP, GIF, PDF, DOC, DOCX (max 10MB)
            </p>
          </>
        )}
      </div>
    </div>
  );
};

