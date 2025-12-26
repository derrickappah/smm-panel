import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '../StatusBadge';
import { formatDistanceToNow } from 'date-fns';
import type { Ticket } from '@/types/support';

const formatCategory = (category: string): string => {
  return category.charAt(0).toUpperCase() + category.slice(1);
};

interface TicketsListProps {
  tickets: Ticket[];
  currentTicketId: string | null;
  onSelectTicket: (ticketId: string) => void;
  filters?: {
    status?: 'Pending' | 'Replied' | 'Closed' | 'all';
    category?: string | 'all';
    search?: string;
  };
  hasMoreTickets?: boolean;
  isLoadingMoreTickets?: boolean;
  onLoadMore?: () => void;
}

export const TicketsList: React.FC<TicketsListProps> = ({
  tickets,
  currentTicketId,
  onSelectTicket,
  filters = {},
  hasMoreTickets = false,
  isLoadingMoreTickets = false,
  onLoadMore,
}) => {
  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      // Status filter
      if (filters.status && filters.status !== 'all' && ticket.status !== filters.status) {
        return false;
      }

      // Category filter
      if (filters.category && filters.category !== 'all' && ticket.category !== filters.category) {
        return false;
      }

      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesUser = ticket.user?.name?.toLowerCase().includes(searchLower) ||
          ticket.user?.email?.toLowerCase().includes(searchLower);
        const matchesOrderId = ticket.order_id?.toLowerCase().includes(searchLower);
        const matchesCategory = ticket.category?.toLowerCase().includes(searchLower);
        if (!matchesUser && !matchesOrderId && !matchesCategory) {
          return false;
        }
      }

      return true;
    });
  }, [tickets, filters]);

  if (filteredTickets.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p>No tickets found</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto overscroll-contain" style={{ scrollbarWidth: 'thin' }}>
      <div className="space-y-2 p-2">
        {filteredTickets.map((ticket) => (
          <Card
            key={ticket.id}
            className={`cursor-pointer transition-colors touch-manipulation ${
              currentTicketId === ticket.id
                ? 'bg-purple-50 border-purple-200'
                : ticket.status === 'Pending'
                ? 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100'
                : 'hover:bg-gray-50 active:bg-gray-100'
            }`}
            onClick={() => onSelectTicket(ticket.id)}
          >
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-sm">
                        #{ticket.id.slice(0, 8)}
                      </p>
                      <StatusBadge status={ticket.status} />
                    </div>
                    <p className="text-sm font-semibold text-gray-900">
                      {formatCategory(ticket.category)}
                    </p>
                    {ticket.subcategory && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {ticket.subcategory}
                      </p>
                    )}
                    {ticket.user && (
                      <p className="text-xs text-gray-600 mt-1">
                        {ticket.user.name || ticket.user.email}
                      </p>
                    )}
                    {ticket.order_id && (
                      <p className="text-xs text-gray-500 mt-1">
                        Order: {ticket.order_id}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {formatDistanceToNow(new Date(ticket.last_message_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {hasMoreTickets && (
          <div className="flex justify-center p-4">
            <button
              onClick={onLoadMore}
              disabled={isLoadingMoreTickets}
              className="text-sm text-purple-600 hover:text-purple-700 disabled:opacity-50"
            >
              {isLoadingMoreTickets ? 'Loading...' : 'Load more tickets'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

