import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSupport } from '@/contexts/support-context';

export const MessageSearch: React.FC = () => {
  const { messages, currentConversation } = useSupport();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [currentResultIndex, setCurrentResultIndex] = useState(-1);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query.trim() || !currentConversation) {
      setSearchResults([]);
      setCurrentResultIndex(-1);
      return;
    }

    const results: number[] = [];
    const lowerQuery = query.toLowerCase();

    messages.forEach((message, index) => {
      if (message.content.toLowerCase().includes(lowerQuery)) {
        results.push(index);
      }
    });

    setSearchResults(results);
    setCurrentResultIndex(results.length > 0 ? 0 : -1);
  };

  const navigateToResult = (direction: 'next' | 'prev') => {
    if (searchResults.length === 0) return;

    let newIndex = currentResultIndex;
    if (direction === 'next') {
      newIndex = (currentResultIndex + 1) % searchResults.length;
    } else {
      newIndex = currentResultIndex - 1;
      if (newIndex < 0) newIndex = searchResults.length - 1;
    }

    setCurrentResultIndex(newIndex);
    // Scroll to message
    const messageIndex = searchResults[newIndex];
    const messageElement = document.getElementById(`message-${messages[messageIndex]?.id}`);
    messageElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setCurrentResultIndex(-1);
  };

  if (!currentConversation) return null;

  return (
    <div className="border-b border-gray-200 p-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          type="text"
          placeholder="Search messages..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-10 pr-20"
        />
        {searchQuery && (
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
            {searchResults.length > 0 && (
              <span className="text-xs text-gray-500">
                {currentResultIndex + 1} / {searchResults.length}
              </span>
            )}
            {searchResults.length > 1 && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigateToResult('prev')}
                  className="h-6 w-6 p-0"
                >
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigateToResult('next')}
                  className="h-6 w-6 p-0"
                >
                  ↓
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={clearSearch}
              className="h-6 w-6 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

