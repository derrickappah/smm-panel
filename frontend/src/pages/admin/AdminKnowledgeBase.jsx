import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Edit, Trash2, Eye, BookOpen, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/useDebounce';

// Fetch all KB articles (admin can see unpublished too)
const fetchAllKBArticles = async () => {
  const { data, error } = await supabase
    .from('knowledge_base_articles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

// Create KB article
const createKBArticle = async (articleData) => {
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('knowledge_base_articles')
    .insert({
      ...articleData,
      created_by: user?.id
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Update KB article
const updateKBArticle = async ({ id, ...updates }) => {
  const { data, error } = await supabase
    .from('knowledge_base_articles')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// Delete KB article
const deleteKBArticle = async (id) => {
  const { error } = await supabase
    .from('knowledge_base_articles')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

const AdminKnowledgeBase = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('');
  const [editingArticle, setEditingArticle] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const debouncedSearch = useDebounce(searchTerm, 300);

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ['admin', 'knowledge_base'],
    queryFn: fetchAllKBArticles,
  });

  const createArticle = useMutation({
    mutationFn: createKBArticle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'knowledge_base'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge_base'] });
      toast.success('Article created successfully');
      setShowForm(false);
      setEditingArticle(null);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to create article');
    },
  });

  const updateArticle = useMutation({
    mutationFn: updateKBArticle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'knowledge_base'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge_base'] });
      toast.success('Article updated successfully');
      setEditingArticle(null);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update article');
    },
  });

  const deleteArticle = useMutation({
    mutationFn: deleteKBArticle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'knowledge_base'] });
      queryClient.invalidateQueries({ queryKey: ['knowledge_base'] });
      toast.success('Article deleted successfully');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete article');
    },
  });

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: '',
    tags: [],
    published: true
  });

  const filteredArticles = articles.filter(article => {
    const matchesSearch = !debouncedSearch || 
      article.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      article.content.toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchesCategory = !category || article.category === category;
    return matchesSearch && matchesCategory;
  });

  const handleEdit = (article) => {
    setEditingArticle(article);
    setFormData({
      title: article.title,
      content: article.content,
      category: article.category || '',
      tags: article.tags || [],
      published: article.published !== false
    });
    setShowForm(true);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this article?')) {
      deleteArticle.mutate(id);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingArticle) {
      updateArticle.mutate({ id: editingArticle.id, ...formData });
    } else {
      createArticle.mutate(formData);
    }
  };

  const categories = ['technical', 'billing', 'order', 'account', 'general'];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-indigo-600" />
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Knowledge Base Management</h2>
        </div>
        <Button
          onClick={() => {
            setShowForm(true);
            setEditingArticle(null);
            setFormData({ title: '', content: '', category: '', tags: [], published: true });
          }}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Article
        </Button>
      </div>

      {showForm && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">
              {editingArticle ? 'Edit Article' : 'Create New Article'}
            </h3>
            <Button variant="ghost" size="sm" onClick={() => {
              setShowForm(false);
              setEditingArticle(null);
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
              />
            </div>
            <div>
              <Label>Content</Label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                className="min-h-[200px]"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.published}
                    onChange={(e) => setFormData({ ...formData, published: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Published</span>
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={createArticle.isPending || updateArticle.isPending}>
                {editingArticle ? 'Update' : 'Create'} Article
              </Button>
              <Button type="button" variant="outline" onClick={() => {
                setShowForm(false);
                setEditingArticle(null);
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
            placeholder="Search articles..."
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
      ) : filteredArticles.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <BookOpen className="w-12 h-12 mx-auto mb-2 text-gray-400" />
          <p>No articles found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredArticles.map((article) => (
            <div key={article.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-gray-900">{article.title}</h3>
                    {!article.published && (
                      <Badge variant="outline" className="text-xs">Draft</Badge>
                    )}
                    {article.category && (
                      <Badge variant="secondary" className="text-xs">{article.category}</Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2 mb-2">{article.content}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      {article.views || 0} views
                    </span>
                    <span>
                      {article.helpful_count || 0} helpful
                    </span>
                    <span>
                      Created: {new Date(article.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(article)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(article.id)}
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

export default AdminKnowledgeBase;
