import React, { memo, useState, useMemo, useCallback, useEffect } from 'react';
import { useAdminActivityLogs, useActivityStatistics, exportActivityLogs } from '@/hooks/useAdminActivityLogs';
import { useDebounce } from '@/hooks/useDebounce';
import VirtualizedList from '@/components/VirtualizedList';
import ResponsiveTable from '@/components/admin/ResponsiveTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Search, RefreshCw, Download, Eye, Calendar, Filter, Shield, AlertTriangle, Info, X } from 'lucide-react';
import { toast } from 'sonner';

const ITEMS_PER_PAGE = 50;
const VIRTUAL_SCROLL_THRESHOLD = 100;

// Action type options
const ACTION_TYPES = [
  'login_success',
  'login_failed',
  'logout',
  'order_placed',
  'order_status_changed',
  'deposit_created',
  'deposit_approved',
  'deposit_approved_admin',
  'deposit_approved_user',
  'deposit_manually_verified',
  'transaction_status_changed',
  'user_updated',
  'profile_updated',
  'balance_changed',
  'role_changed',
  'settings_changed',
  'payment_initiated'
];

// Severity options
const SEVERITY_OPTIONS = [
  { value: 'all', label: 'All Severities' },
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
  { value: 'security', label: 'Security' }
];

const AdminActivityLogs = memo(({ onRefresh, refreshing = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionTypeFilter, setActionTypeFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [entityTypeFilter, setEntityTypeFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const debouncedSearch = useDebounce(searchTerm, 300);

  // Build filters object
  const filters = useMemo(() => ({
    search: debouncedSearch || null,
    action_type: actionTypeFilter !== 'all' ? actionTypeFilter : null,
    severity: severityFilter !== 'all' ? severityFilter : null,
    entity_type: entityTypeFilter !== 'all' ? entityTypeFilter : null,
    start_date: startDate ? new Date(startDate).toISOString() : null,
    end_date: endDate ? new Date(endDate + 'T23:59:59').toISOString() : null
  }), [debouncedSearch, actionTypeFilter, severityFilter, entityTypeFilter, startDate, endDate]);

  const { 
    data, 
    isLoading, 
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch
  } = useAdminActivityLogs({ 
    enabled: true, 
    useInfinite: true,
    filters
  });

  const { data: statistics } = useActivityStatistics(30);

  const allLogs = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap(page => page.data || []);
  }, [data]);

  const totalCount = useMemo(() => {
    return data?.pages?.[0]?.total || allLogs.length;
  }, [data, allLogs.length]);

  const handleViewDetails = useCallback((log) => {
    setSelectedLog(log);
    setIsDetailsOpen(true);
  }, []);

  const handleExport = useCallback(async (format = 'csv') => {
    setExporting(true);
    try {
      const logs = await exportActivityLogs(filters);
      
      if (format === 'csv') {
        // Convert to CSV
        const headers = ['Timestamp', 'User', 'Action', 'Entity', 'Description', 'Severity', 'IP Address'];
        const rows = logs.map(log => [
          new Date(log.created_at).toLocaleString(),
          log.user_email || 'System',
          log.action_type,
          log.entity_type || 'N/A',
          log.description,
          log.severity,
          log.ip_address || 'N/A'
        ]);
        
        const csvContent = [
          headers.join(','),
          ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `activity-logs-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      } else {
        // Export as JSON
        const jsonContent = JSON.stringify(logs, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `activity-logs-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
      
      toast.success(`Exported ${logs.length} activity logs as ${format.toUpperCase()}`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export activity logs');
    } finally {
      setExporting(false);
    }
  }, [filters]);

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'security':
        return <Shield className="w-4 h-4 text-red-500" />;
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'security':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'error':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      default:
        return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  const renderTableHeader = useCallback(() => (
    <div className="grid grid-cols-[2fr_2fr_2fr_1.5fr_3fr_1fr_1.5fr_1fr] gap-4 p-4 font-semibold text-sm min-w-[1400px]">
      <div className="text-center min-w-[150px]">Timestamp</div>
      <div className="text-center min-w-[150px]">User</div>
      <div className="text-center min-w-[150px]">Action</div>
      <div className="text-center min-w-[120px]">Entity</div>
      <div className="text-center min-w-[200px]">Description</div>
      <div className="text-center min-w-[100px]">Severity</div>
      <div className="text-center min-w-[120px]">IP Address</div>
      <div className="text-center min-w-[100px]">Actions</div>
    </div>
  ), []);

  const renderTableRow = useCallback((log, index) => {
    const user = log.profiles || {};
    
    return (
      <div className="grid grid-cols-[2fr_2fr_2fr_1.5fr_3fr_1fr_1.5fr_1fr] gap-4 p-4 items-center bg-white hover:bg-gray-50 transition-colors border-b border-gray-200 min-w-[1400px]">
        <div className="text-sm text-gray-700">
          {new Date(log.created_at).toLocaleString()}
        </div>
        <div className="text-sm text-gray-700">
          {user.email || user.name || 'System'}
        </div>
        <div className="text-sm font-medium text-gray-900">
          {log.action_type}
        </div>
        <div className="text-sm text-gray-600">
          {log.entity_type || 'N/A'}
        </div>
        <div className="text-sm text-gray-700 truncate" title={log.description}>
          {log.description}
        </div>
        <div className="flex items-center justify-center">
          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getSeverityColor(log.severity)}`}>
            {log.severity}
          </span>
        </div>
        <div className="text-xs text-gray-500">
          {log.ip_address || 'N/A'}
        </div>
        <div className="flex items-center justify-center">
          <Button
            onClick={() => handleViewDetails(log)}
            variant="outline"
            size="sm"
            className="text-xs"
          >
            <Eye className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }, [handleViewDetails]);

  const renderMobileCard = useCallback((log, index) => {
    const user = log.profiles || {};
    
    return (
      <div className="bg-white p-4 space-y-3 border-b border-gray-200">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              {getSeverityIcon(log.severity)}
              <span className="font-semibold text-gray-900">{log.action_type}</span>
            </div>
            <p className="text-sm text-gray-600">{log.description}</p>
          </div>
          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getSeverityColor(log.severity)}`}>
            {log.severity}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200 text-sm">
          <div>
            <p className="text-xs text-gray-500">User</p>
            <p className="text-gray-700">{user.email || user.name || 'System'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Entity</p>
            <p className="text-gray-700">{log.entity_type || 'N/A'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Timestamp</p>
            <p className="text-gray-700">{new Date(log.created_at).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">IP Address</p>
            <p className="text-gray-700">{log.ip_address || 'N/A'}</p>
          </div>
        </div>
        <Button
          onClick={() => handleViewDetails(log)}
          variant="outline"
          size="sm"
          className="w-full"
        >
          <Eye className="w-4 h-4 mr-2" />
          View Details
        </Button>
      </div>
    );
  }, [handleViewDetails]);

  if (isLoading && !data) {
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

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 shadow-sm w-full max-w-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Activity Logs</h2>
            <p className="text-sm text-gray-600 mt-1">
              Total: {totalCount.toLocaleString()} logs
              {statistics && (
                <> • {statistics.security_events_count} security events (last 30 days)</>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => handleExport('csv')}
              variant="outline"
              disabled={exporting}
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button
              onClick={() => handleExport('json')}
              variant="outline"
              disabled={exporting}
            >
              <Download className="w-4 h-4 mr-2" />
              Export JSON
            </Button>
            <Button
              onClick={() => {
                refetch();
                if (onRefresh) onRefresh();
              }}
              variant="outline"
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={actionTypeFilter} onValueChange={setActionTypeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Action Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {ACTION_TYPES.map(type => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              {SEVERITY_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Entity Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entities</SelectItem>
              <SelectItem value="user">User</SelectItem>
              <SelectItem value="order">Order</SelectItem>
              <SelectItem value="transaction">Transaction</SelectItem>
              <SelectItem value="settings">Settings</SelectItem>
              <SelectItem value="profile">Profile</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Start Date</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">End Date</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <ResponsiveTable
        data={allLogs}
        renderHeader={renderTableHeader}
        renderRow={renderTableRow}
        renderMobileCard={renderMobileCard}
        virtualScrollThreshold={VIRTUAL_SCROLL_THRESHOLD}
        emptyMessage="No activity logs found"
      />

      {/* Load More */}
      {hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            onClick={() => fetchNextPage()}
            variant="outline"
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}

      {/* Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Activity Log Details</DialogTitle>
            <DialogDescription>
              Full details of the activity log entry
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Timestamp</label>
                  <p className="text-sm text-gray-900">{new Date(selectedLog.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Severity</label>
                  <p className="text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getSeverityColor(selectedLog.severity)}`}>
                      {selectedLog.severity}
                    </span>
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">User</label>
                  <p className="text-sm text-gray-900">
                    {selectedLog.profiles?.email || selectedLog.profiles?.name || 'System'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Action Type</label>
                  <p className="text-sm text-gray-900">{selectedLog.action_type}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Entity Type</label>
                  <p className="text-sm text-gray-900">{selectedLog.entity_type || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Entity ID</label>
                  <p className="text-sm text-gray-900 font-mono text-xs">{selectedLog.entity_id || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">IP Address</label>
                  <p className="text-sm text-gray-900">{selectedLog.ip_address || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">User Agent</label>
                  <p className="text-sm text-gray-900 text-xs break-all">{selectedLog.user_agent || 'N/A'}</p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Description</label>
                <p className="text-sm text-gray-900 mt-1">{selectedLog.description}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Metadata</label>
                <pre className="text-xs bg-gray-50 p-3 rounded border overflow-auto max-h-64 mt-1">
                  {JSON.stringify(selectedLog.metadata || {}, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
});

AdminActivityLogs.displayName = 'AdminActivityLogs';

export default AdminActivityLogs;
