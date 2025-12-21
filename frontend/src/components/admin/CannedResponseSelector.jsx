import React, { useState } from 'react';
import { useCannedResponses, useIncrementCannedResponseUsage } from '@/hooks/useCannedResponses';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, FileText, X } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';

const CannedResponseSelector = ({ onSelect, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const { data: responses = [], isLoading } = useCannedResponses(debouncedSearch, category);
  const incrementUsage = useIncrementCannedResponseUsage();

  const handleSelect = (response) => {
    incrementUsage.mutate(response.id);
    onSelect(response.content);
  };

  const categories = ['technical', 'billing', 'order', 'account', 'general'];

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-lg p-4 space-y-4 max-h-96 flex flex-col">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Canned Responses
        </h3>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search responses..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger>
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
        {isLoading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-200 border-t-indigo-600 mx-auto"></div>
          </div>
        ) : responses.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            No canned responses found
          </div>
        ) : (
          responses.map((response) => (
            <div
              key={response.id}
              className="border border-gray-200 rounded-lg p-3 hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer"
              onClick={() => handleSelect(response)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h4 className="font-medium text-sm text-gray-900 mb-1">{response.title}</h4>
                  <p className="text-xs text-gray-600 line-clamp-2">{response.content}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {response.category && (
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                        {response.category}
                      </span>
                    )}
                    <span className="text-xs text-gray-500">
                      Used {response.usage_count || 0} times
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CannedResponseSelector;



