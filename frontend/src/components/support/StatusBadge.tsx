import React from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Clock, MessageSquare } from 'lucide-react';
import type { ConversationStatus, TicketStatus } from '@/types/support';

interface StatusBadgeProps {
  status: ConversationStatus | TicketStatus;
  className?: string;
}

const conversationStatusConfig = {
  open: {
    label: 'Open',
    className: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    icon: Clock,
  },
  closed: {
    label: 'Closed',
    className: 'bg-gray-100 text-gray-700 border-gray-200',
    icon: XCircle,
  },
  resolved: {
    label: 'Resolved',
    className: 'bg-green-100 text-green-700 border-green-200',
    icon: CheckCircle,
  },
};

const ticketStatusConfig = {
  Pending: {
    label: 'Pending',
    className: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    icon: Clock,
  },
  Replied: {
    label: 'Replied',
    className: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: MessageSquare,
  },
  Closed: {
    label: 'Closed',
    className: 'bg-gray-100 text-gray-700 border-gray-200',
    icon: XCircle,
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  // Check if it's a ticket status
  const isTicketStatus = status === 'Pending' || status === 'Replied' || status === 'Closed';
  const config = isTicketStatus 
    ? ticketStatusConfig[status as TicketStatus] || ticketStatusConfig.Pending
    : conversationStatusConfig[status as ConversationStatus] || conversationStatusConfig.open;
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={`${config.className} ${className} flex items-center gap-1.5`}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
};

