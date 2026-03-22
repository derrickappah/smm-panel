import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConnectionStatus } from '../ConnectionStatus';
import { PrioritySelector } from './PrioritySelector';
import { ConversationAssignment } from './ConversationAssignment';
import { ConversationTags } from './ConversationTags';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Conversation, ConversationStatus, MessagePriority } from '@/types/support';

interface ConversationHeaderProps {
  conversation: Conversation;
  onStatusChange: (status: ConversationStatus) => void;
  onPriorityChange: (priority: MessagePriority) => void;
  onAssignmentChange: (adminId: string) => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  disabled?: boolean;
  onBackToList?: () => void;
}

export const ConversationHeader: React.FC<ConversationHeaderProps> = ({
  conversation,
  onStatusChange,
  onPriorityChange,
  onAssignmentChange,
  onAddTag,
  onRemoveTag,
  disabled = false,
  onBackToList,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true); // Collapsed by default

  return (
    <div className="border-b border-gray-200 bg-white">
      {/* Always visible header */}
      <div className="p-3 md:p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Mobile back button */}
          {onBackToList && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBackToList}
              className="h-9 w-9 p-0 flex-shrink-0 md:hidden text-gray-500 hover:text-gray-700"
              aria-label="Back to conversations"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 truncate">
              {conversation.subject || 'Support Conversation'}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-500">Member ID: {conversation.user_id.substring(0, 8)}...</span>
              <span className="text-gray-300">•</span>
              <ConnectionStatus userId={conversation.user_id} conversationId={conversation.id} />
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0">
          {conversation.status !== 'resolved' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStatusChange('resolved')}
              className="hidden sm:flex h-9 border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800"
              disabled={disabled}
            >
              Mark Resolved
            </Button>
          )}
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`h-9 w-9 p-0 transition-colors ${!isCollapsed ? 'bg-gray-100' : ''}`}
            aria-label={isCollapsed ? 'Expand details' : 'Collapse details'}
          >
            {isCollapsed ? (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronUp className="h-4 w-4 text-gray-500" />
            )}
          </Button>
        </div>
      </div>

      {/* Collapsible content */}
      {!isCollapsed && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Status */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Status</label>
              <Select
                value={conversation.status}
                onValueChange={(value) => onStatusChange(value as ConversationStatus)}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Priority */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Priority</label>
              <PrioritySelector
                priority={conversation.priority}
                onPriorityChange={onPriorityChange}
                disabled={disabled}
              />
            </div>

            {/* Assignment */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-1 block">Assigned To</label>
              <ConversationAssignment
                conversationId={conversation.id}
                assignedTo={conversation.assigned_to}
                onAssignmentChange={onAssignmentChange}
                disabled={disabled}
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-medium text-gray-700 mb-1 block">Tags</label>
            <ConversationTags
              tags={conversation.tags || []}
              onAddTag={onAddTag}
              onRemoveTag={onRemoveTag}
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </div>
  );
};

