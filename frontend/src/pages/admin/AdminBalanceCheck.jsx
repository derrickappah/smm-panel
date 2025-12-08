import React, { memo, useState, useMemo, useCallback, useEffect } from 'react';
import { useAdminUsers } from '@/hooks/useAdminUsers';
import { useUpdateUser } from '@/hooks/useAdminUsers';
import { useDebounce } from '@/hooks/useDebounce';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, RefreshCw, Edit, Plus, Minus, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const AdminBalanceCheck = memo(() => {
  const { data: users = [] } = useAdminUsers({ useInfinite: false });
  const updateUser = useUpdateUser();

  const [balanceListSearch, setBalanceListSearch] = useState('');
  const [balanceDateFilter, setBalanceDateFilter] = useState('');
  const [balancePage, setBalancePage] = useState(1);
  const balancePerPage = 20;
  const [balanceAdjustment, setBalanceAdjustment] = useState({ userId: '', amount: '', type: 'add' });
  const [balanceUserSearch, setBalanceUserSearch] = useState('');
  const [balanceUserDropdownOpen, setBalanceUserDropdownOpen] = useState(false);

  const debouncedSearch = useDebounce(balanceListSearch, 300);

  const filteredBalanceUsers = useMemo(() => {
    return users.filter(u => {
      const searchLower = debouncedSearch.toLowerCase();
      const matchesSearch = !debouncedSearch || 
        u.name?.toLowerCase().includes(searchLower) ||
        u.email?.toLowerCase().includes(searchLower) ||
        u.phone_number?.toLowerCase().includes(searchLower);
      
      let matchesDate = true;
      if (balanceDateFilter) {
        const userDate = new Date(u.created_at).toLocaleDateString();
        const filterDate = new Date(balanceDateFilter).toLocaleDateString();
        matchesDate = userDate === filterDate;
      }
      
      return matchesSearch && matchesDate;
    });
  }, [users, debouncedSearch, balanceDateFilter]);

  const totalBalancePages = Math.ceil(filteredBalanceUsers.length / balancePerPage);
  const startBalanceIndex = (balancePage - 1) * balancePerPage;
  const endBalanceIndex = startBalanceIndex + balancePerPage;
  const paginatedBalanceUsers = filteredBalanceUsers.slice(startBalanceIndex, endBalanceIndex);

  const handleAdjustBalance = useCallback(async () => {
    if (!balanceAdjustment.userId || !balanceAdjustment.amount) {
      toast.error('Please search and select a user and enter an amount');
      return;
    }

    try {
      const user = users.find(u => u.id === balanceAdjustment.userId);
      if (!user) {
        toast.error('User not found');
        return;
      }

      const amount = parseFloat(balanceAdjustment.amount);
      const newBalance = balanceAdjustment.type === 'add' 
        ? user.balance + amount 
        : user.balance - amount;

      if (newBalance < 0) {
        toast.error('Balance cannot be negative');
        return;
      }

      await updateUser.mutateAsync({
        userId: balanceAdjustment.userId,
        updates: { balance: newBalance }
      });
      
      // Create transaction record for balance adjustment
      await supabase.from('transactions').insert({
        user_id: balanceAdjustment.userId,
        amount: amount,
        type: balanceAdjustment.type === 'add' ? 'deposit' : 'order',
        status: 'approved'
      });

      setBalanceAdjustment({ userId: '', amount: '', type: 'add' });
      setBalanceUserSearch('');
      setBalanceUserDropdownOpen(false);
    } catch (error) {
      // Error handled by mutation
    }
  }, [balanceAdjustment, users, updateUser]);

  const filteredUsersForDropdown = useMemo(() => {
    if (!balanceUserSearch) return [];
    const searchLower = balanceUserSearch.toLowerCase();
    return users.filter(u =>
      u.name?.toLowerCase().includes(searchLower) ||
      u.email?.toLowerCase().includes(searchLower) ||
      u.phone_number?.toLowerCase().includes(searchLower)
    ).slice(0, 10);
  }, [users, balanceUserSearch]);

  return (
    <div className="space-y-6">
      {/* User Balances List */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center gap-4">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">User Balances</h2>
          </div>
          {/* Search and Date Filter */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search by username, email, or phone..."
                value={balanceListSearch}
                onChange={(e) => setBalanceListSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div>
              <Input
                type="date"
                placeholder="Filter by date"
                value={balanceDateFilter}
                onChange={(e) => setBalanceDateFilter(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
        </div>
        {filteredBalanceUsers.length === 0 ? (
          <p className="text-gray-600 text-center py-8">No users found</p>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-white/20">
              <div className="max-h-[600px] overflow-y-auto overflow-x-auto">
                {/* Fixed Header */}
                <div className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10 min-w-[1100px]">
                  <div className="grid grid-cols-12 gap-4 p-4 font-semibold text-sm">
                    <div className="col-span-2">Name</div>
                    <div className="col-span-3">Email</div>
                    <div className="col-span-2">Phone</div>
                    <div className="col-span-1">Role</div>
                    <div className="col-span-2">Balance</div>
                    <div className="col-span-1.5">Joined Date</div>
                    <div className="col-span-0.5">Actions</div>
                  </div>
                </div>
                {/* Scrollable List */}
                <div className="divide-y divide-gray-200/50 min-w-[1100px]">
                  {paginatedBalanceUsers.map((u) => (
                    <div key={u.id} className="bg-white/50 hover:bg-white/70 transition-colors">
                      <div className="grid grid-cols-12 gap-4 p-4 items-center">
                        {/* Name */}
                        <div className="col-span-2">
                          <p className="font-medium text-gray-900 break-words">{u.name}</p>
                        </div>
                        {/* Email */}
                        <div className="col-span-3">
                          <p className="text-sm text-gray-700 break-all">{u.email}</p>
                        </div>
                        {/* Phone */}
                        <div className="col-span-2">
                          <p className="text-sm text-gray-700 break-words">{u.phone_number || 'N/A'}</p>
                        </div>
                        {/* Role */}
                        <div className="col-span-1">
                          <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${
                            u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'
                          }`}>
                            {u.role}
                          </span>
                        </div>
                        {/* Balance */}
                        <div className="col-span-2">
                          <p className="font-semibold text-gray-900 whitespace-nowrap">₵{u.balance.toFixed(2)}</p>
                        </div>
                        {/* Joined Date */}
                        <div className="col-span-1.5">
                          <p className="text-sm text-gray-700 whitespace-nowrap">{new Date(u.created_at).toLocaleDateString()}</p>
                          <p className="text-xs text-gray-500 whitespace-nowrap">{new Date(u.created_at).toLocaleTimeString()}</p>
                        </div>
                        {/* Actions */}
                        <div className="col-span-0.5">
                          <Button
                            onClick={() => {
                              setBalanceAdjustment({ ...balanceAdjustment, userId: u.id });
                              setBalanceUserSearch(u.name || u.email);
                              setTimeout(() => {
                                const formElement = document.querySelector('[data-balance-form]');
                                if (formElement) {
                                  formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }
                              }, 100);
                            }}
                            variant="outline"
                            size="sm"
                            className="text-xs whitespace-nowrap"
                            title="Adjust balance"
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Pagination Controls */}
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-gray-600">
                Showing {startBalanceIndex + 1} to {Math.min(endBalanceIndex, filteredBalanceUsers.length)} of {filteredBalanceUsers.length} users
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setBalancePage(prev => Math.max(1, prev - 1))}
                  disabled={balancePage === 1}
                  variant="outline"
                  size="sm"
                >
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalBalancePages) }, (_, i) => {
                    let pageNum;
                    if (totalBalancePages <= 5) {
                      pageNum = i + 1;
                    } else if (balancePage <= 3) {
                      pageNum = i + 1;
                    } else if (balancePage >= totalBalancePages - 2) {
                      pageNum = totalBalancePages - 4 + i;
                    } else {
                      pageNum = balancePage - 2 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        onClick={() => setBalancePage(pageNum)}
                        variant={balancePage === pageNum ? "default" : "outline"}
                        size="sm"
                        className={balancePage === pageNum ? "bg-indigo-600 hover:bg-indigo-700 text-white" : ""}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                <Button
                  onClick={() => setBalancePage(prev => Math.min(totalBalancePages, prev + 1))}
                  disabled={balancePage === totalBalancePages}
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
      
      {/* Manual Balance Adjustment Form */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-8 shadow-sm max-w-2xl" data-balance-form>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">Manual Balance Adjustment</h2>
        <div className="space-y-5">
          <div>
            <Label>Search User</Label>
            <div className="relative user-search-dropdown-container">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none z-20" />
              <Input
                type="text"
                placeholder="Search by name, email, or phone number..."
                value={balanceUserSearch}
                onChange={(e) => {
                  const value = e.target.value;
                  setBalanceUserSearch(value);
                  if (value.length > 0 && users.length > 0) {
                    setBalanceUserDropdownOpen(true);
                  } else if (value.length === 0) {
                    setBalanceUserDropdownOpen(false);
                  }
                }}
                onFocus={() => {
                  if (users.length > 0) {
                    setBalanceUserDropdownOpen(true);
                  }
                }}
                onBlur={() => {
                  setTimeout(() => setBalanceUserDropdownOpen(false), 200);
                }}
                className="pl-10"
              />
              {balanceUserDropdownOpen && filteredUsersForDropdown.length > 0 && (
                <div className="absolute z-30 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {filteredUsersForDropdown.map((u) => {
                    const isSelected = balanceAdjustment.userId === u.id;
                    return (
                      <div
                        key={u.id}
                        onClick={() => {
                          setBalanceAdjustment({ ...balanceAdjustment, userId: u.id });
                          setBalanceUserSearch(u.name || u.email);
                          setBalanceUserDropdownOpen(false);
                        }}
                        className={`p-3 cursor-pointer hover:bg-indigo-50 transition-colors ${
                          isSelected ? 'bg-indigo-100' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900">{u.name}</p>
                            <p className="text-xs text-gray-600">{u.email}</p>
                            {u.phone_number && (
                              <p className="text-xs text-gray-500">📱 {u.phone_number}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-indigo-600">
                              ₵{u.balance.toFixed(2)}
                            </p>
                            {isSelected && (
                              <CheckCircle className="w-4 h-4 text-indigo-600 mt-1" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            {/* Show selected user */}
            {balanceAdjustment.userId && (() => {
              const selectedUser = users.find(u => u.id === balanceAdjustment.userId);
              return selectedUser ? (
                <div className="mt-2 p-3 bg-indigo-50 rounded-xl border border-indigo-200">
                  <p className="text-sm font-medium text-gray-900">
                    Selected: {selectedUser.name} ({selectedUser.email})
                  </p>
                  <p className="text-xs text-gray-600">
                    Current Balance: ₵{selectedUser.balance.toFixed(2)}
                  </p>
                </div>
              ) : null;
            })()}
          </div>
          <div>
            <Label>Adjustment Type</Label>
            <Select 
              value={balanceAdjustment.type} 
              onValueChange={(value) => setBalanceAdjustment({ ...balanceAdjustment, type: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="add">Add Balance</SelectItem>
                <SelectItem value="subtract">Subtract Balance</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Amount (₵)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={balanceAdjustment.amount}
              onChange={(e) => setBalanceAdjustment({ ...balanceAdjustment, amount: e.target.value })}
              required
            />
          </div>
          <Button
            onClick={handleAdjustBalance}
            disabled={updateUser.isPending}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-11 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            {balanceAdjustment.type === 'add' ? <Plus className="w-4 h-4 mr-2" /> : <Minus className="w-4 h-4 mr-2" />}
            {balanceAdjustment.type === 'add' ? 'Add' : 'Subtract'} Balance
          </Button>
        </div>
      </div>
    </div>
  );
});

AdminBalanceCheck.displayName = 'AdminBalanceCheck';

export default AdminBalanceCheck;

