import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, Edit, Trash2, Bell, X, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/useDebounce';
import { useAllUpdates, useCreateUpdate, useUpdateUpdate, useDeleteUpdate } from '@/hooks/useUpdates';

const AdminUpdates = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUpdate, setEditingUpdate] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const debouncedSearch = useDebounce(searchTerm, 300);

  const { data: updates = [], isLoading } = useAllUpdates();
  const createUpdate = useCreateUpdate();
  const updateUpdate = useUpdateUpdate();
  const deleteUpdate = useDeleteUpdate();

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'announcement',
    priority: 'normal',
    published: true
  });

  const filteredUpdates = updates.filter(update => {
    const matchesSearch = !debouncedSearch || 
      update.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      update.content.toLowerCase().includes(debouncedSearch.toLowerCase());
    return matchesSearch;
  });

  const handleEdit = (update) => {
    setEditingUpdate(update);
    setFormData({
      title: update.title,
      content: update.content,
      type: update.type || 'announcement',
      priority: update.priority || 'normal',
      published: update.published !== false
    });
    setShowForm(true);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this update?')) {
      deleteUpdate.mutate(id);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingUpdate) {
      updateUpdate.mutate({ id: editingUpdate.id, ...formData });
    } else {
      createUpdate.mutate(formData);
    }
    setShowForm(false);
    setEditingUpdate(null);
    setFormData({ title: '', content: '', type: 'announcement', priority: 'normal', published: true });
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'normal': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'low': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'announcement': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'update': return 'bg-green-100 text-green-800 border-green-200';
      case 'news': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-indigo-600" />
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Updates & Announcements</h2>
        </div>
        <Button
          onClick={() => {
            setShowForm(true);
            setEditingUpdate(null);
            setFormData({ title: '', content: '', type: 'announcement', priority: 'normal', published: true });
          }}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Update
        </Button>
      </div>

      {showForm && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">
              {editingUpdate ? 'Edit Update' : 'Create New Update'}
            </h3>
            <Button variant="ghost" size="sm" onClick={() => {
              setShowForm(false);
              setEditingUpdate(null);
              setFormData({ title: '', content: '', type: 'announcement', priority: 'normal', published: true });
            }}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                placeholder="Enter update title"
              />
            </div>
            <div>
              <Label>Content</Label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                className="min-h-[200px]"
                required
                placeholder="Enter update content"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="announcement">Announcement</SelectItem>
                    <SelectItem value="update">Update</SelectItem>
                    <SelectItem value="news">News</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={formData.priority} onValueChange={(value) => setFormData({ ...formData, priority: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.published}
                onChange={(e) => setFormData({ ...formData, published: e.target.checked })}
                className="rounded"
                id="published"
              />
              <Label htmlFor="published" className="cursor-pointer">Published</Label>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={createUpdate.isPending || updateUpdate.isPending}>
                {editingUpdate ? 'Update' : 'Create'} Update
              </Button>
              <Button type="button" variant="outline" onClick={() => {
                setShowForm(false);
                setEditingUpdate(null);
                setFormData({ title: '', content: '', type: 'announcement', priority: 'normal', published: true });
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
            placeholder="Search updates..."
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
      ) : filteredUpdates.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <AlertCircle className="w-12 h-12 mx-auto mb-2 text-gray-400" />
          <p>No updates found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredUpdates.map((update) => (
            <div key={update.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{update.title}</h3>
                    <Badge className={getTypeColor(update.type)}>{update.type}</Badge>
                    <Badge className={getPriorityColor(update.priority)}>{update.priority}</Badge>
                    {!update.published && (
                      <Badge variant="outline" className="text-xs">Draft</Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2 mb-2 whitespace-pre-line">{update.content}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>
                      Created: {new Date(update.created_at).toLocaleDateString()}
                    </span>
                    {update.updated_at && update.updated_at !== update.created_at && (
                      <span>
                        Updated: {new Date(update.updated_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(update)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(update.id)}
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

export default AdminUpdates;

