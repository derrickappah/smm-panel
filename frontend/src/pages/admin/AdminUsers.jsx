import React, { memo, useState, useMemo, useCallback, useEffect } from 'react';
import { useAdminUsers, useUpdateUser } from '@/hooks/useAdminUsers';
import { useDebounce } from '@/hooks/useDebounce';
import VirtualizedList from '@/components/VirtualizedList';
import UserEditForm from '@/components/admin/UserEditForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, RefreshCw, Edit, Download } from 'lucide-react';
import { toast } from 'sonner';

const ITEMS_PER_PAGE = 50;
const VIRTUAL_SCROLL_THRESHOLD = 100;

const AdminUsers = memo(({ onRefresh, refreshing = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [editingUser, setEditingUser] = useState(null);
  const [exportFormat, setExportFormat] = useState('name-phone');

  const debouncedSearch = useDebounce(searchTerm, 300);

  // Use infinite query for pagination
  const { 
    data, 
    isLoading, 
    fetchNextPage, 
    hasNextPage,
    isFetchingNextPage,
    refetch
  } = useAdminUsers({ 
    enabled: true, 
    useInfinite: true 
  });

  const updateUserMutation = useUpdateUser();

  // Flatten all pages into a single array
  const allUsers = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap(page => page.data || []);
  }, [data]);

  // Get total count from first page
  const totalCount = useMemo(() => {
    return data?.pages?.[0]?.total || allUsers.length;
  }, [data, allUsers.length]);

  // Filter users
  const filteredUsers = useMemo(() => {
    let filtered = [...allUsers];

    // Search filter
    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase();
      filtered = filtered.filter(user => {
        const name = (user.name || '').toLowerCase();
        const email = (user.email || '').toLowerCase();
        const phone = (user.phone_number || '').toLowerCase();
        return name.includes(searchLower) || email.includes(searchLower) || phone.includes(searchLower);
      });
    }

    // Date filter
    if (dateFilter) {
      const filterDate = new Date(dateFilter);
      filterDate.setHours(0, 0, 0, 0);
      const filterDateEnd = new Date(filterDate);
      filterDateEnd.setHours(23, 59, 59, 999);
      
      filtered = filtered.filter(user => {
        const userDate = new Date(user.created_at);
        return userDate >= filterDate && userDate <= filterDateEnd;
      });
    }

    return filtered;
  }, [allUsers, debouncedSearch, dateFilter]);

  // Paginate filtered results
  const paginatedUsers = useMemo(() => {
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredUsers.slice(startIndex, endIndex);
  }, [filteredUsers, page]);

  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
  const displayTotal = filteredUsers.length;

  // Load all pages when there are no filters (to show accurate total count)
  useEffect(() => {
    if (!isLoading && hasNextPage && !isFetchingNextPage && !debouncedSearch && !dateFilter) {
      // Load all remaining pages to get accurate total count
      fetchNextPage();
    }
  }, [isLoading, hasNextPage, isFetchingNextPage, debouncedSearch, dateFilter, fetchNextPage]);

  // Load more pages when needed for pagination with filters
  useEffect(() => {
    if (!isLoading && hasNextPage && !isFetchingNextPage) {
      const currentPageData = allUsers.length;
      const neededData = page * ITEMS_PER_PAGE;
      
      // If we need more data than we have, fetch next page
      if (neededData > currentPageData) {
        fetchNextPage();
      }
    }
  }, [page, allUsers.length, hasNextPage, isFetchingNextPage, isLoading, fetchNextPage]);

  const handleUpdateUser = useCallback(async (userId, updates) => {
    try {
      await updateUserMutation.mutateAsync({ userId, updates });
      setEditingUser(null);
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('Failed to update user:', error);
    }
  }, [updateUserMutation, onRefresh]);

  const handleExportCSV = useCallback(() => {
    let headers, rows;
    
    if (exportFormat === 'name-phone') {
      headers = ['Name', 'Phone Number'];
      rows = filteredUsers.map(user => [
        user.name || 'N/A',
        user.phone_number || 'N/A'
      ]);
    } else {
      headers = ['Name', 'Email'];
      rows = filteredUsers.map(user => [
        user.name || 'N/A',
        user.email || 'N/A'
      ]);
    }

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    const formatLabel = exportFormat === 'name-phone' ? 'name-phone' : 'name-email';
    link.setAttribute('download', `users_${formatLabel}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Users exported successfully');
  }, [filteredUsers, exportFormat]);

  const renderUserRow = useCallback((user, index) => {
    if (editingUser?.id === user.id) {
      return (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <UserEditForm 
            user={user} 
            onSave={(updates) => handleUpdateUser(user.id, updates)}
            onCancel={() => setEditingUser(null)}
          />
        </div>
      );
    }

    return (
      <div className="grid grid-cols-12 gap-4 p-4 items-center bg-white hover:bg-gray-50 transition-colors border-b border-gray-200">
        <div className="col-span-2">
          <p className="font-medium text-gray-900 break-words">{user.name}</p>
        </div>
        <div className="col-span-3">
          <p className="text-sm text-gray-700 break-all">{user.email}</p>
        </div>
        <div className="col-span-2">
          <p className="text-sm text-gray-700 break-words">{user.phone_number || 'N/A'}</p>
        </div>
        <div className="col-span-1">
          <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${
            user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
          }`}>
            {user.role}
          </span>
        </div>
        <div className="col-span-1">
          <p className="font-semibold text-gray-900 whitespace-nowrap">₵{user.balance?.toFixed(2) || '0.00'}</p>
        </div>
        <div className="col-span-2">
          <p className="text-sm text-gray-700 whitespace-nowrap">{new Date(user.created_at).toLocaleDateString()}</p>
          <p className="text-xs text-gray-500 whitespace-nowrap">{new Date(user.created_at).toLocaleTimeString()}</p>
        </div>
        <div className="col-span-1">
          <Button
            onClick={() => setEditingUser(user)}
            variant="outline"
            size="sm"
            className="text-xs whitespace-nowrap"
          >
            <Edit className="w-3 h-3 mr-1" />
            Edit
          </Button>
        </div>
      </div>
    );
  }, [editingUser, handleUpdateUser]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-600"></div>
      </div>
    );
  }

  const useVirtualScroll = filteredUsers.length > VIRTUAL_SCROLL_THRESHOLD;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-4 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">All Users</h2>
            <Button
              onClick={() => {
                refetch();
                if (onRefresh) onRefresh();
              }}
              disabled={refreshing}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <div className="flex items-center gap-2">
              <Select value={exportFormat} onValueChange={setExportFormat}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Export format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name-phone">Name & Phone</SelectItem>
                  <SelectItem value="name-email">Name & Email</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={handleExportCSV}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                disabled={filteredUsers.length === 0}
              >
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
            </div>
          </div>
        </div>
        {/* Search and Date Filter */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search by username, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <div>
            <Input
              type="date"
              placeholder="Filter by date"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setPage(1);
              }}
              className="w-full"
            />
          </div>
        </div>
      </div>

      {filteredUsers.length === 0 ? (
        <p className="text-gray-600 text-center py-8">No users found</p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-gray-200">
            {useVirtualScroll ? (
              <div className="min-w-[1200px]">
                <div className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                  <div className="grid grid-cols-12 gap-4 p-4 font-semibold text-sm">
                    <div className="col-span-2">Name</div>
                    <div className="col-span-3">Email</div>
                    <div className="col-span-2">Phone</div>
                    <div className="col-span-1">Role</div>
                    <div className="col-span-1">Balance</div>
                    <div className="col-span-2">Joined Date</div>
                    <div className="col-span-1">Actions</div>
                  </div>
                </div>
                <VirtualizedList
                  items={paginatedUsers}
                  renderItem={renderUserRow}
                  itemHeight={80}
                  height={600}
                />
              </div>
            ) : (
              <div className="max-h-[600px] overflow-y-auto overflow-x-auto">
                <div className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10 min-w-[1200px]">
                  <div className="grid grid-cols-12 gap-4 p-4 font-semibold text-sm">
                    <div className="col-span-2">Name</div>
                    <div className="col-span-3">Email</div>
                    <div className="col-span-2">Phone</div>
                    <div className="col-span-1">Role</div>
                    <div className="col-span-1">Balance</div>
                    <div className="col-span-2">Joined Date</div>
                    <div className="col-span-1">Actions</div>
                  </div>
                </div>
                <div className="divide-y divide-gray-200/50 min-w-[1200px]">
                  {paginatedUsers.map((user) => (
                    <div key={user.id}>
                      {renderUserRow(user)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-gray-600">
              Showing {(page - 1) * ITEMS_PER_PAGE + 1} to {Math.min(page * ITEMS_PER_PAGE, displayTotal)} of {displayTotal} users
              {hasNextPage && !isFetchingNextPage && (
                <span className="ml-2 text-xs text-gray-500">(Loading more...)</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                disabled={page === 1}
                variant="outline"
                size="sm"
              >
                Previous
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (page <= 3) {
                    pageNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = page - 2 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      onClick={() => setPage(pageNum)}
                      variant={page === pageNum ? "default" : "outline"}
                      size="sm"
                      className={page === pageNum ? "bg-indigo-600 hover:bg-indigo-700 text-white" : ""}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button
                onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                disabled={page === totalPages}
                variant="outline"
                size="sm"
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

AdminUsers.displayName = 'AdminUsers';

export default AdminUsers;


