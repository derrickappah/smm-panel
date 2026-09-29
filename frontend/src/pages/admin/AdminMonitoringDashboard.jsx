import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
    Activity, Server, Database, Shield, CreditCard,
    ShoppingCart, Clock, AlertTriangle, CheckCircle2,
    XCircle, RefreshCw, Zap, ExternalLink, Filter, Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import SEO from '@/components/SEO';
import { toast } from 'sonner';

const getStatusBadge = (status) => {
    switch (String(status).toLowerCase()) {
        case 'healthy':
        case 'success':
        case 'resolved':
            return <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 border-emerald-300">🟢 Healthy</Badge>;
        case 'degraded':
        case 'warning':
        case 'acknowledged':
            return <Badge className="bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 border-amber-300">🟡 Degraded</Badge>;
        case 'critical':
        case 'error':
        case 'failed':
        case 'open':
            return <Badge className="bg-rose-500/15 text-rose-700 hover:bg-rose-500/25 border-rose-300">🔴 Critical</Badge>;
        default:
            return <Badge variant="outline">⚪ Unknown</Badge>;
    }
};

const getSeverityBadge = (severity) => {
    switch (String(severity).toUpperCase()) {
        case 'CRITICAL':
            return <Badge className="bg-rose-600 text-white font-bold animate-pulse">CRITICAL</Badge>;
        case 'ERROR':
            return <Badge className="bg-rose-500/20 text-rose-700 border-rose-300">ERROR</Badge>;
        case 'WARNING':
            return <Badge className="bg-amber-500/20 text-amber-700 border-amber-300">WARNING</Badge>;
        default:
            return <Badge className="bg-blue-500/20 text-blue-700 border-blue-300">INFO</Badge>;
    }
};

