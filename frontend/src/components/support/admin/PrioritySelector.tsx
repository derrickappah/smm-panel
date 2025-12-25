import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, ArrowDown, ArrowUp, Zap } from 'lucide-react';
import type { MessagePriority } from '@/types/support';

interface PrioritySelectorProps {
  priority: MessagePriority;
  onPriorityChange: (priority: MessagePriority) => void;
  disabled?: boolean;
}

const priorityConfig = {
  low: { label: 'Low', icon: ArrowDown, color: 'text-gray-600' },
  medium: { label: 'Medium', icon: AlertCircle, color: 'text-blue-600' },
  high: { label: 'High', icon: ArrowUp, color: 'text-orange-600' },
  urgent: { label: 'Urgent', icon: Zap, color: 'text-red-600' },
};

export const PrioritySelector: React.FC<PrioritySelectorProps> = ({
  priority,
  onPriorityChange,
  disabled = false,
}) => {
  const config = priorityConfig[priority];
  const Icon = config.icon;

  return (
    <Select
      value={priority}
      onValueChange={(value) => onPriorityChange(value as MessagePriority)}
      disabled={disabled}
    >
      <SelectTrigger className="w-40">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${config.color}`} />
          <SelectValue />
        </div>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(priorityConfig).map(([value, config]) => {
          const IconComponent = config.icon;
          return (
            <SelectItem key={value} value={value}>
              <div className="flex items-center gap-2">
                <IconComponent className={`w-4 h-4 ${config.color}`} />
                {config.label}
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
};

