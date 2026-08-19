import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Download, Calendar, Filter, FileText, CheckSquare, Square, 
  RefreshCw, CheckCircle2, Users, FileSpreadsheet, Code, Shield, DollarSign, Clock
} from 'lucide-react';
import { toast } from 'sonner';

const ALL_COLUMNS = [
  { id: 'name', label: 'Full Name' },
  { id: 'email', label: 'Email Address' },
  { id: 'phone_number', label: 'Phone Number' },
  { id: 'role', label: 'Role' },
  { id: 'balance', label: 'Wallet Balance (₵)' },
  { id: 'total_spend', label: 'Total Spent (₵)' },
  { id: 'total_orders', label: 'Total Orders' },
  { id: 'total_deposits', label: 'Total Deposited (₵)' },
  { id: 'referral_code', label: 'Referral Code' },
  { id: 'created_at', label: 'Date Joined' },
  { id: 'last_seen_at', label: 'Last Active Date' },
  { id: 'id', label: 'User UUID' }
];

const AdminUserExport = () => {
  // Date Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dateField, setDateField] = useState('created_at');

  // Attribute Filters
  const [roleFilter, setRoleFilter] = useState('all');
  const [balanceFilter, setBalanceFilter] = useState('all');
  const [banFilter, setBanFilter] = useState('all');
  const [activityFilter, setActivityFilter] = useState('all');
  const [depositFilter, setDepositFilter] = useState('all');

  // Format & Columns
  const [exportFormat, setExportFormat] = useState('csv');
  const [selectedColumns, setSelectedColumns] = useState([
    'name', 'email', 'phone_number', 'role', 'balance', 'total_spend', 'total_orders', 'created_at', 'last_seen_at'
  ]);

  // Preview & Processing state
  const [previewCount, setPreviewCount] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Quick Date Presets
  const applyDatePreset = (preset) => {
    const now = new Date();
    let start = new Date();

    if (preset === 'today') {
      start.setHours(0, 0, 0, 0);
    } else if (preset === '7days') {
      start.setDate(now.getDate() - 7);
    } else if (preset === '30days') {
      start.setDate(now.getDate() - 30);
    } else if (preset === 'thisMonth') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (preset === 'allTime') {
      setStartDate('');
      setEndDate('');
      return;
    }

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(now.toISOString().split('T')[0]);
  };

  // Toggle column selection
  const toggleColumn = (colId) => {
    setSelectedColumns(prev => 
      prev.includes(colId) ? prev.filter(c => c !== colId) : [...prev, colId]
    );
  };

  const selectAllColumns = () => setSelectedColumns(ALL_COLUMNS.map(c => c.id));
  const deselectAllColumns = () => setSelectedColumns(['email']);

  // Fetch Live Matching User Count
  const fetchPreviewCount = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;

      const res = await fetch('/api/admin/export-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          startDate,
          endDate,
          dateField,
          roleFilter,
          balanceFilter,
          banFilter,
          activityFilter,
          depositFilter,
          previewCountOnly: true
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPreviewCount(data.count);
        }
      }
    } catch (err) {
      console.warn('Error fetching preview count:', err);
    } finally {
      setPreviewLoading(false);
    }
  }, [startDate, endDate, dateField, roleFilter, balanceFilter, banFilter, activityFilter, depositFilter]);

  useEffect(() => {
    fetchPreviewCount();
  }, [fetchPreviewCount]);

  // Execute Export Server Action
  const handleExportUsers = async () => {
    if (selectedColumns.length === 0) {
      toast.error('Please select at least one column to export');
      return;
    }

    setExporting(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;

      const res = await fetch('/api/admin/export-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          startDate,
          endDate,
          dateField,
          roleFilter,
          balanceFilter,
          banFilter,
          activityFilter,
          depositFilter,
          exportFormat,
          selectedColumns
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || errJson.message || 'Export failed');
      }

      // Convert response stream to downloadable file blob
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      const filename = `users_export_${new Date().toISOString().split('T')[0]}.${exportFormat === 'excel' ? 'xls' : exportFormat}`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);

      toast.success(`Successfully exported users as ${exportFormat.toUpperCase()}`);
    } catch (err) {
      console.error('Export users error:', err);
      toast.error(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-12">
      {/* Filters Box */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-md space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-2 text-gray-900 font-bold text-base sm:text-lg">
            <Filter className="w-5 h-5 text-indigo-600 shrink-0" />
            <span>Export Criteria & Filters</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-xs text-gray-500 font-semibold w-full sm:w-auto mb-1 sm:mb-0">Date Presets:</span>
            {[
              { id: 'today', label: 'Today' },
              { id: '7days', label: '7 Days' },
              { id: '30days', label: '30 Days' },
              { id: 'thisMonth', label: 'This Month' },
              { id: 'allTime', label: 'All Time' }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => applyDatePreset(p.id)}
                className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-xs font-semibold transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date Range Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Date Field:</label>
            <Select value={dateField} onValueChange={setDateField}>
              <SelectTrigger className="h-10 text-xs">
                <SelectValue placeholder="Date Field" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at">Date Joined (created_at)</SelectItem>
                <SelectItem value="last_seen_at">Last Active (last_seen_at)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Start Date:</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-10 text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">End Date:</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-10 text-xs"
            />
          </div>
        </div>

        {/* Attribute Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 pt-2 border-t border-gray-100">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Role:</label>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="reseller">Reseller</SelectItem>
                <SelectItem value="support">Support</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Wallet Balance:</label>
            <Select value={balanceFilter} onValueChange={setBalanceFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Balances" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Balances</SelectItem>
                <SelectItem value="positive">Positive Balance (&gt; ₵0)</SelectItem>
                <SelectItem value="zero">Zero Balance (₵0)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Ban Status:</label>
            <Select value={banFilter} onValueChange={setBanFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="banned">Banned Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Activity (30d):</label>
            <Select value={activityFilter} onValueChange={setActivityFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Activity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Activity</SelectItem>
                <SelectItem value="active_30d">Active in Last 30 Days</SelectItem>
                <SelectItem value="inactive_30d">Inactive (&gt;30 Days)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Depositor Status:</label>
            <Select value={depositFilter} onValueChange={setDepositFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                <SelectItem value="has_deposited">Deposited Users Only</SelectItem>
                <SelectItem value="no_deposits">Non-Depositing Users</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Column Picker Box */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-md space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h3 className="font-bold text-gray-900 text-base">Select Export Columns</h3>
            <p className="text-xs text-gray-500">Pick attributes to include in export file.</p>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={selectAllColumns} className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold">Select All</button>
            <span className="text-gray-300">|</span>
            <button onClick={deselectAllColumns} className="text-xs text-gray-500 hover:text-gray-700 font-semibold">Clear</button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {ALL_COLUMNS.map(col => {
            const isSelected = selectedColumns.includes(col.id);
            return (
              <button
                key={col.id}
                type="button"
                onClick={() => toggleColumn(col.id)}
                className={`flex items-center gap-2.5 p-2.5 sm:p-3 rounded-xl border text-xs font-semibold text-left transition-all ${
                  isSelected 
                    ? 'bg-indigo-50 text-indigo-900 border-indigo-200 shadow-xs' 
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                }`}
              >
                {isSelected ? (
                  <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-gray-400 shrink-0" />
                )}
                <span className="truncate">{col.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Format & Export Action Bar */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-md space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 w-full lg:w-auto">
            <div className="w-full sm:w-auto">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Export Format:</span>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: 'csv', label: 'CSV (.csv)', icon: FileSpreadsheet },
                  { id: 'excel', label: 'Excel (.xls)', icon: FileSpreadsheet },
                  { id: 'json', label: 'JSON (.json)', icon: Code }
                ].map(fmt => {
                  const Icon = fmt.icon;
                  return (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => setExportFormat(fmt.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                        exportFormat === fmt.id
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{fmt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live Count Preview */}
            <div className="bg-indigo-50 border border-indigo-100 px-4 py-2 rounded-xl w-full sm:w-auto flex items-center justify-between sm:block">
              <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider block">Matching Users:</span>
              {previewLoading ? (
                <span className="text-sm font-bold text-indigo-600 animate-pulse">Calculating...</span>
              ) : (
                <span className="text-base sm:text-lg font-extrabold text-indigo-950">{previewCount ?? 0} Users</span>
              )}
            </div>
          </div>

          <Button
            onClick={handleExportUsers}
            disabled={exporting || selectedColumns.length === 0}
            className="w-full lg:w-auto h-12 sm:h-14 px-8 text-sm sm:text-base font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg hover:shadow-indigo-200 transition-all flex items-center justify-center gap-2"
          >
            {exporting ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Downloading Export...</span>
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                <span>Export {previewCount ? `${previewCount} Users` : 'All Data'}</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AdminUserExport;
