import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Filter, ArrowUpDown } from 'lucide-react';
import type { TicketStatus, TicketCategory } from '@/types/support';
import { ticketSubcategories, getSubcategoriesForCategory } from '@/data/ticketSubcategories';

export type SortOption = 'date-desc' | 'date-asc' | 'status' | 'unread-desc' | 'unread-asc';

interface TicketFiltersProps {
  filters: {
    status?: TicketStatus | 'all';
    category?: TicketCategory | 'all';
    subcategory?: string | 'all';
    unread?: 'all' | 'unread' | 'read';
    unreplied?: 'all' | 'unreplied' | 'replied';
    sortBy?: SortOption;
    search?: string;
  };
  onFiltersChange: (filters: {
    status?: TicketStatus | 'all';
    category?: TicketCategory | 'all';
    subcategory?: string | 'all';
    unread?: 'all' | 'unread' | 'read';
    unreplied?: 'all' | 'unreplied' | 'replied';
    sortBy?: SortOption;
    search?: string;
  }) => void;
}

export const TicketFilters: React.FC<TicketFiltersProps> = ({
  filters,
  onFiltersChange,
}) => {
  const selectedCategory = filters.category || 'all';
  const availableSubcategories = selectedCategory !== 'all' 
    ? getSubcategoriesForCategory(selectedCategory as TicketCategory)
    : [];

  const handleCategoryChange = (value: string) => {
    const newCategory = value === 'all' ? 'all' : (value as TicketCategory);
    // Reset subcategory when category changes
    onFiltersChange({
      ...filters,
      category: newCategory,
      subcategory: 'all',
    });
  };

  return (
    <div className="space-y-4 p-4 border-b border-gray-200">
      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        {/* Status filter */}
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block flex items-center gap-1">
            <Filter className="w-3 h-3" />
            Status
          </label>
          <Select
            value={filters.status || 'all'}
            onValueChange={(value) =>
              onFiltersChange({ ...filters, status: value === 'all' ? 'all' : (value as TicketStatus) })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Replied">Replied</SelectItem>
              <SelectItem value="Closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Category filter */}
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">Category</label>
          <Select
            value={selectedCategory}
            onValueChange={handleCategoryChange}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="order">Order</SelectItem>
              <SelectItem value="payment">Payment</SelectItem>
              <SelectItem value="account">Account</SelectItem>
              <SelectItem value="complaint">Complaint</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Subcategory filter */}
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">Subcategory</label>
          <Select
            value={filters.subcategory || 'all'}
            onValueChange={(value) =>
              onFiltersChange({ ...filters, subcategory: value === 'all' ? 'all' : value })
            }
            disabled={selectedCategory === 'all' || availableSubcategories.length === 0}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subcategories</SelectItem>
              {availableSubcategories.map((subcategory) => (
                <SelectItem key={subcategory} value={subcategory}>
                  {subcategory}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Unread filter */}
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">Unread</label>
          <Select
            value={filters.unread || 'all'}
            onValueChange={(value) =>
              onFiltersChange({ ...filters, unread: value as 'all' | 'unread' | 'read' })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="read">Read</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Unreplied filter */}
        <div>
          <label className="text-xs font-medium text-gray-700 mb-1 block">Unreplied</label>
          <Select
            value={filters.unreplied || 'all'}
            onValueChange={(value) =>
              onFiltersChange({ ...filters, unreplied: value as 'all' | 'unreplied' | 'replied' })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unreplied">Unreplied</SelectItem>
              <SelectItem value="replied">Replied</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Sort */}
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-gray-700 flex items-center gap-1">
          <ArrowUpDown className="w-3 h-3" />
          Sort By
        </label>
        <Select
          value={filters.sortBy || 'date-desc'}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, sortBy: value as SortOption })
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date-desc">Newest First</SelectItem>
            <SelectItem value="date-asc">Oldest First</SelectItem>
            <SelectItem value="status">By Status</SelectItem>
            <SelectItem value="unread-desc">Most Unread</SelectItem>
            <SelectItem value="unread-asc">Least Unread</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

