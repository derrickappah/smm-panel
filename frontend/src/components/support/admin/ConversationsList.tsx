import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '../StatusBadge';
import { formatDistanceToNow } from 'date-fns';
import { Loader2 } from 'lucide-react';
import type { Conversation, ConversationFilters } from '@/types/support';

interface ConversationsListProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  filters: ConversationFilters;
  hasMoreConversations?: boolean;
  isLoadingMoreConversations?: boolean;
  onLoadMore?: () => void;
}

export const ConversationsList: React.FC<ConversationsListProps> = ({
  conversations,
  currentConversationId,
  onSelectConversation,
  filters,
  hasMoreConversations = false,
  isLoadingMoreConversations = false,
  onLoadMore,
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
    <div className="h-full overflow-y-auto overscroll-contain" style={{ scrollbarWidth: 'thin' }}>
      {filteredConversations.length === 0 ? (
        <div className="p-4 text-center text-gray-500">
          <p>No conversations found</p>
        </div>
      ) : (
        <div className="space-y-2 p-2 md:p-2">
          {filteredConversations.map((conversation) => {
            const userName = conversation.user?.name || conversation.user?.email || 'Unknown User';
            const subject = conversation.subject || 'No subject';
            const showSubject = subject !== userName;
            const initials = userName
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .substring(0, 2);

            return (
              <Card
                key={conversation.id}
                className={`cursor-pointer transition-all duration-200 border-l-4 touch-manipulation hover:shadow-md ${
                  currentConversationId === conversation.id
                    ? 'bg-indigo-50 border-indigo-500 shadow-sm'
                    : 'hover:bg-gray-50 active:bg-gray-100 border-transparent'
                }`}
                onClick={() => onSelectConversation(conversation.id)}
              >
                <CardContent className="p-3 md:p-4">
                  <div className="flex gap-3">
                    {/* User Avatar/Initials */}
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm border border-indigo-200">
                        {initials}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 truncate">
                            {userName}
                          </p>
                          {showSubject && (
                            <p className="text-sm text-gray-500 truncate leading-tight">
                              {subject}
                            </p>
                          )}
                        </div>
                        {conversation.unread_count && conversation.unread_count > 0 && (
                          <Badge className="bg-red-500 text-white hover:bg-red-600 rounded-full h-5 min-w-[20px] flex items-center justify-center px-1 text-[10px]">
                            {conversation.unread_count}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        <StatusBadge status={conversation.status} />
                        <Badge variant="outline" className={`text-[10px] h-5 px-1.5 font-normal capitalize ${
                          conversation.priority === 'urgent' ? 'text-red-600 border-red-200 bg-red-50' :
                          conversation.priority === 'high' ? 'text-orange-600 border-orange-200 bg-orange-50' :
                          'text-gray-600 border-gray-200 bg-white'
                        }`}>
                          {conversation.priority}
                        </Badge>
                      </div>

                      {conversation.last_message_at && (
                        <div className="flex items-center text-[11px] text-gray-400 pt-1">
                          <span>{formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true })}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          
          {/* Load More Button */}
          {hasMoreConversations && (
            <div className="p-4 flex justify-center">
              <Button
                variant="outline"
                onClick={onLoadMore}
                disabled={isLoadingMoreConversations}
                className="w-full"
              >
                {isLoadingMoreConversations ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Load More Conversations'
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

