import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Filter } from 'lucide-react';
import type { TicketStatus, TicketCategory } from '@/types/support';
import { ticketSubcategories, getSubcategoriesForCategory } from '@/data/ticketSubcategories';

interface TicketFiltersProps {
  filters: {
    status?: TicketStatus | 'all';
    category?: TicketCategory | 'all';
    subcategory?: string | 'all';
    search?: string;
  };
  onFiltersChange: (filters: {
    status?: TicketStatus | 'all';
    category?: TicketCategory | 'all';
    subcategory?: string | 'all';
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
      </div>
    </div>
  );
};

