import React from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import type { ConversationStatus } from '@/types/support';

interface StatusBadgeProps {
  status: ConversationStatus;
  className?: string;
}

const statusConfig = {
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

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const config = statusConfig[status] || statusConfig.open;
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

