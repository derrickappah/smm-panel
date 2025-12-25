import React from 'react';
import { StatusBadge } from '../StatusBadge';
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
  return (
    <div className="border-b border-gray-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {conversation.subject || 'Support Conversation'}
          </h2>
          {conversation.user && (
            <p className="text-sm text-gray-600">
              {conversation.user.name || conversation.user.email}
            </p>
          )}
        </div>
        <StatusBadge status={conversation.status} />
      </div>

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
  );
};