const AdminMonitoringDashboard = () => {
    const [statusFilter, setStatusFilter] = useState('ACTIVE');
    const [resolvingId, setResolvingId] = useState(null);
    const [runningProbe, setRunningProbe] = useState(null);

    // Fetch live monitoring data & incidents
    const { data, isLoading, isFetching, refetch } = useQuery({
        queryKey: ['admin-monitoring-incidents', statusFilter],
        queryFn: async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`/api/admin/incidents?status=${statusFilter}`, {
                headers: {
                    'Authorization': `Bearer ${session?.access_token}`
                }
            });
            if (!res.ok) throw new Error('Failed to fetch monitoring metrics');
            return res.json();
        },
        refetchInterval: 15000 // 15 seconds auto-refresh
    });

    const health = data?.health || {};
    const systemStatus = health.system_status || {};
    const errors = health.errors || {};
    const performance = health.performance || {};
    const business = health.business || {};
    const cronJobs = health.background_jobs || {};
    const incidents = data?.incidents || [];
    const cronRuns = data?.cron_runs || [];

    // Resolve an incident
    const handleResolve = async (incident) => {
        const note = window.prompt(`Resolution note for ${incident.incident_code}:`, 'Issue identified and corrected.');
        if (note === null) return;

        setResolvingId(incident.id);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch('/api/admin/incidents', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({
                    action: 'resolve',
                    incidentId: incident.id,
                    resolutionNotes: note
                })
            });

            if (!res.ok) throw new Error('Failed to resolve incident');
            toast.success(`Incident ${incident.incident_code} marked as Resolved`);
            refetch();
        } catch (err) {
            toast.error(err.message);
        } finally {
            setResolvingId(null);
        }
    };

    // Run active diagnostic probe
    const handleRunProbe = async (probeType) => {
        setRunningProbe(probeType);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`/api/health/${probeType}`, {
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            const result = await res.json();
            if (res.ok) {
                toast.success(`${probeType.toUpperCase()} Probe: ${result.status.toUpperCase()} (${result.duration_ms || result.latency_ms || 0}ms)`);
            } else {
                toast.error(`${probeType.toUpperCase()} Probe Error: ${result.error || 'Failed'}`);
            }
            refetch();
        } catch (err) {
            toast.error(`Probe failed: ${err.message}`);
        } finally {
            setRunningProbe(null);
        }
    };

    const subsystems = [
        { name: 'Application', status: systemStatus.application || 'healthy', icon: Server },
        { name: 'Database', status: systemStatus.database || 'healthy', icon: Database },
        { name: 'Authentication', status: systemStatus.authentication || 'healthy', icon: Shield },
        { name: 'Payments', status: systemStatus.payments || 'healthy', icon: CreditCard },
        { name: 'Orders', status: systemStatus.orders || 'healthy', icon: ShoppingCart },
        { name: 'External APIs', status: systemStatus.external_apis || 'healthy', icon: Zap },
        { name: 'Cron Jobs', status: systemStatus.cron_jobs || 'healthy', icon: Clock }
    ];

    return (
        <div className="min-h-screen bg-slate-50/50 p-4 sm:p-6 lg:p-8 space-y-6">
            <SEO title="Production Monitoring - BoostUp GH Admin" />

            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                    <div className="flex items-center gap-2">
                        <Activity className="w-6 h-6 text-indigo-600 animate-pulse" />
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Production Reliability & Health</h1>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                        Active anomaly detection, telemetry percentiles, background job watchdog, and deduplicated incident response.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="gap-2"
                    >
                        <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
                        {isFetching ? 'Refreshing...' : 'Refresh'}
                    </Button>
                </div>
            </div>

            {/* Subsystem Health Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {subsystems.map((sub) => {
                    const Icon = sub.icon;
                    return (
                        <Card key={sub.name} className="border-slate-200/80 shadow-xs hover:shadow-sm transition-all">
                            <CardContent className="p-4 flex flex-col items-center text-center space-y-2">
                                <div className="p-2.5 bg-slate-100 rounded-xl text-slate-700">
                                    <Icon className="w-5 h-5" />
                                </div>
                                <span className="text-xs font-semibold text-slate-700">{sub.name}</span>
                                {getStatusBadge(sub.status)}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Telemetry & Performance Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Errors Card */}
                <Card className="border-slate-200/80 shadow-xs">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center justify-between">
                            <span>Error Rate Telemetry</span>
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                        </CardTitle>
                        <CardDescription>Server & Client 5xx Exceptions</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex justify-between items-center py-2 border-b border-slate-100">
                            <span className="text-sm text-slate-600">Last 5 Minutes</span>
                            <Badge variant={errors.last_5m > 0 ? 'destructive' : 'secondary'} className="font-mono">
                                {errors.last_5m || 0}
                            </Badge>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-100">
                            <span className="text-sm text-slate-600">Last 1 Hour</span>
                            <Badge variant={errors.last_1h > 5 ? 'destructive' : 'secondary'} className="font-mono">
                                {errors.last_1h || 0}
                            </Badge>
                        </div>
                        <div className="flex justify-between items-center py-2">
                            <span className="text-sm text-slate-600">Last 24 Hours</span>
                            <Badge variant="outline" className="font-mono">
                                {errors.last_24h || 0}
                            </Badge>
                        </div>
                    </CardContent>
                </Card>

                {/* Performance Card */}
                <Card className="border-slate-200/80 shadow-xs">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center justify-between">
                            <span>Performance Baselines</span>
                            <Zap className="w-4 h-4 text-blue-500" />
                        </CardTitle>
                        <CardDescription>Latency percentiles (last 1h)</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="grid grid-cols-3 gap-2 text-center py-1">
                            <div className="p-2 bg-slate-50 rounded-lg">
                                <div className="text-xs text-slate-500 font-medium">P50</div>
                                <div className="text-base font-bold font-mono text-slate-900">{performance.p50_ms || 0}ms</div>
                            </div>
                            <div className="p-2 bg-slate-50 rounded-lg">
                                <div className="text-xs text-slate-500 font-medium">P95</div>
                                <div className={`text-base font-bold font-mono ${performance.p95_ms > 1500 ? 'text-amber-600' : 'text-slate-900'}`}>
                                    {performance.p95_ms || 0}ms
                                </div>
                            </div>
                            <div className="p-2 bg-slate-50 rounded-lg">
                                <div className="text-xs text-slate-500 font-medium">P99</div>
                                <div className={`text-base font-bold font-mono ${performance.p99_ms > 3000 ? 'text-rose-600' : 'text-slate-900'}`}>
                                    {performance.p99_ms || 0}ms
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-slate-100 text-sm">
                            <span className="text-slate-600">1h Error Rate</span>
                            <span className={`font-mono font-bold ${performance.error_rate_pct > 5 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                {performance.error_rate_pct || 0}%
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* Business Health Card */}
                <Card className="border-slate-200/80 shadow-xs">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center justify-between">
                            <span>Business Operations (24h)</span>
                            <ShoppingCart className="w-4 h-4 text-emerald-500" />
                        </CardTitle>
                        <CardDescription>Orders & payment integrity</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex justify-between items-center py-1 text-sm border-b border-slate-100">
                            <span className="text-slate-600">Orders Completed</span>
                            <span className="font-mono font-bold text-emerald-600">{business.orders_24h?.completed || 0}</span>
                        </div>
                        <div className="flex justify-between items-center py-1 text-sm border-b border-slate-100">
                            <span className="text-slate-600">Orders Processing</span>
                            <span className="font-mono font-medium text-slate-800">{business.orders_24h?.processing || 0}</span>
                        </div>
                        <div className="flex justify-between items-center py-1 text-sm">
                            <span className="text-slate-600">Stuck Pending Orders</span>
                            <Badge variant={business.orders_24h?.stuck_pending > 5 ? 'destructive' : 'outline'} className="font-mono">
                                {business.orders_24h?.stuck_pending || 0}
                            </Badge>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Background Jobs / Cron Watchdog Table */}
            <Card className="border-slate-200/80 shadow-xs">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <div>
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <Clock className="w-4 h-4 text-indigo-500" />
                            <span>Background Jobs Watchdog</span>
                        </CardTitle>
                        <CardDescription>Scheduled order sync execution recency and duration</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        {getStatusBadge(cronJobs.status)}
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Job</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Last Run</TableHead>
                                <TableHead>Duration</TableHead>
                                <TableHead>Recency</TableHead>
                                <TableHead>Error</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {cronRuns.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-6 text-slate-400">
                                        No recent cron runs recorded. System is waiting for next scheduled trigger.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                cronRuns.map((run) => (
                                    <TableRow key={run.id}>
                                        <TableCell className="font-medium text-slate-900">{run.job_name}</TableCell>
                                        <TableCell>{getStatusBadge(run.status)}</TableCell>
                                        <TableCell className="text-xs text-slate-500">{new Date(run.started_at).toLocaleString()}</TableCell>
                                        <TableCell className="font-mono text-xs">{run.duration_ms || 0}ms</TableCell>
                                        <TableCell className="text-xs text-slate-600">
                                            {Math.round((Date.now() - new Date(run.started_at).getTime()) / 60000)}m ago
                                        </TableCell>
                                        <TableCell className="text-xs text-rose-600 font-mono max-w-xs truncate">
                                            {run.error_message || 'None'}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Production Incidents Manager */}
            <Card className="border-slate-200/80 shadow-xs">
                <CardHeader className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-3">
                    <div>
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-rose-500" />
                            <span>Production Incidents & Anomaly Log</span>
                        </CardTitle>
                        <CardDescription>
                            Deduplicated incidents with occurrence count and resolution status
                        </CardDescription>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant={statusFilter === 'ACTIVE' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setStatusFilter('ACTIVE')}
                        >
                            Active ({health.incidents_summary?.total_open || 0})
                        </Button>
                        <Button
                            variant={statusFilter === 'RESOLVED' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setStatusFilter('RESOLVED')}
                        >
                            Resolved
                        </Button>
                        <Button
                            variant={statusFilter === 'ALL' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setStatusFilter('ALL')}
                        >
                            All
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Incident</TableHead>
                                <TableHead>Severity</TableHead>
                                <TableHead>Component</TableHead>
                                <TableHead>First / Last Detected</TableHead>
                                <TableHead>Count</TableHead>
                                <TableHead>Last Error</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {incidents.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-slate-400">
                                        <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                                        <div className="font-medium text-slate-700">No {statusFilter.toLowerCase()} incidents detected</div>
                                        <div className="text-xs text-slate-400">All production subsystems are performing within normal parameters.</div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                incidents.map((inc) => (
                                    <TableRow key={inc.id} className={inc.severity === 'CRITICAL' ? 'bg-rose-50/40' : ''}>
                                        <TableCell>
                                            <div className="font-mono text-xs font-bold text-slate-900">{inc.incident_code}</div>
                                            <div className="text-xs text-slate-500">{inc.type}</div>
                                        </TableCell>
                                        <TableCell>{getSeverityBadge(inc.severity)}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{inc.component}</Badge>
                                        </TableCell>
                                        <TableCell className="text-xs text-slate-500">
                                            <div>Last: {new Date(inc.last_detected).toLocaleTimeString()}</div>
                                            <div className="text-[10px] text-slate-400">First: {new Date(inc.first_detected).toLocaleDateString()}</div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary" className="font-mono font-bold">
                                                {inc.occurrence_count}x
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-xs text-slate-700 max-w-sm truncate" title={inc.last_error}>
                                            {inc.last_error || 'No error details recorded'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {inc.status === 'RESOLVED' ? (
                                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                                    Resolved
                                                </Badge>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={resolvingId === inc.id}
                                                    onClick={() => handleResolve(inc)}
                                                    className="gap-1.5 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                                                >
                                                    <Check className="w-3.5 h-3.5" />
                                                    Resolve
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Diagnostic Probes Action Bar */}
            <Card className="border-slate-200/80 shadow-xs bg-slate-900 text-slate-100">
                <CardContent className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h3 className="text-base font-semibold text-white flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-400" />
                            Live Subsystem Probes
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">
                            Run instantaneous non-destructive health checks against production services.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={runningProbe !== null}
                            onClick={() => handleRunProbe('database')}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                        >
                            Probe Database
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={runningProbe !== null}
                            onClick={() => handleRunProbe('external-services')}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                        >
                            Probe Providers
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={runningProbe !== null}
                            onClick={() => handleRunProbe('dependencies')}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                        >
                            Probe Dependencies
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default AdminMonitoringDashboard;
