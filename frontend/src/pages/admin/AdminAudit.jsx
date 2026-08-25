import React, { memo, useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
    Activity, ShieldAlert, Shield, AlertTriangle, CheckCircle2,
    RefreshCw, Search, Download, DollarSign,
    FileText, EyeOff, Layers, Zap, Bug,
    CheckCircle, XCircle, Clock, AlertCircle, ArrowUpRight, Filter,
    Mail, Key, UserCheck, ChevronDown, ChevronRight, User, Terminal
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const AdminAudit = memo(({ onRefresh, refreshing = false }) => {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState('logs');
    const [scanning, setScanning] = useState(false);
    const [reconciling, setReconciling] = useState(false);

    // Filters
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [eventSeverityFilter, setEventSeverityFilter] = useState('all');
    const [eventSearch, setEventSearch] = useState('');
    const [balanceSearch, setBalanceSearch] = useState('');
    const [resolvingId, setResolvingId] = useState(null);
    const [expandedLogId, setExpandedLogId] = useState(null);

    // Fetch Unified Logged Events from activity_logs & system_events
    const { data: loggedEvents = [], isLoading: isLoadingEvents, refetch: refetchEvents } = useQuery({
        queryKey: ['admin', 'audit-logged-events'],
        queryFn: async () => {
            const { data: activityLogs, error: actErr } = await supabase
                .from('activity_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(300);

            if (actErr) console.warn('Error fetching activity_logs:', actErr);

            const { data: sysEvents, error: sysErr } = await supabase
                .from('system_events')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(300);

            if (sysErr) console.warn('Error fetching system_events:', sysErr);

            const normalizedAct = (activityLogs || []).map(a => ({
                id: `act_${a.id}`,
                created_at: a.created_at,
                event_name: a.action_type || 'ACTIVITY_LOG',
                description: a.description || '',
                severity: a.severity || 'info',
                user_id: a.user_id || null,
                ip_address: a.ip_address || (a.metadata?.ip_address) || null,
                details: a.metadata || {},
                source: 'activity_logs'
            }));

            const normalizedSys = (sysEvents || []).map(s => ({
                id: `sys_${s.id}`,
                created_at: s.created_at,
                event_name: s.event_type || 'SYSTEM_EVENT',
                description: s.description || (typeof s.details === 'string' ? s.details : s.details?.description || ''),
                severity: s.severity || 'info',
                user_id: s.details?.user_id || s.details?.userId || null,
                ip_address: s.details?.ip_address || s.details?.ip || null,
                details: typeof s.details === 'object' ? s.details : { raw: s.details },
                source: 'system_events'
            }));

            return [...normalizedAct, ...normalizedSys].sort((a, b) => 
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            );
        },
        refetchInterval: 10000
    });

    // Fetch Balance Audit Discrepancies
    const { data: balanceAnomalies = [], isLoading: isLoadingBalance, refetch: refetchBalance } = useQuery({
        queryKey: ['admin', 'audit-balance-anomalies'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('ledger_balance_verification')
                .select('*')
                .neq('discrepancy', 0)
                .order('discrepancy', { ascending: false })
                .limit(500);
            if (error) return [];
            return data || [];
        }
    });

    const { data: balanceLogs = [], isLoading: isLoadingBalanceLogs, refetch: refetchBalanceLogs } = useQuery({
        queryKey: ['admin', 'audit-balance-logs'],
        queryFn: async () => {
            const { data, error } = await supabase.from('balance_audit_log').select('*').order('created_at', { ascending: false }).limit(100);
            if (error) return [];
            return data || [];
        }
    });

    const { data: suspiciousActivities = [], isLoading: isLoadingSuspicious, refetch: refetchSuspicious } = useQuery({
        queryKey: ['admin', 'audit-suspicious-activity'],
        queryFn: async () => {
            const { data, error } = await supabase.from('security_suspicious_activity').select('*').order('detected_at', { ascending: false }).limit(100);
            if (error) return [];
            return data || [];
        }
    });

    const { data: ghostOrders = [], isLoading: isLoadingGhosts, refetch: refetchGhosts } = useQuery({
        queryKey: ['admin', 'audit-ghost-orders'],
        queryFn: async () => {
            const { data, error } = await supabase.from('security_ghost_orders').select('*').order('detected_at', { ascending: false }).limit(100);
            if (error) return [];
            return data || [];
        }
    });

    useEffect(() => {
        const auditChannel = supabase
            .channel('admin-audit-live-feed')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, () => refetchEvents())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'system_events' }, () => refetchEvents())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'security_suspicious_activity' }, () => refetchSuspicious())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'security_ghost_orders' }, () => refetchGhosts())
            .subscribe();
        return () => supabase.removeChannel(auditChannel);
    }, [refetchEvents, refetchSuspicious, refetchGhosts]);

    const handleRunDeepScan = async () => {
        setScanning(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch('/api/admin/run-security-scan', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
            });
            if (!res.ok) throw new Error('Failed to run security scan');
            const data = await res.json();
            toast.success(`Scan Complete: ${data.ghost_orders || 0} Ghost Orders, ${data.spam_clusters || 0} Abuse Clusters.`);
            refetchGhosts();
            refetchSuspicious();
            refetchEvents();
        } catch (err) {
            toast.error(err.message || 'Security scan failed');
        } finally {
            setScanning(false);
        }
    };

    const handleRunReconciliation = async () => {
        setReconciling(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch('/api/admin/reconcile-orders', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' }
            });
            if (!res.ok) throw new Error('Reconciliation failed');
            toast.success('Order & Balance Reconciliation completed.');
            refetchBalance();
            refetchEvents();
        } catch (err) {
            toast.error(err.message || 'Reconciliation failed');
        } finally {
            setReconciling(false);
        }
    };

    const handleResolveThreat = async (table, id) => {
        setResolvingId(id);
        try {
            const { error } = await supabase.from(table).update({ is_resolved: true }).eq('id', id);
            if (error) throw error;
            toast.success('Threat resolved');
            if (table === 'security_suspicious_activity') refetchSuspicious();
            if (table === 'security_ghost_orders') refetchGhosts();
        } catch (err) {
            toast.error('Failed to update status');
        } finally {
            setResolvingId(null);
        }
    };

    const exportAuditCSV = () => {
        const headers = ['Timestamp', 'Event Type', 'Severity', 'User ID', 'IP Address', 'Description', 'Payload'];
        const rows = loggedEvents.map(e => [
            `"${e.created_at}"`,
            `"${e.event_name}"`,
            `"${e.severity}"`,
            `"${e.user_id || 'System'}"`,
            `"${e.ip_address || 'N/A'}"`,
            `"${(e.description || '').replace(/"/g, '""')}"`,
            `"${JSON.stringify(e.details || {}).replace(/"/g, '""')}"`
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `logged_events_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Audit logs exported');
    };

    const filteredLoggedEvents = useMemo(() => {
        return loggedEvents.filter(ev => {
            const matchSeverity = eventSeverityFilter === 'all' || ev.severity === eventSeverityFilter;
            let matchCategory = true;
            const evName = (ev.event_name || '').toUpperCase();
            if (categoryFilter === 'permissions') matchCategory = evName.includes('ADMIN') || evName.includes('ROLE') || evName.includes('SESSION');
            else if (categoryFilter === 'financial') matchCategory = evName.includes('PAYMENT') || evName.includes('DEPOSIT') || evName.includes('LEDGER');
            else if (categoryFilter === 'abuse') matchCategory = evName.includes('GHOST') || evName.includes('SPAM') || evName.includes('SPIKE');
            else if (categoryFilter === 'auth') matchCategory = evName.includes('LOGIN') || evName.includes('OTP') || evName.includes('AUTH');
            
            const searchLower = eventSearch.toLowerCase();
            const matchSearch = !eventSearch || evName.toLowerCase().includes(searchLower) || (ev.description && ev.description.toLowerCase().includes(searchLower)) || (ev.user_id && ev.user_id.toLowerCase().includes(searchLower));
            return matchSeverity && matchCategory && matchSearch;
        });
    }, [loggedEvents, eventSeverityFilter, categoryFilter, eventSearch]);

    const filteredBalanceAnomalies = useMemo(() => {
        if (!balanceSearch) return balanceAnomalies;
        const s = balanceSearch.toLowerCase();
        return balanceAnomalies.filter(b => (b.user_email && b.user_email.toLowerCase().includes(s)) || (b.user_id && b.user_id.toLowerCase().includes(s)));
    }, [balanceAnomalies, balanceSearch]);

    const ghostCount = ghostOrders.filter(g => !g.is_resolved).length;
    const suspiciousCount = suspiciousActivities.filter(s => !s.is_resolved).length;
    const balanceDiscrepancies = balanceAnomalies.length;

    const getSeverityBadge = (severity) => {
        switch (severity) {
            case 'critical': return <Badge className="bg-red-100 text-red-800 border-red-200 font-mono text-[11px] uppercase font-bold">critical</Badge>;
            case 'security': return <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-mono text-[11px] uppercase font-bold">security</Badge>;
            case 'warning': return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 font-mono text-[11px] uppercase">warning</Badge>;
            default: return <Badge className="bg-blue-100 text-blue-800 border-blue-200 font-mono text-[11px] uppercase">info</Badge>;
        }
    };

    return (
        <div className="space-y-6 pb-12">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                        <Activity className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-gray-900">Security & Audit Logs</h1>
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                Live Feed
                            </Badge>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">Real-time immutable ledger of system and security activity.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={() => { refetchEvents(); refetchBalance(); refetchGhosts(); refetchSuspicious(); }} variant="outline" size="sm" className="text-xs h-9">
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
                    </Button>
                    <Button onClick={exportAuditCSV} variant="outline" size="sm" className="text-xs h-9">
                        <Download className="w-3.5 h-3.5 mr-1.5" /> Export
                    </Button>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-white border border-gray-200 p-1 rounded-lg w-full flex overflow-x-auto justify-start gap-1">
                    <TabsTrigger value="logs" className="flex items-center gap-2 text-xs">
                        <Activity className="w-4 h-4" /> <span>Logged Events ({loggedEvents.length})</span>
                    </TabsTrigger>
                    <TabsTrigger value="ledger" className="flex items-center gap-2 text-xs">
                        <DollarSign className="w-4 h-4" /> <span>Ledger Discrepancies</span>
                        {balanceDiscrepancies > 0 && (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0">
                                {balanceDiscrepancies}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="threats" className="flex items-center gap-2 text-xs">
                        <ShieldAlert className="w-4 h-4" /> <span>Threats</span>
                        {(ghostCount + suspiciousCount) > 0 && (
                            <Badge variant="secondary" className="bg-rose-100 text-rose-800 text-[10px] px-1.5 py-0">
                                {ghostCount + suspiciousCount}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="balance-history" className="flex items-center gap-2 text-xs">
                        <FileText className="w-4 h-4" /> <span>Mutation Logs ({balanceLogs.length})</span>
                    </TabsTrigger>
                </TabsList>

                {/* Tab 1: All Logged Events Feed */}
                <TabsContent value="logs" className="mt-4 space-y-4">
                    {/* Filters Bar */}
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-semibold text-gray-500 uppercase mr-1">Filter:</span>
                            <Button
                                size="sm"
                                variant={categoryFilter === 'all' ? 'default' : 'outline'}
                                className={categoryFilter === 'all' ? 'bg-indigo-600 text-white h-8 text-xs' : 'h-8 text-xs'}
                                onClick={() => setCategoryFilter('all')}
                            >
                                All Events
                            </Button>
                            <Button
                                size="sm"
                                variant={categoryFilter === 'permissions' ? 'default' : 'outline'}
                                className={categoryFilter === 'permissions' ? 'bg-indigo-600 text-white h-8 text-xs' : 'h-8 text-xs'}
                                onClick={() => setCategoryFilter('permissions')}
                            >
                                Admin & Permissions
                            </Button>
                            <Button
                                size="sm"
                                variant={categoryFilter === 'financial' ? 'default' : 'outline'}
                                className={categoryFilter === 'financial' ? 'bg-indigo-600 text-white h-8 text-xs' : 'h-8 text-xs'}
                                onClick={() => setCategoryFilter('financial')}
                            >
                                Financial & Deposits
                            </Button>
                            <Button
                                size="sm"
                                variant={categoryFilter === 'abuse' ? 'default' : 'outline'}
                                className={categoryFilter === 'abuse' ? 'bg-indigo-600 text-white h-8 text-xs' : 'h-8 text-xs'}
                                onClick={() => setCategoryFilter('abuse')}
                            >
                                Threats & Abuse
                            </Button>
                            <Button
                                size="sm"
                                variant={categoryFilter === 'auth' ? 'default' : 'outline'}
                                className={categoryFilter === 'auth' ? 'bg-indigo-600 text-white h-8 text-xs' : 'h-8 text-xs'}
                                onClick={() => setCategoryFilter('auth')}
                            >
                                Auth & Logins
                            </Button>
                        </div>

                        <div className="flex items-center gap-2">
                            <Select value={eventSeverityFilter} onValueChange={setEventSeverityFilter}>
                                <SelectTrigger className="w-32 text-xs h-8">
                                    <SelectValue placeholder="All Severities" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Severities</SelectItem>
                                    <SelectItem value="critical">Critical</SelectItem>
                                    <SelectItem value="security">Security</SelectItem>
                                    <SelectItem value="warning">Warning</SelectItem>
                                    <SelectItem value="info">Info</SelectItem>
                                </SelectContent>
                            </Select>
                            <div className="relative">
                                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                                <Input
                                    placeholder="Search event, user, IP, payload..."
                                    value={eventSearch}
                                    onChange={(e) => setEventSearch(e.target.value)}
                                    className="w-56 text-xs h-8 pl-8"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Logged Events Table */}
                    <Card className="border-gray-200 shadow-sm overflow-hidden">
                        <CardContent className="p-0">
                            {isLoadingEvents ? (
                                <div className="py-12 text-center text-gray-500 text-sm flex items-center justify-center gap-2">
                                    <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                                    Loading audit logs...
                                </div>
                            ) : filteredLoggedEvents.length === 0 ? (
                                <div className="py-16 text-center">
                                    <Terminal className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                                    <p className="text-sm font-semibold text-gray-900">No Logged Events Found</p>
                                    <p className="text-xs text-gray-500 mt-1">No activity or system logs matched your search filters.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader className="bg-gray-50/80">
                                            <TableRow>
                                                <TableHead className="w-[180px] text-xs font-semibold text-gray-700">Timestamp</TableHead>
                                                <TableHead className="w-[220px] text-xs font-semibold text-gray-700">Event / Action</TableHead>
                                                <TableHead className="w-[100px] text-xs font-semibold text-gray-700">Severity</TableHead>
                                                <TableHead className="w-[160px] text-xs font-semibold text-gray-700">Actor / IP</TableHead>
                                                <TableHead className="text-xs font-semibold text-gray-700">Description & Context</TableHead>
                                                <TableHead className="w-[80px] text-right text-xs font-semibold text-gray-700">Details</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredLoggedEvents.map((ev) => {
                                                const isExpanded = expandedLogId === ev.id;
                                                return (
                                                    <React.Fragment key={ev.id}>
                                                        <TableRow 
                                                            className={`hover:bg-gray-50/70 transition-colors cursor-pointer ${isExpanded ? 'bg-indigo-50/30' : ''}`}
                                                            onClick={() => setExpandedLogId(isExpanded ? null : ev.id)}
                                                        >
                                                            <TableCell className="text-xs text-gray-500 whitespace-nowrap font-mono">
                                                                {new Date(ev.created_at).toLocaleString()}
                                                            </TableCell>
                                                            <TableCell className="font-mono text-xs font-bold text-gray-900">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                                                                    <span>{ev.event_name}</span>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                {getSeverityBadge(ev.severity)}
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="text-xs">
                                                                    {ev.user_id ? (
                                                                        <div className="font-mono text-[11px] text-gray-800 truncate max-w-[130px]" title={ev.user_id}>
                                                                            {ev.user_id}
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-gray-400 font-mono text-[11px]">System</span>
                                                                    )}
                                                                    {ev.ip_address && (
                                                                        <div className="text-[10px] text-gray-400 font-mono">
                                                                            {ev.ip_address}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-xs text-gray-700">
                                                                {ev.description || (typeof ev.details === 'string' ? ev.details : JSON.stringify(ev.details))}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-7 w-7 text-gray-500"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setExpandedLogId(isExpanded ? null : ev.id);
                                                                    }}
                                                                >
                                                                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                                </Button>
                                                            </TableCell>
                                                        </TableRow>

                                                        {/* Expanded Payload / Metadata Drawer */}
                                                        {isExpanded && (
                                                            <TableRow className="bg-gray-50/90 border-b border-indigo-100">
                                                                <TableCell colSpan={6} className="p-4">
                                                                    <div className="space-y-2">
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                                                                                Forensic Payload & Metadata ({ev.source})
                                                                            </span>
                                                                            <span className="font-mono text-[10px] text-gray-400">ID: {ev.id}</span>
                                                                        </div>
                                                                        <pre className="p-3 bg-gray-900 text-emerald-400 rounded-md text-xs font-mono overflow-x-auto max-h-64 shadow-inner">
                                                                            {JSON.stringify(ev.details, null, 2)}
                                                                        </pre>
                                                                    </div>
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Tab 2: Balance & Ledger Discrepancies */}
                <TabsContent value="ledger" className="mt-4 space-y-4">
                    <Card>
                        <CardHeader>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div>
                                    <CardTitle className="text-base font-bold">Ledger Balance Exceptions</CardTitle>
                                    <CardDescription className="text-xs">
                                        Calculated differences between deposit credits, order charges, refunds, and current profile balances.
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Input
                                        placeholder="Search by email or user ID..."
                                        value={balanceSearch}
                                        onChange={(e) => setBalanceSearch(e.target.value)}
                                        className="w-56 text-xs h-8"
                                    />
                                    <Button
                                        onClick={() => refetchBalance()}
                                        variant="outline"
                                        size="icon"
                                        className="h-8 w-8"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5" />
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {isLoadingBalance ? (
                                <div className="py-8 text-center text-gray-500 text-xs">Loading ledger verification data...</div>
                            ) : filteredBalanceAnomalies.length === 0 ? (
                                <div className="py-12 text-center">
                                    <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                                    <p className="text-sm font-semibold text-gray-900">Zero Ledger Discrepancies</p>
                                    <p className="text-xs text-gray-500 mt-0.5">All user balances match their audited deposit and order history ledger.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>User</TableHead>
                                                <TableHead>Current Balance</TableHead>
                                                <TableHead>Calculated Balance</TableHead>
                                                <TableHead>Discrepancy</TableHead>
                                                <TableHead>Total Deposits</TableHead>
                                                <TableHead>Total Spent</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredBalanceAnomalies.map((row) => (
                                                <TableRow key={row.user_id}>
                                                    <TableCell>
                                                        <div>
                                                            <p className="font-medium text-xs text-gray-900">{row.user_email || 'No Email'}</p>
                                                            <p className="font-mono text-[10px] text-gray-400 truncate max-w-[140px]">{row.user_id}</p>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="font-semibold text-sm">₵{parseFloat(row.current_balance || 0).toFixed(2)}</TableCell>
                                                    <TableCell className="text-sm text-gray-600">₵{parseFloat(row.calculated_balance || 0).toFixed(2)}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className={row.discrepancy > 0 ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700"}>
                                                            ₵{parseFloat(row.discrepancy || 0).toFixed(2)}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-sm">₵{parseFloat(row.total_deposits || 0).toFixed(2)}</TableCell>
                                                    <TableCell className="text-sm">₵{parseFloat(row.total_spent || 0).toFixed(2)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Tab 3: Threats & Ghost Orders */}
                <TabsContent value="threats" className="mt-4 space-y-6">
                    {/* Ghost Orders Section */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-base font-bold">Ghost / Orphan Orders</CardTitle>
                                    <CardDescription className="text-xs">
                                        Orders executed on external provider gateways without corresponding finalized internal records.
                                    </CardDescription>
                                </div>
                                <Button onClick={() => refetchGhosts()} variant="outline" size="sm" className="h-8 text-xs">
                                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                                    Refresh
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {isLoadingGhosts ? (
                                <div className="py-6 text-center text-gray-500 text-xs">Checking ghost orders...</div>
                            ) : ghostOrders.length === 0 ? (
                                <div className="py-8 text-center text-gray-500 text-xs">
                                    No ghost orders detected. All provider orders are properly linked.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Provider ID</TableHead>
                                                <TableHead>Provider</TableHead>
                                                <TableHead>Link</TableHead>
                                                <TableHead>Charge</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead>Detected</TableHead>
                                                <TableHead className="text-right">Action</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {ghostOrders.map((ghost) => (
                                                <TableRow key={ghost.id}>
                                                    <TableCell className="font-mono text-xs">{ghost.provider_order_id}</TableCell>
                                                    <TableCell className="font-medium text-xs capitalize">{ghost.provider_name}</TableCell>
                                                    <TableCell className="text-xs truncate max-w-[200px]">{ghost.link}</TableCell>
                                                    <TableCell className="text-xs font-semibold">${ghost.charge}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="capitalize text-xs">{ghost.status}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-xs text-gray-500">
                                                        {new Date(ghost.detected_at).toLocaleString()}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {!ghost.is_resolved ? (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                                                disabled={resolvingId === ghost.id}
                                                                onClick={() => handleResolveThreat('security_ghost_orders', ghost.id)}
                                                            >
                                                                Resolve
                                                            </Button>
                                                        ) : (
                                                            <Badge className="bg-gray-100 text-gray-600">Resolved</Badge>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Suspicious Activity & Spam Clusters */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-base font-bold">Abuse & Spam Detection Clusters</CardTitle>
                                    <CardDescription className="text-xs">
                                        Automated traffic analysis detecting rapid duplicate link ordering and volume anomalies.
                                    </CardDescription>
                                </div>
                                <Button onClick={() => refetchSuspicious()} variant="outline" size="sm" className="h-8 text-xs">
                                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                                    Refresh
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {isLoadingSuspicious ? (
                                <div className="py-6 text-center text-gray-500 text-xs">Loading abuse detection logs...</div>
                            ) : suspiciousActivities.length === 0 ? (
                                <div className="py-8 text-center text-gray-500 text-xs">
                                    No active abuse patterns or duplicate spam clusters detected.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Type</TableHead>
                                                <TableHead>Target Link</TableHead>
                                                <TableHead>Event Count</TableHead>
                                                <TableHead>Severity</TableHead>
                                                <TableHead>Detected At</TableHead>
                                                <TableHead className="text-right">Action</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {suspiciousActivities.map((act) => (
                                                <TableRow key={act.id}>
                                                    <TableCell className="font-semibold text-xs capitalize">
                                                        {act.activity_type ? act.activity_type.replace(/_/g, ' ') : 'Suspicious Event'}
                                                    </TableCell>
                                                    <TableCell className="text-xs truncate max-w-[240px] font-mono">{act.link || 'N/A'}</TableCell>
                                                    <TableCell className="text-xs font-bold">{act.event_count || 1}x</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className={act.severity === 'high' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}>
                                                            {act.severity || 'warning'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-xs text-gray-500">
                                                        {new Date(act.detected_at).toLocaleString()}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {!act.is_resolved ? (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                                                disabled={resolvingId === act.id}
                                                                onClick={() => handleResolveThreat('security_suspicious_activity', act.id)}
                                                            >
                                                                Resolve
                                                            </Button>
                                                        ) : (
                                                            <Badge className="bg-gray-100 text-gray-600">Resolved</Badge>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Tab 4: Balance Mutation Logs */}
                <TabsContent value="balance-history" className="mt-4 space-y-4">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-base font-bold">Balance Audit History Log</CardTitle>
                                    <CardDescription className="text-xs">
                                        Immutable record of wallet modifications, manual administrative overrides, and system reconciliations.
                                    </CardDescription>
                                </div>
                                <Button onClick={() => refetchBalanceLogs()} variant="outline" size="sm" className="h-8 text-xs">
                                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                                    Refresh
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {isLoadingBalanceLogs ? (
                                <div className="py-6 text-center text-gray-500 text-xs">Loading balance mutation records...</div>
                            ) : balanceLogs.length === 0 ? (
                                <div className="py-8 text-center text-gray-500 text-xs">
                                    No balance mutation audit records found.
                                </div>
                            ) : (
                                <div className="overflow-x-auto max-h-[500px]">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Timestamp</TableHead>
                                                <TableHead>User ID</TableHead>
                                                <TableHead>Change Type</TableHead>
                                                <TableHead>Previous Balance</TableHead>
                                                <TableHead>New Balance</TableHead>
                                                <TableHead>Difference</TableHead>
                                                <TableHead>Reason</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {balanceLogs.map((log) => (
                                                <TableRow key={log.id}>
                                                    <TableCell className="text-xs text-gray-500 whitespace-nowrap font-mono">
                                                        {new Date(log.created_at).toLocaleString()}
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs text-gray-700">
                                                        {log.user_id}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="text-xs capitalize">
                                                            {log.change_type || 'Adjustment'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-xs font-semibold">₵{parseFloat(log.previous_balance || 0).toFixed(2)}</TableCell>
                                                    <TableCell className="text-xs font-semibold">₵{parseFloat(log.new_balance || 0).toFixed(2)}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className={parseFloat(log.amount_changed || 0) >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}>
                                                            {parseFloat(log.amount_changed || 0) >= 0 ? '+' : ''}₵{parseFloat(log.amount_changed || 0).toFixed(2)}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-xs text-gray-600 max-w-xs truncate">
                                                        {log.reason || 'System Action'}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
});

AdminAudit.displayName = 'AdminAudit';

export default AdminAudit;
