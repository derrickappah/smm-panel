import React, { memo, useState, useMemo, useCallback, useEffect } from 'react';
import { useAdminUsers, useUpdateUser } from '@/hooks/useAdminUsers';
import { useDebounce } from '@/hooks/useDebounce';
import VirtualizedList from '@/components/VirtualizedList';
import ResponsiveTable from '@/components/admin/ResponsiveTable';
import UserEditForm from '@/components/admin/UserEditForm';
import UserDetailsDialog from '@/components/admin/UserDetailsDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, RefreshCw, Edit, Download, Eye } from 'lucide-react';
import { toast } from 'sonner';

const ITEMS_PER_PAGE = 50;
const VIRTUAL_SCROLL_THRESHOLD = 100;

const AdminUsers = memo(({ onRefresh, refreshing = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [editingUser, setEditingUser] = useState(null);
  const [exportFormat, setExportFormat] = useState('name-phone');
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);

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

  const handleViewUserDetails = useCallback((user) => {
    setSelectedUserId(user.id);
    setIsDetailsDialogOpen(true);
  }, []);

  const handleCloseDetailsDialog = useCallback(() => {
    setIsDetailsDialogOpen(false);
    setSelectedUserId(null);
  }, []);

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

  const renderTableHeader = useCallback(() => (
    <div className="grid grid-cols-12 gap-4 p-4 font-semibold text-sm min-w-[1200px]">
      <div className="col-span-2 min-w-[150px]">Name</div>
      <div className="col-span-3 min-w-[200px]">Email</div>
      <div className="col-span-2 min-w-[120px]">Phone</div>
      <div className="col-span-1 min-w-[80px]">Role</div>
      <div className="col-span-1 min-w-[100px]">Balance</div>
      <div className="col-span-2 min-w-[150px]">Joined Date</div>
      <div className="col-span-1 min-w-[150px]">Actions</div>
    </div>
  ), []);

  const renderTableRow = useCallback((user, index) => {
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
      <div 
        className="grid grid-cols-12 gap-4 p-4 items-center bg-white hover:bg-gray-50 transition-colors border-b border-gray-200 min-w-[1200px] cursor-pointer"
        onClick={(e) => {
          // Don't trigger if clicking on buttons
          if (!e.target.closest('button')) {
            handleViewUserDetails(user);
          }
        }}
      >
        <div className="col-span-2 min-w-[150px]">
          <p className="font-medium text-gray-900 break-words">{user.name}</p>
        </div>
        <div className="col-span-3 min-w-[200px]">
          <p className="text-sm text-gray-700 break-all">{user.email}</p>
        </div>
        <div className="col-span-2 min-w-[120px]">
          <p className="text-sm text-gray-700 break-words">{user.phone_number || 'N/A'}</p>
        </div>
        <div className="col-span-1 min-w-[80px]">
          <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${
            user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
          }`}>
            {user.role}
          </span>
        </div>
        <div className="col-span-1 min-w-[100px]">
          <p className="font-semibold text-gray-900 whitespace-nowrap">₵{user.balance?.toFixed(2) || '0.00'}</p>
        </div>
        <div className="col-span-2 min-w-[150px]">
          <p className="text-sm text-gray-700 whitespace-nowrap">{new Date(user.created_at).toLocaleDateString()}</p>
          <p className="text-xs text-gray-500 whitespace-nowrap">{new Date(user.created_at).toLocaleTimeString()}</p>
        </div>
        <div className="col-span-1 min-w-[100px] flex gap-2">
          <Button
            onClick={(e) => {
              e.stopPropagation();
              handleViewUserDetails(user);
            }}
            variant="outline"
            size="sm"
            className="text-xs whitespace-nowrap min-h-[44px]"
            title="View Details"
          >
            <Eye className="w-4 h-4 mr-1" />
            View
          </Button>
          <Button
            onClick={(e) => {
              e.stopPropagation();
              setEditingUser(user);
            }}
            variant="outline"
            size="sm"
            className="text-xs whitespace-nowrap min-h-[44px]"
            title="Edit User"
          >
            <Edit className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }, [editingUser, handleUpdateUser, handleViewUserDetails]);

  const renderMobileCard = useCallback((user, index) => {
    if (editingUser?.id === user.id) {
      return (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg m-4">
          <UserEditForm 
            user={user} 
            onSave={(updates) => handleUpdateUser(user.id, updates)}
            onCancel={() => setEditingUser(null)}
          />
        </div>
      );
    }

    return (
      <div className="bg-white p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="font-semibold text-gray-900 text-base">{user.name}</p>
            <p className="text-sm text-gray-600 mt-1 break-all">{user.email}</p>
            {user.phone_number && (
              <p className="text-sm text-gray-600 mt-1">📱 {user.phone_number}</p>
            )}
          </div>
          <span className={`text-xs px-2 py-1 rounded-full h-fit ${
            user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
          }`}>
            {user.role}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200">
          <div>
            <p className="text-xs text-gray-500">Balance</p>
            <p className="font-semibold text-gray-900 text-sm">₵{user.balance?.toFixed(2) || '0.00'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Joined</p>
            <p className="text-sm text-gray-700">{new Date(user.created_at).toLocaleDateString()}</p>
          </div>
        </div>
        <div className="pt-2 border-t border-gray-200 flex gap-2">
          <Button
            onClick={() => handleViewUserDetails(user)}
            variant="outline"
            size="sm"
            className="flex-1 min-h-[44px]"
          >
            <Eye className="w-4 h-4 mr-2" />
            View Details
          </Button>
          <Button
            onClick={() => setEditingUser(user)}
            variant="outline"
            size="sm"
            className="flex-1 min-h-[44px]"
          >
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Button>
        </div>
      </div>
    );
  }, [editingUser, handleUpdateUser, handleViewUserDetails]);

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
        <div className="space-y-4">
          <div className="h-8 bg-gray-200 rounded animate-pulse w-1/3"></div>
          <div className="h-12 bg-gray-200 rounded animate-pulse"></div>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 bg-gray-200 rounded animate-pulse"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const useVirtualScroll = filteredUsers.length > VIRTUAL_SCROLL_THRESHOLD;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm w-full max-w-full overflow-hidden">
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
              className="flex items-center gap-2 min-h-[44px]"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <div className="flex items-center gap-2">
              <Select value={exportFormat} onValueChange={setExportFormat}>
                <SelectTrigger className="w-full sm:w-[180px] min-h-[44px]">
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
                className="flex items-center gap-2 min-h-[44px]"
                disabled={filteredUsers.length === 0}
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Export CSV</span>
                <span className="sm:hidden">Export</span>
              </Button>
            </div>
          </div>
        </div>
        {/* Search and Date Filter */}
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              placeholder="Search by username, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-11 h-12 text-base"
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
              className="w-full h-12 text-base"
            />
          </div>
        </div>
      </div>

      {filteredUsers.length === 0 ? (
        <p className="text-gray-600 text-center py-8">No users found</p>
      ) : (
        <>
          <ResponsiveTable
            items={paginatedUsers}
            renderTableHeader={renderTableHeader}
            renderTableRow={renderTableRow}
            renderCard={renderMobileCard}
            useVirtualScroll={useVirtualScroll}
            emptyMessage="No users found"
            minTableWidth="1200px"
          />

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

      {/* User Details Dialog */}
      <UserDetailsDialog
        userId={selectedUserId}
        open={isDetailsDialogOpen}
        onOpenChange={setIsDetailsDialogOpen}
      />
    </div>
  );
});

AdminUsers.displayName = 'AdminUsers';

export default AdminUsers;


