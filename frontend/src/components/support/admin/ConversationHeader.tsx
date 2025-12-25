import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
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
}

export const ConversationHeader: React.FC<ConversationHeaderProps> = ({
  conversation,
  onStatusChange,
  onPriorityChange,
  onAssignmentChange,
  onAddTag,
  onRemoveTag,
  disabled = false,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true); // Collapsed by default

  return (
    <div className="border-b border-gray-200">
      {/* Always visible header */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex-1">
          <h2 className="text-lg font-semibold">
            {conversation.subject || 'Support Conversation'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <ConnectionStatus />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="h-8 w-8 p-0"
            aria-label={isCollapsed ? 'Expand details' : 'Collapse details'}
          >
            {isCollapsed ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
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

