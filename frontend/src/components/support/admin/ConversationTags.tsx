import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X, Plus } from 'lucide-react';

interface ConversationTagsProps {
  tags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  disabled?: boolean;
}

export const ConversationTags: React.FC<ConversationTagsProps> = ({
  tags,
  onAddTag,
  onRemoveTag,
  disabled = false,
}) => {
  const [newTag, setNewTag] = useState('');

  const handleAddTag = () => {
    const trimmedTag = newTag.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      onAddTag(trimmedTag);
      setNewTag('');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Badge key={tag} variant="outline" className="flex items-center gap-1">
            {tag}
            {!disabled && (
              <button
                onClick={() => onRemoveTag(tag)}
                className="ml-1 hover:text-red-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </Badge>
        ))}
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Add tag..."
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddTag();
              }
            }}
            className="flex-1"
          />
          <Button size="sm" onClick={handleAddTag}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

