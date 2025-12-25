import React, { useState } from 'react';
import { useCannedResponses, useCreateCannedResponse, useUpdateCannedResponse, useDeleteCannedResponse } from '@/hooks/useCannedResponses';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Edit, Trash2, FileText, X, TrendingUp } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';

const AdminCannedResponses = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('');
  const [editingResponse, setEditingResponse] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const debouncedSearch = useDebounce(searchTerm, 300);

  const { data: responses = [], isLoading } = useCannedResponses(debouncedSearch, category);
  const createResponse = useCreateCannedResponse();
  const updateResponse = useUpdateCannedResponse();
  const deleteResponse = useDeleteCannedResponse();

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: '',
    tags: []
  });

  const handleEdit = (response) => {
    setEditingResponse(response);
    setFormData({
      title: response.title,
      content: response.content,
      category: response.category || '',
      tags: response.tags || []
    });
    setShowForm(true);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this canned response?')) {
      deleteResponse.mutate(id);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingResponse) {
      updateResponse.mutate({ id: editingResponse.id, ...formData });
    } else {
      createResponse.mutate(formData);
    }
    setShowForm(false);
    setEditingResponse(null);
    setFormData({ title: '', content: '', category: '', tags: [] });
  };

  const categories = ['technical', 'payment', 'order', 'account', 'general'];

  // Sort by usage count
  const sortedResponses = [...responses].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-indigo-600" />
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Canned Responses Management</h2>
        </div>
        <Button
          onClick={() => {
            setShowForm(true);
            setEditingResponse(null);
            setFormData({ title: '', content: '', category: '', tags: [] });
          }}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Response
        </Button>
      </div>

      {showForm && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">
              {editingResponse ? 'Edit Canned Response' : 'Create New Canned Response'}
            </h3>
            <Button variant="ghost" size="sm" onClick={() => {
              setShowForm(false);
              setEditingResponse(null);
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
                placeholder="e.g., Order Refund Request"
                required
              />
            </div>
            <div>
              <Label>Content</Label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                className="min-h-[150px]"
                placeholder="Enter the canned response text..."
                required
              />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No Category</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={createResponse.isPending || updateResponse.isPending}>
                {editingResponse ? 'Update' : 'Create'} Response
              </Button>
              <Button type="button" variant="outline" onClick={() => {
                setShowForm(false);
                setEditingResponse(null);
              }}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search responses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Categories</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-indigo-600 mx-auto"></div>
        </div>
      ) : sortedResponses.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-2 text-gray-400" />
          <p>No canned responses found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedResponses.map((response) => (
            <div key={response.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-gray-900">{response.title}</h3>
                    {response.category && (
                      <Badge variant="secondary" className="text-xs">{response.category}</Badge>
                    )}
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <TrendingUp className="w-3 h-3" />
                      {response.usage_count || 0} uses
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-3 mb-2">{response.content}</p>
                  <div className="text-xs text-gray-500">
                    Created: {new Date(response.created_at).toLocaleDateString()}
                    {response.updated_at !== response.created_at && (
                      <span className="ml-2">
                        • Updated: {new Date(response.updated_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(response)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(response.id)}
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

export default AdminCannedResponses;






