import React, { useState, useEffect, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Zap, Search, Plus, Trash2, RotateCcw, X, Check } from 'lucide-react';
import { toast } from 'sonner';

export interface QuickReply {
  id: string;
  title: string;
  content: string;
  isCustom?: boolean;
}

export const DEFAULT_QUICK_REPLIES: QuickReply[] = [
  {
    id: 'delayed-order-id',
    title: 'Delayed Order - Request Order ID',
    content: `If your order has delayed, kindly send me your Order ID here.\n\nIt looks like this: 117266637 / 99838736\n\nBoostUp GH Agent\nAma Serwaa`,
  },
  {
    id: 'likes-drop-description',
    title: 'Likes Drop - Check Description',
    content: `If you bought Likes, the instructions on how to keep your likes permanent were already written in the description.\n\nIf you did not follow the instructions, please don’t complain when the likes drop. Go back and read the description.`,
  },
  {
    id: 'drop-followers-warning',
    title: 'Drop Followers - Service Info',
    content: `If you bought DROP Followers, you already saw it in the description. So please don’t come and complain when the followers drop.\n\nGo back and read the service description to check what you bought. If you want NON-DROP Followers, buy the Non-Drop service with all due respect.`,
  },
  {
    id: 'refunding-delaying-orders',
    title: 'Order Refunding / Delaying - Instructions',
    content: `If your order keeps refunding, check that your link and account are not private, then retry.\n\nSometimes, an order may delay for one or two accounts.\n\nIf you retry and it still keeps delaying, send your Order ID. We will cancel it, then you can try again.`,
  },
];

const STORAGE_KEY = 'boostup_admin_quick_replies';

interface QuickRepliesPopoverProps {
  onSelectReply: (content: string) => void;
}

export const QuickRepliesPopover: React.FC<QuickRepliesPopoverProps> = ({ onSelectReply }) => {
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState<QuickReply[]>(DEFAULT_QUICK_REPLIES);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  // Load replies from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setReplies(parsed);
        }
      }
    } catch (err) {
      console.error('Error loading quick replies from localStorage:', err);
    }
  }, []);

  const saveReplies = (updated: QuickReply[]) => {
    setReplies(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error('Error saving quick replies to localStorage:', err);
    }
  };

  const filteredReplies = useMemo(() => {
    if (!searchQuery.trim()) return replies;
    const q = searchQuery.toLowerCase();
    return replies.filter(
      (r) => r.title.toLowerCase().includes(q) || r.content.toLowerCase().includes(q)
    );
  }, [replies, searchQuery]);

  const handleSelect = (content: string) => {
    onSelectReply(content);
    setOpen(false);
    toast.success('Quick reply inserted');
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) {
      toast.error('Title and message content are required');
      return;
    }

    const newReply: QuickReply = {
      id: `custom-${Date.now()}`,
      title: newTitle.trim(),
      content: newContent.trim(),
      isCustom: true,
    };

    const updated = [...replies, newReply];
    saveReplies(updated);
    setNewTitle('');
    setNewContent('');
    setIsAdding(false);
    toast.success('Custom quick reply added');
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = replies.filter((r) => r.id !== id);
    saveReplies(updated);
    toast.success('Quick reply deleted');
  };

  const handleResetDefaults = () => {
    saveReplies(DEFAULT_QUICK_REPLIES);
    toast.success('Quick replies reset to defaults');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-10 w-10 p-0 rounded-full text-amber-500 hover:text-amber-600 hover:bg-amber-50 flex-shrink-0 transition-colors"
          title="Quick Replies"
          aria-label="Quick Replies"
        >
          <Zap className="w-5 h-5 fill-amber-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-80 sm:w-96 p-0 shadow-2xl border border-gray-200 bg-white rounded-xl overflow-hidden mb-2 z-50"
      >
        {/* Header */}
        <div className="p-3 bg-gradient-to-r from-amber-500 to-amber-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 fill-white text-white" />
            <span className="font-semibold text-sm">Quick Replies</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsAdding(!isAdding)}
              className="h-7 px-2 text-xs text-white hover:bg-white/20 hover:text-white rounded"
              title={isAdding ? 'Cancel adding' : 'Add custom template'}
            >
              {isAdding ? <X className="w-3.5 h-3.5 mr-1" /> : <Plus className="w-3.5 h-3.5 mr-1" />}
              {isAdding ? 'Cancel' : 'New'}
            </Button>
          </div>
        </div>

        {/* Add New Reply Form */}
        {isAdding ? (
          <form onSubmit={handleCreate} className="p-3 space-y-2 border-b bg-amber-50/50">
            <div className="text-xs font-semibold text-amber-900">Add New Quick Reply</div>
            <Input
              placeholder="Title (e.g. Password Reset Instructions)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="h-8 text-xs bg-white"
              autoFocus
            />
            <textarea
              rows={3}
              placeholder="Full message text..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              className="w-full text-xs p-2 rounded-md border border-gray-300 bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsAdding(false)}
                className="h-7 px-2 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="h-7 px-3 text-xs bg-amber-600 hover:bg-amber-700 text-white"
              >
                <Check className="w-3 h-3 mr-1" /> Save
              </Button>
            </div>
          </form>
        ) : (
          /* Search Bar */
          <div className="p-2 border-b border-gray-100 bg-gray-50/50">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs bg-white border-gray-200 focus-visible:ring-amber-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Replies List */}
        <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 p-1">
          {filteredReplies.length === 0 ? (
            <div className="p-6 text-center text-xs text-gray-500">
              No matching quick replies found.
            </div>
          ) : (
            filteredReplies.map((reply) => (
              <div
                key={reply.id}
                onClick={() => handleSelect(reply.content)}
                className="p-2.5 hover:bg-amber-50/60 rounded-lg cursor-pointer transition-colors group relative flex flex-col gap-1 text-left"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-xs text-gray-900 group-hover:text-amber-900 line-clamp-1">
                    {reply.title}
                  </span>
                  {reply.isCustom && (
                    <button
                      type="button"
                      onClick={(e) => handleDelete(reply.id, e)}
                      title="Delete custom template"
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-600 text-gray-400 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 group-hover:text-gray-700 line-clamp-2 leading-relaxed whitespace-pre-line">
                  {reply.content}
                </p>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-2 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
          <span>Click to insert into message</span>
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="Reset to default templates"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
