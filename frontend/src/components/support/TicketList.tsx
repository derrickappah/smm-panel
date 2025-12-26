import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from './StatusBadge';
import { formatDistanceToNow } from 'date-fns';
import type { Ticket } from '@/types/support';

interface TicketListProps {
  tickets: Ticket[];
  currentTicketId: string | null;
  onSelectTicket: (ticketId: string) => void;
}

export const TicketList: React.FC<TicketListProps> = ({
  tickets,
  currentTicketId,
  onSelectTicket,
}) => {
  if (tickets.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p>No tickets found</p>
        <p className="text-sm mt-2">Create a new ticket to get started</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto overscroll-contain" style={{ scrollbarWidth: 'thin' }}>
      <div className="space-y-2 p-2">
        {tickets.map((ticket) => (
          <Card
            key={ticket.id}
            className={`cursor-pointer transition-colors touch-manipulation ${
              currentTicketId === ticket.id
                ? 'bg-purple-50 border-purple-200'
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
                        Ticket #{ticket.id.slice(0, 8)}
                      </p>
                      <StatusBadge status={ticket.status} />
                    </div>
                    <p className="text-sm font-semibold text-gray-900">
                      {ticket.category}
                    </p>
                    {ticket.order_id && (
                      <p className="text-xs text-gray-600 mt-1">
                        Order: {ticket.order_id}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {formatDistanceToNow(new Date(ticket.last_message_at), { addSuffix: true })}
                  </span>
                  {ticket.status === 'Pending' && (
                    <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
                      Waiting for admin reply...
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

