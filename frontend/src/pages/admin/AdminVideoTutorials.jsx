import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Edit, Trash2, Video, X, Play, Upload, Loader2, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/useDebounce';
import { useAllVideoTutorials, useCreateVideoTutorial, useUpdateVideoTutorial, useDeleteVideoTutorial } from '@/hooks/useVideoTutorials';

const AdminVideoTutorials = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [editingTutorial, setEditingTutorial] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const debouncedSearch = useDebounce(searchTerm, 300);

  const { data: tutorials = [], isLoading } = useAllVideoTutorials();
  const createTutorial = useCreateVideoTutorial();
  const updateTutorial = useUpdateVideoTutorial();
  const deleteTutorial = useDeleteVideoTutorial();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    video_url: '',
    thumbnail_url: '',
    category: '',
    duration: '',
    order: 0,
    published: true
  });
  const [videoFile, setVideoFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const videoInputRef = useRef(null);
  const thumbnailInputRef = useRef(null);

  const filteredTutorials = tutorials.filter(tutorial => {
    const matchesSearch = !debouncedSearch || 
      tutorial.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      (tutorial.description && tutorial.description.toLowerCase().includes(debouncedSearch.toLowerCase()));
    return matchesSearch;
  });

  const handleEdit = (tutorial) => {
    setEditingTutorial(tutorial);
    setFormData({
      title: tutorial.title,
      description: tutorial.description || '',
      video_url: tutorial.video_url,
      thumbnail_url: tutorial.thumbnail_url || '',
      category: tutorial.category || '',
      duration: tutorial.duration ? tutorial.duration.toString() : '',
      order: tutorial.order || 0,
      published: tutorial.published !== false
    });
    setVideoFile(null);
    setThumbnailFile(null);
    setShowForm(true);
  };

  const uploadVideo = async (file) => {
    if (!file) return null;

    setUploadingVideo(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('You must be logged in to upload files');
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `video-tutorials/${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('storage')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        if (uploadError.message?.includes('row-level security') || uploadError.message?.includes('policy')) {
          throw new Error('Storage access denied. Please contact admin to set up storage policies.');
        }
        if (uploadError.message?.includes('Bucket not found') || uploadError.statusCode === 404) {
          throw new Error('Storage bucket not found. Please contact admin to create the storage bucket.');
        }
        throw new Error('Failed to upload video: ' + (uploadError.message || 'Unknown error'));
      }

      const { data: urlData } = supabase.storage
        .from('storage')
        .getPublicUrl(fileName);
      
      toast.success('Video uploaded successfully');
      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading video:', error);
      toast.error(error.message || 'Failed to upload video');
      return null;
    } finally {
      setUploadingVideo(false);
    }
  };

  const uploadThumbnail = async (file) => {
    if (!file) return null;

    setUploadingThumbnail(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('You must be logged in to upload files');
      }

      // Validate image file
      if (!file.type.startsWith('image/')) {
        throw new Error('Thumbnail must be an image file');
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `video-tutorials/thumbnails/${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('storage')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        if (uploadError.message?.includes('row-level security') || uploadError.message?.includes('policy')) {
          throw new Error('Storage access denied. Please contact admin to set up storage policies.');
        }
        if (uploadError.message?.includes('Bucket not found') || uploadError.statusCode === 404) {
          throw new Error('Storage bucket not found. Please contact admin to create the storage bucket.');
        }
        throw new Error('Failed to upload thumbnail: ' + (uploadError.message || 'Unknown error'));
      }

      const { data: urlData } = supabase.storage
        .from('storage')
        .getPublicUrl(fileName);
      
      toast.success('Thumbnail uploaded successfully');
      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading thumbnail:', error);
      toast.error(error.message || 'Failed to upload thumbnail');
      return null;
    } finally {
      setUploadingThumbnail(false);
    }
  };

  const handleVideoFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate video file
      if (!file.type.startsWith('video/')) {
        toast.error('Please select a valid video file');
        return;
      }
      setVideoFile(file);
      const url = await uploadVideo(file);
      if (url) {
        setFormData({ ...formData, video_url: url });
      }
    }
  };

  const handleThumbnailFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate image file
      if (!file.type.startsWith('image/')) {
        toast.error('Please select a valid image file');
        return;
      }
      setThumbnailFile(file);
      const url = await uploadThumbnail(file);
      if (url) {
        console.log('Thumbnail uploaded, setting URL:', url);
        setFormData(prev => {
          const updated = { ...prev, thumbnail_url: url };
          console.log('Updated formData with thumbnail:', updated);
          return updated;
        });
      } else {
        console.error('Thumbnail upload failed, URL is null');
        toast.error('Failed to upload thumbnail. Please try again.');
      }
    }
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this video tutorial?')) {
      deleteTutorial.mutate(id);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Wait for any ongoing uploads to complete
    if (uploadingVideo || uploadingThumbnail) {
      toast.error('Please wait for uploads to complete');
      return;
    }

    // If files were selected but not yet uploaded (shouldn't happen with current flow, but safety check)
    let finalVideoUrl = formData.video_url?.trim() || '';
    let finalThumbnailUrl = formData.thumbnail_url?.trim() || '';

    // Files are uploaded immediately when selected, so we just use the URLs from formData
    // But if a file was selected but upload failed, we need to check
    if (videoFile && !formData.video_url) {
      toast.error('Video upload failed. Please try uploading again.');
      return;
    }

    if (!finalVideoUrl) {
      toast.error('Please provide a video URL or upload a video file');
      return;
    }

    // Prepare submit data - ensure thumbnail_url is null if empty, not empty string
    const submitData = {
      title: formData.title.trim(),
      description: formData.description?.trim() || null,
      video_url: finalVideoUrl,
      thumbnail_url: finalThumbnailUrl && finalThumbnailUrl.trim() !== '' ? finalThumbnailUrl.trim() : null,
      category: formData.category?.trim() || null,
      duration: formData.duration ? parseInt(formData.duration) : null,
      order: parseInt(formData.order) || 0,
      published: formData.published !== false
    };

    console.log('Form data before submit:', formData);
    console.log('Submitting video tutorial data:', submitData);
    console.log('Thumbnail URL being saved:', submitData.thumbnail_url);
    
    if (editingTutorial) {
      updateTutorial.mutate({ id: editingTutorial.id, ...submitData });
    } else {
      createTutorial.mutate(submitData);
    }
    setShowForm(false);
    setEditingTutorial(null);
    setVideoFile(null);
    setThumbnailFile(null);
    setFormData({ title: '', description: '', video_url: '', thumbnail_url: '', category: '', duration: '', order: 0, published: true });
    if (videoInputRef.current) videoInputRef.current.value = '';
    if (thumbnailInputRef.current) thumbnailInputRef.current.value = '';
  };

  const formatDuration = (seconds) => {
    if (!seconds) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Video className="w-6 h-6 text-indigo-600" />
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Video Tutorials</h2>
        </div>
        <Button
          onClick={() => {
            setShowForm(true);
            setEditingTutorial(null);
            setVideoFile(null);
            setThumbnailFile(null);
            setFormData({ title: '', description: '', video_url: '', thumbnail_url: '', category: '', duration: '', order: 0, published: true });
            if (videoInputRef.current) videoInputRef.current.value = '';
            if (thumbnailInputRef.current) thumbnailInputRef.current.value = '';
          }}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Tutorial
        </Button>
      </div>

      {showForm && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">
              {editingTutorial ? 'Edit Video Tutorial' : 'Create New Video Tutorial'}
            </h3>
            <Button variant="ghost" size="sm" onClick={() => {
              setShowForm(false);
              setEditingTutorial(null);
              setVideoFile(null);
              setThumbnailFile(null);
              setFormData({ title: '', description: '', video_url: '', thumbnail_url: '', category: '', duration: '', order: 0, published: true });
              if (videoInputRef.current) videoInputRef.current.value = '';
              if (thumbnailInputRef.current) thumbnailInputRef.current.value = '';
            }}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                placeholder="Enter tutorial title"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="min-h-[100px]"
                placeholder="Enter tutorial description"
              />
            </div>
            <div>
              <Label>Video *</Label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleVideoFileChange}
                    className="flex-1"
                    disabled={uploadingVideo}
                  />
                  {uploadingVideo && (
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  )}
                </div>
                <div className="text-sm text-gray-500">OR</div>
                <Input
                  value={formData.video_url}
                  onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                  placeholder="Enter video URL (e.g., https://example.com/video.mp4 or YouTube URL)"
                  disabled={uploadingVideo}
                />
                {videoFile && (
                  <div className="p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">
                    Selected: {videoFile.name} ({(videoFile.size / 1024 / 1024).toFixed(2)} MB)
                  </div>
                )}
                {formData.video_url && !videoFile && (
                  <div className="p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
                    Video URL: {formData.video_url.substring(0, 50)}...
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Upload a video file or enter a direct video URL/YouTube URL
              </p>
            </div>
            <div>
              <Label>Thumbnail</Label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    ref={thumbnailInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleThumbnailFileChange}
                    className="flex-1"
                    disabled={uploadingThumbnail}
                  />
                  {uploadingThumbnail && (
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  )}
                </div>
                <div className="text-sm text-gray-500">OR</div>
                <Input
                  value={formData.thumbnail_url || ''}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    console.log('Thumbnail URL input changed:', newValue);
                    setFormData(prev => ({ ...prev, thumbnail_url: newValue }));
                  }}
                  placeholder="Enter thumbnail image URL"
                  disabled={uploadingThumbnail}
                />
                {thumbnailFile && (
                  <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded">
                    <img 
                      src={URL.createObjectURL(thumbnailFile)} 
                      alt="Thumbnail preview" 
                      className="w-16 h-16 object-cover rounded"
                    />
                    <div className="text-sm text-green-700">
                      {thumbnailFile.name} ({(thumbnailFile.size / 1024).toFixed(2)} KB)
                    </div>
                  </div>
                )}
                {formData.thumbnail_url && !thumbnailFile && (
                  <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded">
                    <img 
                      src={formData.thumbnail_url} 
                      alt="Thumbnail" 
                      className="w-16 h-16 object-cover rounded"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                    <div className="text-sm text-blue-700">
                      Thumbnail URL set
                    </div>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Upload a thumbnail image or enter an image URL
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Input
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="e.g., Getting Started, Deposits, Orders"
                />
              </div>
              <div>
                <Label>Duration (seconds)</Label>
                <Input
                  type="number"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                  placeholder="e.g., 120"
                  min="0"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Order</Label>
                <Input
                  type="number"
                  value={formData.order}
                  onChange={(e) => setFormData({ ...formData, order: e.target.value })}
                  min="0"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.published}
                    onChange={(e) => setFormData({ ...formData, published: e.target.checked })}
                    className="rounded"
                    id="published"
                  />
                  <span className="text-sm text-gray-700">Published</span>
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                type="submit" 
                disabled={createTutorial.isPending || updateTutorial.isPending || uploadingVideo || uploadingThumbnail}
              >
                {(uploadingVideo || uploadingThumbnail) ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    {editingTutorial ? 'Update' : 'Create'} Tutorial
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" onClick={() => {
                setShowForm(false);
                setEditingTutorial(null);
                setFormData({ title: '', description: '', video_url: '', thumbnail_url: '', category: '', duration: '', order: 0, published: true });
              }}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search tutorials..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-indigo-600 mx-auto"></div>
        </div>
      ) : filteredTutorials.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Video className="w-12 h-12 mx-auto mb-2 text-gray-400" />
          <p>No video tutorials found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTutorials.map((tutorial) => (
            <div key={tutorial.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{tutorial.title}</h3>
                    {tutorial.category && (
                      <Badge variant="outline">{tutorial.category}</Badge>
                    )}
                    {!tutorial.published && (
                      <Badge variant="outline" className="text-xs">Draft</Badge>
                    )}
                    <span className="text-xs text-gray-500">Order: {tutorial.order || 0}</span>
                  </div>
                  {tutorial.description && (
                    <p className="text-sm text-gray-600 line-clamp-2 mb-2">{tutorial.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>Duration: {formatDuration(tutorial.duration)}</span>
                    <span>Views: {tutorial.views || 0}</span>
                    <span>
                      Created: {new Date(tutorial.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {tutorial.video_url && (
                    <div className="mt-2">
                      <a
                        href={tutorial.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                      >
                        <Play className="w-3 h-3" />
                        View Video
                      </a>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(tutorial)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(tutorial.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminVideoTutorials;

