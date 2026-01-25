import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
    Server, ShieldAlert, Activity, CreditCard,
    ShoppingCart, AlertTriangle, CheckCircle, Clock,
    RefreshCw, TrendingDown, TrendingUp, Search, Crosshair, ExternalLink, EyeOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import SEO from '@/components/SEO';
import { toast } from 'sonner';

const formatLatency = (mins) => {
    if (!mins) return '0M';
    if (mins < 60) return `${mins}M`;
    if (mins < 1440) return `${(mins / 60).toFixed(1)}H`;
    return `${(mins / 1440).toFixed(1)}D`;
};

const DevDashboard = ({ user }) => {
    const [reconciling, setReconciling] = useState(false);
    const [reconData, setReconData] = useState(null);

    const { data: monitorData, isLoading, error, refetch } = useQuery({
        queryKey: ['admin', 'monitor-system'],
        queryFn: async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch('/api/admin/monitor-system', {
                headers: {
                    'Authorization': `Bearer ${session?.access_token}`
                }
            });
            if (!response.ok) throw new Error('Unauthorized or fetch failed');
            return response.json();
        },
        refetchInterval: 10000 // 10s auto-refresh for metrics
    });

    useEffect(() => {
        // SUBSCRIBE TO LIVE UPDATES
        const systemEventsSubscription = supabase
            .channel('system-monitor-live')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'system_events' }, () => {
                refetch();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                refetch();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(systemEventsSubscription);
        };
    }, [refetch]);

    const runReconciliation = async () => {
        setReconciling(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch('/api/admin/reconcile-orders', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${session?.access_token}` }
            });
            if (!response.ok) throw new Error('Reconciliation failed');
            const data = await response.json();
            setReconData(data);
            toast.success('System Reconciliation Complete');
        } catch (err) {
            toast.error(err.message);
        } finally {
            setReconciling(false);
        }
    };

    const handleIgnoreAnomaly = async (userId, userEmail) => {
        if (!confirm(`Are you sure you want to ignore anomalies for ${userEmail}? This will hide them from the dashboard.`)) return;

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch('/api/admin/ignore-anomaly', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session?.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId,
                    reason: 'Manually ignored from dashboard'
                })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to ignore anomaly');
            }

            toast.success(`Anomaly ignored for ${userEmail}`);
            refetch(); // Refresh list immediately
        } catch (err) {
            toast.error(err.message);
        }
    };

    if (isLoading) return (
        <div className="flex items-center justify-center min-h-screen bg-gray-950 text-emerald-500">
            <div className="flex flex-col items-center gap-4">
                <Activity className="w-12 h-12 animate-pulse" />
                <p className="text-xl font-mono">INITIALIZING SYSTEM MONITOR...</p>
            </div>
        </div>
    );

    if (error) return (
        <div className="flex items-center justify-center min-h-screen bg-gray-950 text-red-500">
            <div className="flex flex-col items-center gap-4">
                <ShieldAlert className="w-12 h-12" />
                <p className="text-xl font-mono uppercase">Access Denied / System Offline</p>
                <p className="text-sm opacity-70">{error.message}</p>
            </div>
        </div>
    );

    const m = monitorData?.metrics || {};
    const d = monitorData?.details || {};

    const StatCard = ({ title, icon: Icon, value, status = 'neutral', description, trend }) => {
        const statusColors = {
            healthy: 'text-emerald-500 border-emerald-500/20 bg-emerald-500/5',
            warning: 'text-yellow-500 border-yellow-500/20 bg-yellow-500/5',
            critical: 'text-red-500 border-red-500/20 bg-red-500/5',
            neutral: 'text-gray-400 border-gray-800 bg-gray-900/50'
        };

        return (
            <Card className={`bg-gray-950 border-gray-800 overflow-hidden`}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-gray-200 flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        {title}
                    </CardTitle>
                    {status !== 'neutral' && (
                        <Badge variant="outline" className={statusColors[status]}>
                            {status.toUpperCase()}
                        </Badge>
                    )}
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold font-mono text-white">
                        {value}
                    </div>
                    <p className="text-xs text-gray-200 mt-1 uppercase tracking-wider font-bold">
                        {description}
                    </p>
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="min-h-screen bg-black text-gray-300 font-mono p-4 md:p-8">
            <SEO title="INTERNAL SYSTEM MONITOR" />

            {/* FAIL SAFE WARNING */}
            {(m.security_signals?.balance_discrepancies > 0 || reconData?.summary?.mismatch_count > 5) && (
                <div className="mb-6 p-4 border border-red-500/50 bg-red-500/10 text-red-500 rounded flex items-center gap-3 animate-pulse">
                    <ShieldAlert className="w-6 h-6" />
                    <div>
                        <p className="font-bold uppercase tracking-widest text-sm">System Integrity Compromised</p>
                        <p className="text-xs opacity-70">Significant discrepancies detected in orders or financial ledger. Intervention required.</p>
                    </div>
                </div>
            )}

            <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8 border-b border-gray-800 pb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        <Activity className="text-emerald-400" />
                        SYSTEM_RELIABILITY_V1
                        <Badge variant="secondary" className="bg-gray-800 text-white border-gray-600 font-bold">HIDDEN_ADMIN_ONLY</Badge>
                    </h1>
                    <p className="text-sm text-emerald-300 mt-1 font-bold">REAL-TIME TELEMETRY FEED: {monitorData?.timestamp}</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={runReconciliation}
                        disabled={reconciling}
                        className="bg-indigo-900/20 border-indigo-500/30 hover:bg-indigo-900/40 text-indigo-400 text-xs"
                    >
                        <Crosshair className={`w-3 h-3 mr-2 ${reconciling ? 'animate-spin' : ''}`} />
                        {reconciling ? 'SCANNING...' : 'SCAN_RECONCILIATION'}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetch()}
                        className="bg-transparent border-gray-800 hover:bg-gray-900 text-xs"
                    >
                        <RefreshCw className="w-3 h-3 mr-2" /> FORCE_REFRESH
                    </Button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {/* 1. ORDER PIPELINE HEALTH */}
                <StatCard
                    title="ORDERS_TODAY"
                    icon={ShoppingCart}
                    value={m.order_pipeline?.total_today || 0}
                    description={`FAILURES: ${m.order_pipeline?.failed || 0} / ERRORS: ${m.system_events?.provider_errors_1h || 0}`}
                    status={(m.order_pipeline?.failed > 0 || m.system_events?.provider_errors_1h > 5) ? 'warning' : 'healthy'}
                />
                <StatCard
                    title="STUCK_ORDERS"
                    icon={Clock}
                    value={(m.order_pipeline?.stuck_pending || 0) + (m.order_pipeline?.stuck_processing || 0)}
                    description="PENDING > 5M OR PROCESSING > 4H"
                    status={(m.order_pipeline?.stuck_pending > 0) ? 'critical' : 'healthy'}
                />
                <StatCard
                    title="PROVIDER_STATUS"
                    icon={Server}
                    value={m.provider_status?.status}
                    description={`LATENCY: ${m.provider_status?.failures_30m || 0} FAIL / 30M`}
                    status={m.provider_status?.status === 'HEALTHY' ? 'healthy' : 'warning'}
                />
                <StatCard
                    title="PAYMENT_INTEGRITY"
                    icon={CreditCard}
                    value={m.payment_health?.approved_today || 0}
                    description={`DUPES/MISM: ${m.system_events?.duplicate_webhooks_today + m.system_events?.payment_mismatches_today}`}
                    status={(m.system_events?.payment_mismatches_today > 0) ? 'critical' : 'healthy'}
                />
            </div>

            {/* ORDER RECONCILIATION PANEL */}
            <Card className="bg-gray-950 border-gray-700 mb-8 overflow-hidden">
                <CardHeader className="border-b border-gray-800 bg-gray-900/40 pb-4 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                            <Crosshair className="w-4 h-4 text-indigo-400" />
                            ORDER_RECONCILIATION_PANEL
                        </CardTitle>
                        <CardDescription className="text-[10px] uppercase font-mono text-gray-200 font-bold">
                            {reconData ? `Discrepancy scan result: ${reconData.timestamp}` : 'Ready for system integrity audit'}
                        </CardDescription>
                    </div>
                    {reconData && (
                        <div className="flex gap-4">
                            <div className="text-center">
                                <div className="text-xl font-bold text-white leading-none">{reconData.summary.ok_count}</div>
                                <div className="text-[8px] text-emerald-400 uppercase font-bold">OK_VERIFIED</div>
                            </div>
                            <div className="text-center">
                                <div className="text-xl font-bold text-red-500 leading-none">{reconData.summary.mismatch_count}</div>
                                <div className="text-[8px] text-red-500 uppercase font-bold">STATUS_MISM</div>
                            </div>
                            <div className="text-center">
                                <div className="text-xl font-bold text-yellow-500 leading-none">{reconData.summary.missing_count}</div>
                                <div className="text-[8px] text-yellow-500 uppercase font-bold">MISSING_ORD</div>
                            </div>
                        </div>
                    )}
                </CardHeader>
                <CardContent className="p-0">
                    {!reconData ? (
                        <div className="py-20 text-center flex flex-col items-center gap-4 bg-gray-950/50">
                            <Search className="w-12 h-12 text-gray-800 animate-pulse" />
                            <div className="space-y-1">
                                <p className="text-xs text-gray-300 uppercase tracking-widest font-bold">System scan required</p>
                                <p className="text-[10px] text-gray-500 uppercase">Detect discrepancies between Local DB and Provider APIs</p>
                            </div>
                            <Button
                                onClick={runReconciliation}
                                disabled={reconciling}
                                className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white border-none h-9 text-xs font-bold"
                            >
                                <Crosshair className="w-3 h-3 mr-2" /> RUN_RECONCILIATION_SCAN
                            </Button>
                        </div>
                    ) : (
                        reconData.mismatches?.length > 0 ? (
                            <Table className="text-xs">
                                <TableHeader className="bg-gray-900/80">
                                    <TableRow className="border-gray-800">
                                        <TableHead className="font-mono text-[10px] text-gray-200 uppercase font-bold">Order ID</TableHead>
                                        <TableHead className="font-mono text-[10px] text-gray-200 uppercase font-bold">Local</TableHead>
                                        <TableHead className="font-mono text-[10px] text-gray-200 uppercase font-bold">Provider</TableHead>
                                        <TableHead className="font-mono text-[10px] text-gray-200 uppercase font-bold">Latency</TableHead>
                                        <TableHead className="font-mono text-[10px] text-gray-200 uppercase font-bold text-right">Class</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {reconData.mismatches.map((item) => (
                                        <TableRow
                                            key={item.order_id}
                                            className="border-gray-800 hover:bg-gray-900/40 cursor-pointer"
                                            onClick={() => window.open(`/admin/orders?search=${item.order_id}`, '_blank')}
                                        >
                                            <TableCell className="font-mono text-[9px] text-white truncate max-w-[100px] flex items-center gap-1 font-bold">
                                                <ExternalLink className="w-2 h-2 text-indigo-400" />
                                                {item.order_id}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-[8px] border-gray-600 text-gray-100 font-bold">{item.local_status}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-[8px] text-indigo-300 border-indigo-500/40 font-bold">{item.provider_status}</Badge>
                                            </TableCell>
                                            <TableCell className="text-gray-100 font-bold">{formatLatency(item.age_mins)}</TableCell>
                                            <TableCell className="text-right">
                                                <Badge className={
                                                    item.classification === 'STATUS_MISMATCH' ? 'bg-red-500/30 text-red-400 border-red-500/50 shadow-[0_0_10px_rgba(239,68,68,0.2)] font-bold' :
                                                        item.classification === 'MISSING_PROVIDER_ORDER' ? 'bg-orange-500/30 text-orange-400 border-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.2)] font-bold' :
                                                            'bg-yellow-500/30 text-yellow-400 border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.2)] font-bold'
                                                }>
                                                    {item.classification}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <div className="py-8 text-center text-[10px] text-gray-300 uppercase tracking-widest font-bold">
                                Zero discrepancies detected in latest batch
                            </div>
                        )
                    )}
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* SYSTEM EVENTS LOG */}
                <Card className="bg-gray-950 border-gray-700">
                    <CardHeader className="bg-gray-900/40 border-b border-gray-800 mb-2">
                        <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                            <Activity className="w-4 h-4 text-emerald-400" />
                            CRITICAL_EVENT_STREAM
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {d.recent_critical_events?.length > 0 ? d.recent_critical_events.map(event => (
                            <div key={event.id} className="text-xs p-3 border border-gray-900 rounded bg-gray-900/30 flex justify-between items-start">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Badge className={
                                            event.severity === 'critical' ? 'bg-red-500/20 text-red-500 border-red-500/50' :
                                                event.severity === 'error' ? 'bg-orange-500/20 text-orange-500 border-orange-500/50' :
                                                    'bg-yellow-500/20 text-yellow-500 border-yellow-500/50'
                                        }>
                                            {event.event_type}
                                        </Badge>
                                        <span className="text-gray-100 font-bold bg-gray-800 px-1.5 py-0.5 rounded">{new Date(event.created_at).toLocaleTimeString()}</span>
                                    </div>
                                    <p className="text-white font-bold mt-1">{event.description}</p>
                                </div>
                            </div>
                        )) : (
                            <p className="text-xs text-gray-400 text-center py-8">NO_CRITICAL_EVENTS_DETECTED</p>
                        )}
                    </CardContent>
                </Card>

                {/* SECURITY & ANOMALIES */}
                <Card className="bg-gray-950 border-gray-700">
                    <CardHeader className="bg-gray-900/40 border-b border-gray-800 mb-2">
                        <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4 text-emerald-400" />
                            SECURITY_SIGNALS
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-3 border border-gray-700 rounded bg-gray-900/50">
                            <span className="text-xs uppercase text-white font-bold tracking-tight">Balance Anomalies</span>
                            <Badge variant="outline" className={m.security_signals?.balance_discrepancies > 0 ? 'text-red-400 border-red-500 bg-red-500/20 font-bold' : 'text-emerald-400 border-emerald-500/50 bg-emerald-500/10 font-bold'}>
                                {m.security_signals?.balance_discrepancies || 0} DETECTED
                            </Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 border border-gray-700 rounded bg-gray-900/50">
                            <span className="text-xs uppercase text-white font-bold tracking-tight">Rate Limit Hits (1h)</span>
                            <Badge variant="outline" className={m.system_events?.rate_limits_today > 20 ? 'text-yellow-400 border-yellow-500 bg-yellow-500/10 font-bold' : 'text-gray-100 border-gray-600 bg-gray-800 font-bold'}>
                                {m.system_events?.rate_limits_today || 0} EVENTS
                            </Badge>
                        </div>
                        <div className="pt-4 border-t border-gray-900">
                            <h4 className="text-[10px] text-gray-500 mb-2 font-bold tracking-widest uppercase">System Uptime Indicators</h4>
                            <div className="flex gap-1 h-1">
                                {[...Array(30)].map((_, i) => (
                                    <div key={i} className={`flex-1 rounded-full ${i === 28 ? 'bg-red-500 animate-pulse' : 'bg-emerald-500 opacity-50'}`} />
                                ))}
                            </div>
                            <p className="text-[9px] text-emerald-500/40 mt-2 uppercase">Core services operational // Latency nominal</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* BALANCE DISCREPANCY REPORT */}
            {d.balance_anomalies?.length > 0 && (
                <Card className="bg-gray-950 border-gray-700 mt-8 overflow-hidden">
                    <CardHeader className="bg-gray-900/40 border-b border-gray-800 flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                                <ShieldAlert className="w-4 h-4 text-red-500" />
                                DETAILED_BALANCE_ANOMALIES
                            </CardTitle>
                            <CardDescription className="text-xs text-red-400 font-mono uppercase">
                                Accounts where database balance differs from transaction ledger (Top 10)
                            </CardDescription>
                        </div>
                        <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 text-[10px] bg-red-900/20 border border-red-900/50 hover:bg-red-900/40 text-red-500"
                            onClick={() => {
                                const allIds = d.balance_anomalies.map(a => a.user_id);
                                handleIgnoreAnomaly(allIds, `${allIds.length} users`);
                            }}
                        >
                            <EyeOff className="w-3 h-3 mr-2" />
                            IGNORE_ALL_({d.balance_anomalies.length})
                        </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table className="text-xs">
                            <TableHeader className="bg-gray-900/80">
                                <TableRow className="border-gray-800">
                                    <TableHead className="font-mono text-[10px] text-gray-200 uppercase font-bold">User Email</TableHead>
                                    <TableHead className="font-mono text-[10px] text-gray-200 uppercase font-bold text-right">Cached Bal</TableHead>
                                    <TableHead className="font-mono text-[10px] text-gray-200 uppercase font-bold text-right">Ledger sum</TableHead>
                                    <TableHead className="font-mono text-[10px] text-gray-200 uppercase font-bold text-right">Discrepancy</TableHead>
                                    <TableHead className="font-mono text-[10px] text-gray-200 uppercase font-bold text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {d.balance_anomalies.map((item) => (
                                    <TableRow
                                        key={item.user_id}
                                        className="border-gray-800 hover:bg-gray-900/40"
                                    >
                                        <TableCell
                                            className="text-gray-100 font-bold cursor-pointer hover:underline"
                                            onClick={() => window.open(`/admin/users?search=${item.email}`, '_blank')}
                                        >
                                            {item.email}
                                        </TableCell>
                                        <TableCell className="text-right text-gray-300 font-mono">GH₵{item.cached_balance}</TableCell>
                                        <TableCell className="text-right text-gray-300 font-mono">GH₵{item.ledger_balance}</TableCell>
                                        <TableCell className="text-right">
                                            <Badge className={`font-bold ${item.discrepancy > 0 ? 'bg-red-500/30 text-red-500' : 'bg-emerald-500/30 text-emerald-500'}`}>
                                                {item.discrepancy > 0 ? '+' : ''}{item.discrepancy}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0 hover:bg-gray-800 text-gray-400 hover:text-white"
                                                title="Ignore this anomaly"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleIgnoreAnomaly(item.user_id, item.email);
                                                }}
                                            >
                                                <EyeOff className="w-3 h-3" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}

            <footer className="mt-8 pt-6 border-t border-gray-800 text-[10px] text-gray-400 flex justify-between uppercase tracking-widest">
                <span>BoostUp GH Internal Infrastructure</span>
                <span>SECURED BY SUPABASE_PG_POLICIES</span>
            </footer>
        </div>
    );
};

export default DevDashboard;
