import React, { useState, useEffect } from 'react';
import { useKnowledgeBase, useIncrementArticleViews } from '@/hooks/useKnowledgeBase';
import { useDebounce } from '@/hooks/useDebounce';
import { Search, BookOpen, X, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useSubmitArticleFeedback } from '@/hooks/useKnowledgeBase';

const KnowledgeBaseSearch = ({ onArticleSelect, searchTerm = '' }) => {
  const [search, setSearch] = useState(searchTerm);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedArticle, setSelectedArticle] = useState(null);
  const debouncedSearch = useDebounce(search, 300);
  const { data: articles = [], isLoading } = useKnowledgeBase(debouncedSearch, selectedCategory);
  const incrementViews = useIncrementArticleViews();
  const submitFeedback = useSubmitArticleFeedback();

  const categories = ['technical', 'billing', 'order', 'account', 'general'];

  const handleArticleClick = (article) => {
    incrementViews.mutate(article.id);
    setSelectedArticle(article);
    if (onArticleSelect) {
      onArticleSelect(article);
    }
  };

  const handleFeedback = (articleId, isHelpful) => {
    submitFeedback.mutate({ articleId, isHelpful });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search knowledge base..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={selectedCategory === '' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory('')}
          >
            All
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(cat)}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {selectedArticle ? (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <div className="flex items-start justify-between">
            <h3 className="text-lg font-semibold text-gray-900">{selectedArticle.title}</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedArticle(null)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="prose prose-sm max-w-none">
            <p className="text-gray-700 whitespace-pre-line">{selectedArticle.content}</p>
          </div>
          {selectedArticle.tags && selectedArticle.tags.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {selectedArticle.tags.map((tag, idx) => (
                <Badge key={idx} variant="secondary">{tag}</Badge>
              ))}
            </div>
          )}
          <div className="flex items-center gap-4 pt-2 border-t">
            <span className="text-sm text-gray-600">
              {selectedArticle.views} views
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleFeedback(selectedArticle.id, true)}
                className="flex items-center gap-1"
              >
                <ThumbsUp className="w-4 h-4" />
                {selectedArticle.helpful_count || 0}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleFeedback(selectedArticle.id, false)}
                className="flex items-center gap-1"
              >
                <ThumbsDown className="w-4 h-4" />
                {selectedArticle.not_helpful_count || 0}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-indigo-600 mx-auto"></div>
              <p className="text-sm text-gray-600 mt-2">Searching...</p>
            </div>
          ) : articles.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {articles.map((article) => (
                <div
                  key={article.id}
                  onClick={() => handleArticleClick(article)}
                  className="bg-white border border-gray-200 rounded-lg p-4 cursor-pointer hover:border-indigo-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900 mb-1">{article.title}</h4>
                      <p className="text-sm text-gray-600 line-clamp-2">{article.content}</p>
                      <div className="flex items-center gap-3 mt-2">
                        {article.category && (
                          <Badge variant="outline">{article.category}</Badge>
                        )}
                        <span className="text-xs text-gray-500">
                          {article.views} views
                        </span>
                      </div>
                    </div>
                    <BookOpen className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <BookOpen className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p>No articles found. Try a different search term.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default KnowledgeBaseSearch;







