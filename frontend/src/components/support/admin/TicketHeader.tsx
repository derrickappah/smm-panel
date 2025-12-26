import React from 'react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '../StatusBadge';
import { X, MessageSquare } from 'lucide-react';
import { useSupport } from '@/contexts/support-context';
import type { Ticket } from '@/types/support';
import { format } from 'date-fns';

const formatCategory = (category: string): string => {
  return category.charAt(0).toUpperCase() + category.slice(1);
};

interface TicketHeaderProps {
  ticket: Ticket;
  onBackToList?: () => void;
}

export const TicketHeader: React.FC<TicketHeaderProps> = ({ ticket, onBackToList }) => {
  const { closeTicket, isAdmin } = useSupport();

  const handleCloseTicket = async () => {
    if (window.confirm('Are you sure you want to close this ticket?')) {
      await closeTicket(ticket.id);
    }
  };

  return (
    <div className="border-b border-gray-200 p-4 bg-white">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-lg font-semibold">Ticket #{ticket.id.slice(0, 8)}</h2>
            <StatusBadge status={ticket.status} />
          </div>
          <div className="space-y-1 text-sm text-gray-600">
            <p><span className="font-medium">Category:</span> {formatCategory(ticket.category)}</p>
            {ticket.subcategory && (
              <p><span className="font-medium">Subcategory:</span> {ticket.subcategory}</p>
            )}
            {ticket.order_id && (
              <p><span className="font-medium">Order ID:</span> {ticket.order_id}</p>
            )}
            <p><span className="font-medium">Created:</span> {format(new Date(ticket.created_at), 'PPp')}</p>
            {ticket.user && (
              <p><span className="font-medium">User:</span> {ticket.user.name || ticket.user.email}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && ticket.status !== 'Closed' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCloseTicket}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <X className="w-4 h-4 mr-1" />
              Close Ticket
            </Button>
          )}
          {onBackToList && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBackToList}
              className="md:hidden"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

