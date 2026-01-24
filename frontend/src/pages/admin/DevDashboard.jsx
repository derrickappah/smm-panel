import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
    Server, ShieldAlert, Activity, CreditCard,
    ShoppingCart, AlertTriangle, CheckCircle, Clock,
    RefreshCw, TrendingDown, TrendingUp, Search, Crosshair, ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import SEO from '@/components/SEO';
import { toast } from 'sonner';

const DevDashboard = ({ user }) => {
    const [refreshInterval, setRefreshInterval] = useState(30 * 60000); // 30m auto-refresh for full scan
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
        refetchInterval: refreshInterval
    });

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
                    <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider">
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
                        <Activity className="text-emerald-500" />
                        SYSTEM_RELIABILITY_V1
                        <Badge variant="secondary" className="bg-gray-800 text-gray-300 border-gray-700">HIDDEN_ADMIN_ONLY</Badge>
                    </h1>
                    <p className="text-sm text-emerald-400/80 mt-1">REAL-TIME TELEMETRY FEED: {monitorData?.timestamp}</p>
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
                    description={`FAILURES: ${m.order_pipeline?.failed || 0}`}
                    status={m.order_pipeline?.failed > 5 ? 'warning' : 'healthy'}
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
            {reconData && (
                <Card className="bg-gray-950 border-gray-800 mb-8 overflow-hidden">
                    <CardHeader className="border-b border-gray-900 pb-4 flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                <Crosshair className="w-4 h-4 text-indigo-500" />
                                ORDER_RECONCILIATION_PANEL
                            </CardTitle>
                            <CardDescription className="text-[10px] uppercase font-mono">
                                Discrepancy scan result: {reconData.timestamp}
                            </CardDescription>
                        </div>
                        <div className="flex gap-4">
                            <div className="text-center">
                                <div className="text-xl font-bold text-white leading-none">{reconData.summary.ok_count}</div>
                                <div className="text-[8px] text-emerald-500 uppercase">OK_VERIFIED</div>
                            </div>
                            <div className="text-center">
                                <div className="text-xl font-bold text-red-500 leading-none">{reconData.summary.mismatch_count}</div>
                                <div className="text-[8px] text-red-500 uppercase">STATUS_MISM</div>
                            </div>
                            <div className="text-center">
                                <div className="text-xl font-bold text-yellow-500 leading-none">{reconData.summary.missing_count}</div>
                                <div className="text-[8px] text-yellow-500 uppercase">MISSING_ORD</div>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {reconData.mismatches?.length > 0 ? (
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
                                            <TableCell className="font-mono text-[9px] text-gray-300 truncate max-w-[100px] flex items-center gap-1">
                                                <ExternalLink className="w-2 h-2 text-indigo-400" />
                                                {item.order_id}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-[8px] border-gray-600 text-gray-200">{item.local_status}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-[8px] text-indigo-300 border-indigo-500/40">{item.provider_status}</Badge>
                                            </TableCell>
                                            <TableCell className="text-gray-300 font-bold">{item.age_mins}M</TableCell>
                                            <TableCell className="text-right">
                                                <Badge className={
                                                    item.classification === 'STATUS_MISMATCH' ? 'bg-red-500/20 text-red-400 border-red-500/50' :
                                                        item.classification === 'MISSING_PROVIDER_ORDER' ? 'bg-orange-500/20 text-orange-400 border-orange-500/50' :
                                                            'bg-yellow-500/20 text-yellow-400 border-yellow-500/50'
                                                }>
                                                    {item.classification}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <div className="py-8 text-center text-[10px] text-gray-400 uppercase tracking-widest">
                                Zero discrepancies detected in latest batch
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* SYSTEM EVENTS LOG */}
                <Card className="bg-gray-950 border-gray-800">
                    <CardHeader>
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <Activity className="w-4 h-4 text-emerald-500" />
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
                                        <span className="text-gray-400 font-bold">{new Date(event.created_at).toLocaleTimeString()}</span>
                                    </div>
                                    <p className="text-gray-200 font-medium">{event.description}</p>
                                </div>
                            </div>
                        )) : (
                            <p className="text-xs text-gray-400 text-center py-8">NO_CRITICAL_EVENTS_DETECTED</p>
                        )}
                    </CardContent>
                </Card>

                {/* SECURITY & ANOMALIES */}
                <Card className="bg-gray-950 border-gray-800">
                    <CardHeader>
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4 text-emerald-500" />
                            SECURITY_SIGNALS
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-3 border border-gray-800 rounded bg-gray-900/30">
                            <span className="text-xs uppercase text-gray-200 font-bold">Balance Anomalies</span>
                            <Badge variant="outline" className={m.security_signals?.balance_discrepancies > 0 ? 'text-red-500 border-red-500 bg-red-500/10' : 'text-emerald-400 border-emerald-500/50 bg-emerald-500/5'}>
                                {m.security_signals?.balance_discrepancies || 0} DETECTED
                            </Badge>
                        </div>
                        <div className="flex items-center justify-between p-3 border border-gray-800 rounded bg-gray-900/30">
                            <span className="text-xs uppercase text-gray-200 font-bold">Rate Limit Hits (1h)</span>
                            <Badge variant="outline" className={m.system_events?.rate_limits_today > 20 ? 'text-yellow-500 border-yellow-500' : 'text-gray-300 border-gray-700'}>
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

            <footer className="mt-8 pt-6 border-t border-gray-800 text-[10px] text-gray-400 flex justify-between uppercase tracking-widest">
                <span>BoostUp GH Internal Infrastructure</span>
                <span>SECURED BY SUPABASE_PG_POLICIES</span>
            </footer>
        </div>
    );
};

export default DevDashboard;
