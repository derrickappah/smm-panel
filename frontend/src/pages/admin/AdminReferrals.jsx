import React, { memo, useState, useMemo, useCallback } from 'react';
import { useAdminReferrals, useReferralStats, useAwardReferralBonus, useProcessAllMissedBonuses } from '@/hooks/useAdminReferrals';
import { useDebounce } from '@/hooks/useDebounce';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, RefreshCw, Download, CheckCircle, Clock, XCircle, UserPlus, DollarSign, TrendingUp } from 'lucide-react';

const AdminReferrals = memo(() => {
  const { data: referrals = [], isLoading, refetch } = useAdminReferrals();
  const { data: referralStats = { total_referrals: 0, total_bonuses_paid: 0, pending_bonuses: 0, total_bonus_amount: 0 } } = useReferralStats();
  const awardBonus = useAwardReferralBonus();
  const processAllMissed = useProcessAllMissedBonuses();

  const [referralSearch, setReferralSearch] = useState('');
  const [referralStatusFilter, setReferralStatusFilter] = useState('all');
  const [referralDateFilter, setReferralDateFilter] = useState('');
  const [referralsPage, setReferralsPage] = useState(1);
  const referralsPerPage = 20;
  const [awardingBonus, setAwardingBonus] = useState(null);

  const debouncedSearch = useDebounce(referralSearch, 300);

  const getFilteredReferrals = useCallback(() => {
    let filtered = [...referrals];

    // Search filter
    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase();
      filtered = filtered.filter(ref => {
        const referrerName = (ref.referrer?.name || '').toLowerCase();
        const referrerEmail = (ref.referrer?.email || '').toLowerCase();
        const refereeName = (ref.referee?.name || '').toLowerCase();
        const refereeEmail = (ref.referee?.email || '').toLowerCase();
        return referrerName.includes(searchLower) || referrerEmail.includes(searchLower) ||
               refereeName.includes(searchLower) || refereeEmail.includes(searchLower);
      });
    }

    // Status filter
    if (referralStatusFilter !== 'all') {
      filtered = filtered.filter(ref => {
        if (referralStatusFilter === 'awarded') {
          return ref.bonus_awarded === true;
        } else if (referralStatusFilter === 'pending') {
          return ref.first_deposit_amount && !ref.bonus_awarded;
        } else if (referralStatusFilter === 'no_deposit') {
          return !ref.first_deposit_amount;
        }
        return true;
      });
    }

    // Date filter
    if (referralDateFilter) {
      const filterDate = new Date(referralDateFilter);
      filterDate.setHours(0, 0, 0, 0);
      const filterDateEnd = new Date(filterDate);
      filterDateEnd.setHours(23, 59, 59, 999);
      
      filtered = filtered.filter(ref => {
        const refDate = new Date(ref.created_at);
        return refDate >= filterDate && refDate <= filterDateEnd;
      });
    }

    return filtered;
  }, [referrals, debouncedSearch, referralStatusFilter, referralDateFilter]);

  const filteredReferrals = useMemo(() => getFilteredReferrals(), [getFilteredReferrals]);

  const handleManualBonusAward = useCallback(async (referralId) => {
    if (!confirm('Are you sure you want to manually award this bonus? This will update the referrer\'s balance.')) {
      return;
    }

    setAwardingBonus(referralId);
    try {
      const referral = referrals.find(r => r.id === referralId);
      if (!referral) {
        throw new Error('Referral not found');
      }

      if (referral.bonus_awarded) {
        alert('Bonus already awarded');
        return;
      }

      await awardBonus.mutateAsync({ referralId, referral });
      await refetch();
    } catch (error) {
      // Error handled by mutation
    } finally {
      setAwardingBonus(null);
    }
  }, [referrals, awardBonus, refetch]);

  const handleProcessAllMissedBonuses = useCallback(async () => {
    if (!confirm('This will process all missed referral bonuses. Continue?')) {
      return;
    }

    try {
      await processAllMissed.mutateAsync();
      await refetch();
    } catch (error) {
      // Error handled by mutation
    }
  }, [processAllMissed, refetch]);

  const exportReferralsToCSV = useCallback(() => {
    const headers = ['Referrer Name', 'Referrer Email', 'Referee Name', 'Referee Email', 'First Deposit', 'Bonus Amount', 'Status', 'Created At', 'Bonus Awarded At'];
    const rows = filteredReferrals.map(ref => [
      ref.referrer?.name || ref.referrer?.email || 'N/A',
      ref.referrer?.email || 'N/A',
      ref.referee?.name || ref.referee?.email || 'N/A',
      ref.referee?.email || 'N/A',
      ref.first_deposit_amount ? `₵${parseFloat(ref.first_deposit_amount).toFixed(2)}` : 'N/A',
      ref.referral_bonus ? `₵${parseFloat(ref.referral_bonus).toFixed(2)}` : 'N/A',
      ref.bonus_awarded ? 'Awarded' : (ref.first_deposit_amount ? 'Pending' : 'No Deposit'),
      new Date(ref.created_at).toLocaleString(),
      ref.bonus_awarded_at ? new Date(ref.bonus_awarded_at).toLocaleString() : 'N/A'
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `referrals_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }, [filteredReferrals]);

  const totalPages = Math.ceil(filteredReferrals.length / referralsPerPage);
  const paginatedReferrals = filteredReferrals.slice(
    (referralsPage - 1) * referralsPerPage,
    referralsPage * referralsPerPage
  );

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
        <div className="space-y-4">
          <div className="h-8 bg-gray-200 rounded animate-pulse w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded animate-pulse"></div>
            ))}
          </div>
          <div className="h-12 bg-gray-200 rounded animate-pulse"></div>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-gray-200 rounded animate-pulse"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Referrals</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{referralStats.total_referrals}</p>
            </div>
            <UserPlus className="w-8 h-8 text-indigo-600" />
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Bonuses Paid</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">₵{referralStats.total_bonuses_paid.toFixed(2)}</p>
            </div>
            <DollarSign className="w-8 h-8 text-green-600" />
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Bonuses</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{referralStats.pending_bonuses}</p>
            </div>
            <Clock className="w-8 h-8 text-yellow-600" />
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Bonus Amount</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">₵{referralStats.total_bonus_amount.toFixed(2)}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-blue-600" />
          </div>
        </div>
      </div>

      {/* Referrals Table */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">All Referrals</h2>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => refetch()}
              disabled={isLoading}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              onClick={exportReferralsToCSV}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="space-y-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search by referrer or referee..."
                value={referralSearch}
                onChange={(e) => setReferralSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={referralStatusFilter} onValueChange={setReferralStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="awarded">Awarded</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="no_deposit">No Deposit</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              placeholder="Filter by date"
              value={referralDateFilter}
              onChange={(e) => setReferralDateFilter(e.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handleProcessAllMissedBonuses}
              disabled={processAllMissed.isPending}
              variant="outline"
              className="whitespace-nowrap"
            >
              {processAllMissed.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Process All Missed Bonuses
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Referrals Table */}
        {filteredReferrals.length === 0 ? (
          <p className="text-gray-600 text-center py-8">No referrals found</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Referrer</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Referee</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">First Deposit</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Bonus Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Created At</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Bonus Awarded At</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginatedReferrals.map((referral) => {
                    const status = referral.bonus_awarded 
                      ? 'awarded' 
                      : (referral.first_deposit_amount ? 'pending' : 'no_deposit');
                    return (
                      <tr key={referral.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {referral.referrer?.name || referral.referrer?.email || 'N/A'}
                            </p>
                            <p className="text-xs text-gray-500">{referral.referrer?.email}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {referral.referee?.name || referral.referee?.email || 'N/A'}
                            </p>
                            <p className="text-xs text-gray-500">{referral.referee?.email}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-gray-900">
                            {referral.first_deposit_amount 
                              ? `₵${parseFloat(referral.first_deposit_amount).toFixed(2)}` 
                              : 'N/A'}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-gray-900">
                            {referral.referral_bonus 
                              ? `₵${parseFloat(referral.referral_bonus).toFixed(2)}` 
                              : referral.first_deposit_amount 
                                ? `₵${(parseFloat(referral.first_deposit_amount) * 0.1).toFixed(2)}` 
                                : 'N/A'}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            status === 'awarded' 
                              ? 'bg-green-100 text-green-800' 
                              : status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {status === 'awarded' ? (
                              <>
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Awarded
                              </>
                            ) : status === 'pending' ? (
                              <>
                                <Clock className="w-3 h-3 mr-1" />
                                Pending
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3 h-3 mr-1" />
                                No Deposit
                              </>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-gray-900">
                            {new Date(referral.created_at).toLocaleDateString()}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(referral.created_at).toLocaleTimeString()}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          {referral.bonus_awarded_at ? (
                            <>
                              <p className="text-sm text-gray-900">
                                {new Date(referral.bonus_awarded_at).toLocaleDateString()}
                              </p>
                              <p className="text-xs text-gray-500">
                                {new Date(referral.bonus_awarded_at).toLocaleTimeString()}
                              </p>
                            </>
                          ) : (
                            <p className="text-sm text-gray-400">N/A</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {(status === 'pending' || status === 'no_deposit') && !referral.bonus_awarded && (
                            <Button
                              onClick={() => handleManualBonusAward(referral.id)}
                              disabled={awardingBonus === referral.id || awardBonus.isPending}
                              variant="outline"
                              size="sm"
                              className="text-xs"
                            >
                              {awardingBonus === referral.id ? (
                                <>
                                  <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                                  Awarding...
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  {status === 'no_deposit' ? 'Find & Award Bonus' : 'Award Bonus'}
                                </>
                              )}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-gray-600">
                  Showing {((referralsPage - 1) * referralsPerPage) + 1} to {Math.min(referralsPage * referralsPerPage, filteredReferrals.length)} of {filteredReferrals.length} referrals
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => setReferralsPage(prev => Math.max(1, prev - 1))}
                    disabled={referralsPage === 1}
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
                      } else if (referralsPage <= 3) {
                        pageNum = i + 1;
                      } else if (referralsPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = referralsPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          onClick={() => setReferralsPage(pageNum)}
                          variant={referralsPage === pageNum ? "default" : "outline"}
                          size="sm"
                          className={referralsPage === pageNum ? "bg-indigo-600 hover:bg-indigo-700 text-white" : ""}
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    onClick={() => setReferralsPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={referralsPage >= totalPages}
                    variant="outline"
                    size="sm"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});

AdminReferrals.displayName = 'AdminReferrals';

export default AdminReferrals;

