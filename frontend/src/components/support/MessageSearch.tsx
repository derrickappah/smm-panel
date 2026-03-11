import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSupport } from '@/contexts/support-context';

export const MessageSearch: React.FC = () => {
  const { messages, currentConversation } = useSupport();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
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
    setIsSearchOpen(false);
  };

  if (!currentConversation) return null;

  if (!isSearchOpen) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsSearchOpen(true)}
        className="text-white hover:bg-white/10 rounded-full h-9 w-9 p-0"
      >
        <Search className="w-5 h-5" />
      </Button>
    );
  }

  return (
    <div className="absolute inset-0 bg-[#075e54] z-20 flex items-center px-2 sm:px-4 animate-in fade-in slide-in-from-right-2 duration-200">
      <div className="flex-1 relative flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={clearSearch}
          className="text-white hover:bg-white/10 rounded-full h-8 w-8 p-0 flex-shrink-0"
        >
          <X className="w-5 h-5" />
        </Button>
        <div className="flex-1 relative">
          <Input
            autoFocus
            type="text"
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="bg-white/10 border-none text-white placeholder:text-white/60 focus-visible:ring-0 focus-visible:ring-offset-0 h-9 pr-24 rounded-full text-base"
          />
          {searchQuery && searchResults.length > 0 && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <span className="text-[10px] text-white/80 mr-1">
                {currentResultIndex + 1}/{searchResults.length}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => navigateToResult('prev')}
                className="h-6 w-6 p-0 text-white hover:bg-white/20 rounded-full"
              >
                ↑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => navigateToResult('next')}
                className="h-6 w-6 p-0 text-white hover:bg-white/20 rounded-full"
              >
                ↓
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

