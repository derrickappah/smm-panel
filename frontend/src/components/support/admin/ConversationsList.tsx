import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '../StatusBadge';
import { formatDistanceToNow } from 'date-fns';
import type { Conversation, ConversationFilters } from '@/types/support';

interface ConversationsListProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  filters: ConversationFilters;
}

export const ConversationsList: React.FC<ConversationsListProps> = ({
  conversations,
  currentConversationId,
  onSelectConversation,
  filters,
}) => {
  const filteredConversations = useMemo(() => {
    return conversations.filter((conv) => {
      // Status filter
      if (filters.status && conv.status !== filters.status) {
        return false;
      }

      // Priority filter
      if (filters.priority && conv.priority !== filters.priority) {
        return false;
      }

      // Assignment filter
      if (filters.assigned_to === 'unassigned' && conv.assigned_to !== null) {
        return false;
      }
      if (filters.assigned_to && filters.assigned_to !== 'unassigned' && conv.assigned_to !== filters.assigned_to) {
        return false;
      }

      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesUser = conv.user?.name?.toLowerCase().includes(searchLower) ||
          conv.user?.email?.toLowerCase().includes(searchLower);
        const matchesSubject = conv.subject?.toLowerCase().includes(searchLower);
        if (!matchesUser && !matchesSubject) {
          return false;
        }
      }

      return true;
    });
  }, [conversations, filters]);

  return (
    <div className="h-full overflow-y-auto">
      {filteredConversations.length === 0 ? (
        <div className="p-4 text-center text-gray-500">
          <p>No conversations found</p>
        </div>
      ) : (
        <div className="space-y-2 p-2">
          {filteredConversations.map((conversation) => (
            <Card
              key={conversation.id}
              className={`cursor-pointer transition-colors ${
                currentConversationId === conversation.id
                  ? 'bg-indigo-50 border-indigo-200'
                  : 'hover:bg-gray-50'
              }`}
              onClick={() => onSelectConversation(conversation.id)}
            >
              <CardContent className="p-4">
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {conversation.subject || 'No subject'}
                      </p>
                      {conversation.user && (
                        <p className="text-sm text-gray-600 truncate">
                          {conversation.user.name || conversation.user.email}
                        </p>
                      )}
                    </div>
                    {conversation.unread_count && conversation.unread_count > 0 && (
                      <Badge className="bg-red-500 text-white">
                        {conversation.unread_count}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={conversation.status} />
                    <Badge variant="outline" className="text-xs">
                      {conversation.priority}
                    </Badge>
                  </div>

                  {conversation.last_message_at && (
                    <p className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

