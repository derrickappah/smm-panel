import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Edit, Trash2, HelpCircle, X, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/useDebounce';
import { useAllFAQs, useCreateFAQ, useUpdateFAQ, useDeleteFAQ } from '@/hooks/useFAQ';

const AdminFAQ = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [editingFAQ, setEditingFAQ] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const debouncedSearch = useDebounce(searchTerm, 300);

  const { data: faqs = [], isLoading } = useAllFAQs();
  const createFAQ = useCreateFAQ();
  const updateFAQ = useUpdateFAQ();
  const deleteFAQ = useDeleteFAQ();

  const [formData, setFormData] = useState({
    question: '',
    answer: '',
    order: 0,
    published: true
  });

  const filteredFAQs = faqs.filter(faq => {
    const matchesSearch = !debouncedSearch || 
      faq.question.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      faq.answer.toLowerCase().includes(debouncedSearch.toLowerCase());
    return matchesSearch;
  });

  const handleEdit = (faq) => {
    setEditingFAQ(faq);
    setFormData({
      question: faq.question,
      answer: faq.answer,
      order: faq.order || 0,
      published: faq.published !== false
    });
    setShowForm(true);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this FAQ?')) {
      deleteFAQ.mutate(id);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingFAQ) {
      updateFAQ.mutate({ id: editingFAQ.id, ...formData });
    } else {
      createFAQ.mutate(formData);
    }
    setShowForm(false);
    setEditingFAQ(null);
    setFormData({ question: '', answer: '', order: 0, published: true });
  };

  const handleOrderChange = async (id, direction) => {
    const faq = faqs.find(f => f.id === id);
    if (!faq) return;

    const currentOrder = faq.order || 0;
    const newOrder = direction === 'up' ? currentOrder - 1 : currentOrder + 1;

    // Find FAQ with the order we're swapping with
    const swapFAQ = faqs.find(f => (f.order || 0) === newOrder);
    
    try {
      if (swapFAQ) {
        // Swap orders
        await supabase
          .from('faqs')
          .update({ order: currentOrder })
          .eq('id', swapFAQ.id);
      }
      
      await supabase
        .from('faqs')
        .update({ order: newOrder })
        .eq('id', id);

      queryClient.invalidateQueries({ queryKey: ['admin', 'faqs'] });
      queryClient.invalidateQueries({ queryKey: ['faqs'] });
    } catch (error) {
      toast.error('Failed to update order');
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <HelpCircle className="w-6 h-6 text-indigo-600" />
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">FAQ Management</h2>
        </div>
        <Button
          onClick={() => {
            setShowForm(true);
            setEditingFAQ(null);
            setFormData({ question: '', answer: '', order: faqs.length || 0, published: true });
          }}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          New FAQ
        </Button>
      </div>

      {showForm && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">
              {editingFAQ ? 'Edit FAQ' : 'Create New FAQ'}
            </h3>
            <Button variant="ghost" size="sm" onClick={() => {
              setShowForm(false);
              setEditingFAQ(null);
              setFormData({ question: '', answer: '', order: 0, published: true });
            }}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Question</Label>
              <Input
                value={formData.question}
                onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                required
                placeholder="Enter the question"
              />
            </div>
            <div>
              <Label>Answer</Label>
              <Textarea
                value={formData.answer}
                onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                className="min-h-[200px]"
                required
                placeholder="Enter the answer"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Order</Label>
                <Input
                  type="number"
                  value={formData.order}
                  onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
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
                  />
                  <span className="text-sm text-gray-700">Published</span>
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={createFAQ.isPending || updateFAQ.isPending}>
                {editingFAQ ? 'Update' : 'Create'} FAQ
              </Button>
              <Button type="button" variant="outline" onClick={() => {
                setShowForm(false);
                setEditingFAQ(null);
                setFormData({ question: '', answer: '', order: 0, published: true });
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
            placeholder="Search FAQs..."
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
      ) : filteredFAQs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <HelpCircle className="w-12 h-12 mx-auto mb-2 text-gray-400" />
          <p>No FAQs found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredFAQs.map((faq, index) => (
            <div key={faq.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm text-gray-500 font-mono">#{faq.order || 0}</span>
                    <h3 className="font-semibold text-gray-900">{faq.question}</h3>
                    {!faq.published && (
                      <Badge variant="outline" className="text-xs">Draft</Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2 mb-2">{faq.answer}</p>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>
                      Created: {new Date(faq.created_at).toLocaleDateString()}
                    </span>
                    {faq.updated_at && faq.updated_at !== faq.created_at && (
                      <span>
                        Updated: {new Date(faq.updated_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOrderChange(faq.id, 'up')}
                      disabled={index === 0}
                      className="h-7 w-7 p-0"
                      title="Move up"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOrderChange(faq.id, 'down')}
                      disabled={index === filteredFAQs.length - 1}
                      className="h-7 w-7 p-0"
                      title="Move down"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(faq)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(faq.id)}
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

export default AdminFAQ;

