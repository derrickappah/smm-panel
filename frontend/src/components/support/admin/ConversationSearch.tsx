import React from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter } from 'lucide-react';
import type { ConversationFilters, ConversationStatus, MessagePriority } from '@/types/support';

interface ConversationSearchProps {
  filters: ConversationFilters;
  onFiltersChange: (filters: ConversationFilters) => void;
}

export const ConversationSearch: React.FC<ConversationSearchProps> = ({
  filters,
  onFiltersChange,
}) => {
  return (
    <div className="space-y-4 p-4 border-b border-gray-200">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          type="text"
          placeholder="Search by user, subject, or message..."
          value={filters.search || ''}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          className="pl-10 w-full"
        />
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        {/* Status filter */}
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block flex items-center gap-1">
            <Filter className="w-3 h-3" />
            Status
          </label>
          <Select
            value={filters.status || 'all'}
            onValueChange={(value) =>
              onFiltersChange({ ...filters, status: value === 'all' ? undefined : (value as ConversationStatus) })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Priority filter */}
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">Priority</label>
          <Select
            value={filters.priority || 'all'}
            onValueChange={(value) =>
              onFiltersChange({ ...filters, priority: value === 'all' ? undefined : (value as MessagePriority) })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Assignment filter */}
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">Assignment</label>
          <Select
            value={filters.assigned_to || 'all'}
            onValueChange={(value) =>
              onFiltersChange({ ...filters, assigned_to: value === 'all' ? undefined : value })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {/* Add admin options here if needed */}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};

