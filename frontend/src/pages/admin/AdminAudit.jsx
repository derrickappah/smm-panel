import React, { memo, useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
    ShieldCheck, ShieldAlert, Shield, AlertTriangle, CheckCircle2,
    RefreshCw, Search, Download, ExternalLink, Activity, DollarSign,
    Lock, Server, FileText, Database, EyeOff, Layers, Zap, Bug,
    CheckCircle, XCircle, Clock, AlertCircle, ArrowUpRight, Filter,
    Mail, Key, UserCheck, Smartphone, Flame, Send
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

// The 4 Primary Security Event Categories & Live Alert Triggers
const SECURITY_EVENT_CATEGORIES = [
    {
        id: 'permissions',
        category: '1. Account Permissions & Administrative Actions',
        icon: UserCheck,
        badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        description: 'Monitors privilege escalations, manual balance adjustments, and session revocations.',
        events: [
            {
                name: 'PRIVILEGE_ESCALATION_ADMIN',
                severity: 'security',
                channel: 'email',
                sourceFile: 'api/admin/update-user-role.js',
                status: 'Email Alert (Critical)',
                triggerCondition: 'Any user account is promoted or assigned the admin role by an administrator.'
            },
            {
                name: 'ADMIN_BALANCE_OVERRIDE',
                severity: 'security',
                channel: 'email',
                sourceFile: 'api/admin/update-user-balance.js',
                status: 'Email Alert (Critical)',
                triggerCondition: "An administrator manually credits, debits, or overwrites a user's wallet balance."
            },
            {
                name: 'USER_SESSION_REVOCATION',
                severity: 'security',
                channel: 'log',
                sourceFile: 'api/admin/revoke-user-sessions.js',
                status: 'Dashboard Log (Audited)',
                triggerCondition: 'An admin forces the revocation of all active sessions and refresh tokens for a user.'
            }
        ]
    },
    {
        id: 'financial',
        category: '2. Financial & Payment Integrity',
        icon: DollarSign,
        badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        description: 'Defends against amount tampering, unauthorized deposit validations, and ledger discrepancies.',
        events: [
            {
                name: 'PAYMENT_AMOUNT_MISMATCH',
                severity: 'critical',
                channel: 'email',
                sourceFile: 'api/secure-payment-callback.js',
                status: 'Email Alert (Critical)',
                triggerCondition: 'A gateway webhook (Paystack, KoraPay, Hubtel, Moolre) reports an amount paid that differs from the registered deposit amount.'
            },
            {
                name: 'UNAUTHORIZED_DEPOSIT_APPROVAL',
                severity: 'security',
                channel: 'email',
                sourceFile: 'api/approve-deposit-universal.js',
                status: 'Email Alert (Critical)',
                triggerCondition: 'An unauthenticated caller or non-admin attempts to approve or force a deposit transaction.'
            },
            {
                name: 'LEDGER_BALANCE_DISCREPANCY',
                severity: 'critical',
                channel: 'email',
                sourceFile: 'database/migrations/SYSTEM_HARDENING.sql',
                status: 'Email Alert (Critical)',
                triggerCondition: 'The automated ledger verifier detects a difference between a user balance and their audited transaction history.'
            },
            {
                name: 'MANUAL_PAYMENT_VERIFY_FAILURE',
                severity: 'security',
                channel: 'log',
                sourceFile: 'api/manual-verify-paystack-deposit.js',
                status: 'Dashboard Log (Audited)',
                triggerCondition: 'An administrator or system fails manual gateway verification due to mismatched external references.'
            }
        ]
    },
    {
        id: 'abuse',
        category: '3. Traffic Abuse & Order Anomalies',
        icon: Flame,
        badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
        description: 'Detects high-velocity spam link submissions, order bursts, and external provider orphan orders.',
        events: [
            {
                name: 'DUPLICATE_SPAM_CLUSTER',
                severity: 'warning',
                channel: 'log',
                sourceFile: 'api/admin/detect-suspicious-activity.js',
                status: 'Dashboard Log (Audited)',
                triggerCondition: '4 or more orders for the exact same target link and service are placed within 10 minutes.'
            },
            {
                name: 'ORDER_VOLUME_SPIKE',
                severity: 'warning',
                channel: 'log',
                sourceFile: 'api/admin/detect-suspicious-activity.js',
                status: 'Dashboard Log (Audited)',
                triggerCondition: 'A single user account submits more than 20 orders within 10 minutes.'
            },
            {
                name: 'GHOST_ORDER_DETECTED',
                severity: 'critical',
                channel: 'email',
                sourceFile: 'api/admin/detect-ghost-orders.js',
                status: 'Email Alert (Critical)',
                triggerCondition: 'Automated reconciliation finds orders on external providers (SMMGen, SMMCost, etc.) that do not match local records.'
            }
        ]
    },
    {
        id: 'auth',
        category: '4. Authentication & Access Violations',
        icon: Key,
        badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
        description: 'Guards against credential stuffing, brute-force OTP probes, banned devices, and sustained API abuse.',
        events: [
            {
                name: 'OTP_BRUTE_FORCE_DETECTED',
                severity: 'security',
                channel: 'email',
                sourceFile: 'api/auth/verify-otp.js',
                status: 'Email Alert (Critical)',
                triggerCondition: '5 consecutive failed OTP code entries are made against a phone number or email (code gets invalidated).'
            },
            {
                name: 'BANNED_DEVICE_LOGIN_ATTEMPT',
                severity: 'security',
                channel: 'log',
                sourceFile: 'api/utils/deviceAuth.js',
                status: 'Dashboard Log (Audited)',
                triggerCondition: 'A device or IP fingerprint previously marked as banned attempts to access account endpoints.'
            },
            {
                name: 'HIGH_VELOCITY_LOGIN_FAILURES',
                severity: 'security',
                channel: 'email',
                sourceFile: 'api/auth/log-event.js',
                status: 'Email Alert (Critical)',
                triggerCondition: 'Repeated failed login attempts (5+) against accounts from the same source IP within 5 minutes.'
            },
            {
                name: 'RATE_LIMIT_SUSTAINED_BURST',
                severity: 'warning',
                channel: 'log',
                sourceFile: 'api/middleware/rateLimit.js',
                status: 'Dashboard Log (Audited)',
                triggerCondition: 'Rapid automated requests exceeding 30 req/min (IP) or 10 req/min (user order rate limit).'
            }
        ]
    }
];

const AdminAudit = memo(({ onRefresh, refreshing = false }) => {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState('triggers');
    const [scanning, setScanning] = useState(false);
    const [reconciling, setReconciling] = useState(false);

    // Filters
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [matrixSearch, setMatrixSearch] = useState('');
    const [eventSeverityFilter, setEventSeverityFilter] = useState('all');
    const [eventSearch, setEventSearch] = useState('');
    const [balanceSearch, setBalanceSearch] = useState('');
    const [resolvingId, setResolvingId] = useState(null);

    // Fetch System Monitor & Health Data
    const { data: monitorData, isLoading: isLoadingMonitor, refetch: refetchMonitor } = useQuery({
        queryKey: ['admin', 'audit-monitor-system'],
        queryFn: async () => {
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch('/api/admin/monitor-system', {
                headers: {
                    'Authorization': `Bearer ${session?.access_token}`
                }
            });
            if (!response.ok) {
                const { data: summary } = await supabase.from('dev_monitoring_summary').select('*').maybeSingle();
                const { count: ghostCount } = await supabase.from('security_ghost_orders').select('*', { count: 'exact', head: true }).eq('is_resolved', false);
                const { count: suspCount } = await supabase.from('security_suspicious_activity').select('*', { count: 'exact', head: true }).eq('is_resolved', false);
                return {
                    metrics: {
                        ...summary,
                        advanced_security: {
                            ghost_orders: ghostCount || 0,
                            suspicious_activity: suspCount || 0
                        }
                    }
                };
            }
            return response.json();
        },
        refetchInterval: 15000
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

            if (error) {
                console.warn('Error fetching balance verification:', error);
                return [];
            }
            return data || [];
        }
    });

    // Fetch Historical Balance Audit Log
    const { data: balanceLogs = [], isLoading: isLoadingBalanceLogs, refetch: refetchBalanceLogs } = useQuery({
        queryKey: ['admin', 'audit-balance-logs'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('balance_audit_log')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) {
                console.warn('Error fetching balance audit logs:', error);
                return [];
            }
            return data || [];
        }
    });

    // Fetch Suspicious Activity & Spam Clusters
    const { data: suspiciousActivities = [], isLoading: isLoadingSuspicious, refetch: refetchSuspicious } = useQuery({
        queryKey: ['admin', 'audit-suspicious-activity'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('security_suspicious_activity')
                .select('*')
                .order('detected_at', { ascending: false })
                .limit(100);

            if (error) {
                console.warn('Error fetching suspicious activity:', error);
                return [];
            }
            return data || [];
        }
    });

    // Fetch Ghost Orders
    const { data: ghostOrders = [], isLoading: isLoadingGhosts, refetch: refetchGhosts } = useQuery({
        queryKey: ['admin', 'audit-ghost-orders'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('security_ghost_orders')
                .select('*')
                .order('detected_at', { ascending: false })
                .limit(100);

            if (error) {
                console.warn('Error fetching ghost orders:', error);
                return [];
            }
            return data || [];
        }
    });

    // Fetch System Events Log
    const { data: systemEvents = [], isLoading: isLoadingEvents, refetch: refetchEvents } = useQuery({
        queryKey: ['admin', 'audit-system-events'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('system_events')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(150);

            if (error) {
                console.warn('Error fetching system events:', error);
                return [];
            }
            return data || [];
        }
    });

    // Realtime subscriptions for live events
    useEffect(() => {
        const auditChannel = supabase
            .channel('admin-audit-live')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'system_events' }, () => {
                refetchEvents();
                refetchMonitor();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'security_suspicious_activity' }, () => {
                refetchSuspicious();
                refetchMonitor();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'security_ghost_orders' }, () => {
                refetchGhosts();
                refetchMonitor();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(auditChannel);
        };
    }, [refetchEvents, refetchMonitor, refetchSuspicious, refetchGhosts]);

    // Handle Deep Security Scan Trigger
    const handleRunDeepScan = async () => {
        setScanning(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch('/api/admin/run-security-scan', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session?.access_token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!res.ok) throw new Error('Failed to run security scan');
            const data = await res.json();
            toast.success(`Security Scan Complete: ${data.ghost_orders || 0} Ghost Orders, ${data.spam_clusters || 0} Abuse Clusters flagged.`);
            refetchMonitor();
            refetchGhosts();
            refetchSuspicious();
        } catch (err) {
            console.error('Scan error:', err);
            toast.error(err.message || 'Security scan failed');
        } finally {
            setScanning(false);
        }
    };

    // Handle Order Reconciliation Trigger
    const handleRunReconciliation = async () => {
        setReconciling(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch('/api/admin/reconcile-orders', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session?.access_token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!res.ok) throw new Error('Reconciliation execution failed');
            const data = await res.json();
            toast.success('Order & Balance Reconciliation completed successfully.');
            refetchMonitor();
            refetchBalance();
        } catch (err) {
            console.error('Reconciliation error:', err);
            toast.error(err.message || 'Reconciliation failed');
        } finally {
            setReconciling(false);
        }
    };

    // Handle Ignore Balance Anomaly
    const handleIgnoreAnomaly = async (userId, userEmail) => {
        if (!confirm(`Are you sure you want to ignore anomalies for ${userEmail || userId}?`)) return;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch('/api/admin/ignore-anomaly', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session?.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ userId })
            });
            if (!res.ok) throw new Error('Failed to ignore anomaly');
            toast.success(`Anomaly for ${userEmail || userId} marked as ignored.`);
            refetchBalance();
        } catch (err) {
            toast.error(err.message || 'Could not ignore anomaly');
        }
    };

    // Handle Resolve Threat Item
    const handleResolveThreat = async (table, id) => {
        setResolvingId(id);
        try {
            const { error } = await supabase
                .from(table)
                .update({ is_resolved: true })
                .eq('id', id);

            if (error) throw error;
            toast.success('Threat marked as resolved');
            if (table === 'security_suspicious_activity') refetchSuspicious();
            if (table === 'security_ghost_orders') refetchGhosts();
        } catch (err) {
            toast.error(err.message || 'Failed to update threat status');
        } finally {
            setResolvingId(null);
        }
    };

    // Export Audit Log to CSV
    const exportAuditCSV = () => {
        const headers = ['Category', 'Event Name', 'Severity', 'Source File', 'Status', 'Trigger Condition'];
        const allEvents = SECURITY_EVENT_CATEGORIES.flatMap(cat =>
            cat.events.map(ev => [
                `"${cat.category}"`,
                `"${ev.name}"`,
                `"${ev.severity}"`,
                `"${ev.sourceFile}"`,
                `"${ev.status}"`,
                `"${ev.triggerCondition.replace(/"/g, '""')}"`
            ])
        );

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...allEvents.map(r => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `security_events_catalog_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Security events catalog exported successfully');
    };

    // Filtered Categories & Events
    const filteredCategories = useMemo(() => {
        return SECURITY_EVENT_CATEGORIES
            .filter(cat => categoryFilter === 'all' || cat.id === categoryFilter)
            .map(cat => {
                const searchLower = matrixSearch.toLowerCase();
                const matchedEvents = cat.events.filter(ev =>
                    !matrixSearch ||
                    ev.name.toLowerCase().includes(searchLower) ||
                    ev.sourceFile.toLowerCase().includes(searchLower) ||
                    ev.triggerCondition.toLowerCase().includes(searchLower) ||
                    ev.severity.toLowerCase().includes(searchLower)
                );
                return { ...cat, events: matchedEvents };
            })
            .filter(cat => cat.events.length > 0);
    }, [categoryFilter, matrixSearch]);

    // Filtered System Events
    const filteredEvents = useMemo(() => {
        return systemEvents.filter(ev => {
            const matchSeverity = eventSeverityFilter === 'all' || ev.severity === eventSeverityFilter;
            const searchLower = eventSearch.toLowerCase();
            const matchSearch = !eventSearch ||
                (ev.event_type && ev.event_type.toLowerCase().includes(searchLower)) ||
                (JSON.stringify(ev.details || {}).toLowerCase().includes(searchLower));
            return matchSeverity && matchSearch;
        });
    }, [systemEvents, eventSeverityFilter, eventSearch]);

    // Filtered Balance Anomalies
    const filteredBalanceAnomalies = useMemo(() => {
        if (!balanceSearch) return balanceAnomalies;
        const s = balanceSearch.toLowerCase();
        return balanceAnomalies.filter(b =>
            (b.user_email && b.user_email.toLowerCase().includes(s)) ||
            (b.user_id && b.user_id.toLowerCase().includes(s))
        );
    }, [balanceAnomalies, balanceSearch]);

    const metrics = monitorData?.metrics || {};
    const ghostCount = metrics.advanced_security?.ghost_orders || ghostOrders.filter(g => !g.is_resolved).length;
    const suspiciousCount = metrics.advanced_security?.suspicious_activity || suspiciousActivities.filter(s => !s.is_resolved).length;
    const balanceDiscrepancies = balanceAnomalies.length;
    const totalTriggersCount = SECURITY_EVENT_CATEGORIES.reduce((acc, cat) => acc + cat.events.length, 0);

    const getSeverityBadge = (severity) => {
        switch (severity) {
            case 'critical':
                return <Badge className="bg-red-100 text-red-800 border-red-200 font-mono text-[11px] uppercase">critical</Badge>;
            case 'security':
                return <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-mono text-[11px] uppercase">security</Badge>;
            case 'warning':
                return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 font-mono text-[11px] uppercase">warning</Badge>;
            default:
                return <Badge className="bg-blue-100 text-blue-800 border-blue-200 font-mono text-[11px] uppercase">info</Badge>;
        }
    };

    return (
        <div className="space-y-6 pb-12">
            {/* Header with Quick Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                <div>
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="w-7 h-7 text-indigo-600" />
                        <h1 className="text-2xl font-bold text-gray-900">Security & Alert Audit</h1>
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                            Resend Email Alerting Active
                        </Badge>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                        Real-time security logging, abuse detection rules, and automated incident notifications.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        onClick={handleRunDeepScan}
                        disabled={scanning}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 shadow-sm"
                    >
                        {scanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                        <span>{scanning ? 'Scanning...' : 'Run Security Scan'}</span>
                    </Button>
                    <Button
                        onClick={handleRunReconciliation}
                        disabled={reconciling}
                        variant="outline"
                        className="border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                        {reconciling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                        <span>{reconciling ? 'Reconciling...' : 'Reconcile Orders'}</span>
                    </Button>
                    <Button
                        onClick={exportAuditCSV}
                        variant="outline"
                        className="border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                        <Download className="w-4 h-4" />
                        <span>Export Catalog</span>
                    </Button>
                </div>
            </div>

            {/* Event Metrics & Health Overview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-emerald-200 bg-emerald-50/40">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold text-emerald-900">Active Alert Rules</CardTitle>
                            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-800">{totalTriggersCount} Rules</div>
                        <p className="text-xs text-emerald-600 mt-1">8 Critical Email • 6 Dashboard Audited</p>
                    </CardContent>
                </Card>

                <Card className="border-blue-200 bg-blue-50/40">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold text-blue-900">Resend Quota Guard</CardTitle>
                            <Mail className="w-5 h-5 text-blue-600" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-800">Critical Only</div>
                        <p className="text-xs text-blue-600 mt-1">Max 70 emails/day budget (100 cap protected)</p>
                    </CardContent>
                </Card>

                <Card className={balanceDiscrepancies > 0 ? "border-amber-200 bg-amber-50/40" : "border-gray-200"}>
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold text-gray-900">Ledger Discrepancies</CardTitle>
                            <DollarSign className={`w-5 h-5 ${balanceDiscrepancies > 0 ? 'text-amber-600' : 'text-gray-400'}`} />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${balanceDiscrepancies > 0 ? 'text-amber-700' : 'text-gray-900'}`}>
                            {balanceDiscrepancies}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Users flagged with balance variances</p>
                    </CardContent>
                </Card>

                <Card className={(ghostCount + suspiciousCount) > 0 ? "border-rose-200 bg-rose-50/40" : "border-gray-200"}>
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold text-gray-900">Detected Threats</CardTitle>
                            <ShieldAlert className={`w-5 h-5 ${(ghostCount + suspiciousCount) > 0 ? 'text-rose-600' : 'text-gray-400'}`} />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${(ghostCount + suspiciousCount) > 0 ? 'text-rose-700' : 'text-gray-900'}`}>
                            {ghostCount + suspiciousCount}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Active ghost orders & spam clusters</p>
                    </CardContent>
                </Card>
            </div>

            {/* Main Tabs Container */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-white border border-gray-200 p-1 rounded-lg w-full flex overflow-x-auto justify-start gap-1">
                    <TabsTrigger value="triggers" className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4" />
                        <span>Security Event Catalog ({totalTriggersCount})</span>
                    </TabsTrigger>
                    <TabsTrigger value="events" className="flex items-center gap-2">
                        <Activity className="w-4 h-4" />
                        <span>Live System Events</span>
                    </TabsTrigger>
                    <TabsTrigger value="ledger" className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4" />
                        <span>Balance & Ledger</span>
                        {balanceDiscrepancies > 0 && (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-xs px-1.5 py-0">
                                {balanceDiscrepancies}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="threats" className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4" />
                        <span>Threats & Ghost Orders</span>
                        {(ghostCount + suspiciousCount) > 0 && (
                            <Badge variant="secondary" className="bg-rose-100 text-rose-800 text-xs px-1.5 py-0">
                                {ghostCount + suspiciousCount}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="balance-history" className="flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        <span>Balance Mutation Logs</span>
                    </TabsTrigger>
                </TabsList>

                {/* Tab 1: 4 Security Event Categories Catalog */}
                <TabsContent value="triggers" className="mt-4 space-y-6">
                    {/* Filter & Search Bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-1">Layer:</span>
                            <Button
                                size="sm"
                                variant={categoryFilter === 'all' ? 'default' : 'outline'}
                                className={categoryFilter === 'all' ? 'bg-indigo-600 text-white h-8' : 'h-8 text-xs'}
                                onClick={() => setCategoryFilter('all')}
                            >
                                All Layers ({totalTriggersCount})
                            </Button>
                            <Button
                                size="sm"
                                variant={categoryFilter === 'permissions' ? 'default' : 'outline'}
                                className={categoryFilter === 'permissions' ? 'bg-indigo-600 text-white h-8' : 'h-8 text-xs'}
                                onClick={() => setCategoryFilter('permissions')}
                            >
                                1. Permissions (3)
                            </Button>
                            <Button
                                size="sm"
                                variant={categoryFilter === 'financial' ? 'default' : 'outline'}
                                className={categoryFilter === 'financial' ? 'bg-indigo-600 text-white h-8' : 'h-8 text-xs'}
                                onClick={() => setCategoryFilter('financial')}
                            >
                                2. Financial (4)
                            </Button>
                            <Button
                                size="sm"
                                variant={categoryFilter === 'abuse' ? 'default' : 'outline'}
                                className={categoryFilter === 'abuse' ? 'bg-indigo-600 text-white h-8' : 'h-8 text-xs'}
                                onClick={() => setCategoryFilter('abuse')}
                            >
                                3. Abuse & Orders (3)
                            </Button>
                            <Button
                                size="sm"
                                variant={categoryFilter === 'auth' ? 'default' : 'outline'}
                                className={categoryFilter === 'auth' ? 'bg-indigo-600 text-white h-8' : 'h-8 text-xs'}
                                onClick={() => setCategoryFilter('auth')}
                            >
                                4. Auth & Access (4)
                            </Button>
                        </div>
                        <div className="flex items-center gap-2">
                            <Input
                                placeholder="Search event name, source file or trigger..."
                                value={matrixSearch}
                                onChange={(e) => setMatrixSearch(e.target.value)}
                                className="w-64 text-sm h-8"
                            />
                        </div>
                    </div>

                    {/* Categorized Tables */}
                    {filteredCategories.map((group) => {
                        const GroupIcon = group.icon;
                        return (
                            <Card key={group.id} className="overflow-hidden border-gray-200 shadow-sm">
                                <CardHeader className="bg-gray-50/80 border-b border-gray-200 py-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                        <div className="flex items-center gap-2.5">
                                            <div className="p-1.5 bg-white rounded-md border border-gray-200 shadow-2xs">
                                                <GroupIcon className="w-5 h-5 text-indigo-600" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-base font-bold text-gray-900">
                                                    {group.category}
                                                </CardTitle>
                                                <CardDescription className="text-xs text-gray-500">
                                                    {group.description}
                                                </CardDescription>
                                            </div>
                                        </div>
                                        <Badge variant="outline" className={group.badgeColor}>
                                            {group.events.length} Events Configured
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="bg-white">
                                                    <TableHead className="w-[240px] text-xs font-semibold text-gray-700">Event Name</TableHead>
                                                    <TableHead className="w-[100px] text-xs font-semibold text-gray-700">Severity</TableHead>
                                                    <TableHead className="w-[220px] text-xs font-semibold text-gray-700">Source File</TableHead>
                                                    <TableHead className="w-[170px] text-xs font-semibold text-gray-700">Alert Channel</TableHead>
                                                    <TableHead className="text-xs font-semibold text-gray-700">What Triggers It</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {group.events.map((ev) => (
                                                    <TableRow key={ev.name} className="hover:bg-gray-50/60 transition-colors">
                                                        <TableCell className="font-mono text-xs font-bold text-gray-900">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`w-2 h-2 rounded-full ${ev.channel === 'email' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                                                                <span>{ev.name}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            {getSeverityBadge(ev.severity)}
                                                        </TableCell>
                                                        <TableCell>
                                                            <code className="font-mono text-[11px] bg-gray-100 text-gray-800 px-2 py-0.5 rounded border border-gray-200">
                                                                {ev.sourceFile}
                                                            </code>
                                                        </TableCell>
                                                        <TableCell>
                                                            {ev.channel === 'email' ? (
                                                                <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 w-fit">
                                                                    <Mail className="w-3.5 h-3.5 text-emerald-600" />
                                                                    <span>Email (Critical)</span>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium bg-slate-50 px-2 py-0.5 rounded border border-slate-200 w-fit">
                                                                    <FileText className="w-3.5 h-3.5 text-slate-500" />
                                                                    <span>Dashboard Log</span>
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-xs text-gray-600 leading-relaxed">
                                                            {ev.triggerCondition}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </TabsContent>

                {/* Tab 2: Balance & Ledger Audit */}
                <TabsContent value="ledger" className="mt-4 space-y-4">
                    <Card>
                        <CardHeader>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div>
                                    <CardTitle className="text-lg">Ledger Balance Exceptions</CardTitle>
                                    <CardDescription>
                                        Calculated differences between historical deposits, order charges, refunds, and current profile balances.
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Input
                                        placeholder="Search by email or user ID..."
                                        value={balanceSearch}
                                        onChange={(e) => setBalanceSearch(e.target.value)}
                                        className="w-64 text-sm"
                                    />
                                    <Button
                                        onClick={() => refetchBalance()}
                                        variant="outline"
                                        size="icon"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {isLoadingBalance ? (
                                <div className="py-8 text-center text-gray-500">Loading ledger balance data...</div>
                            ) : filteredBalanceAnomalies.length === 0 ? (
                                <div className="py-12 text-center">
                                    <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                                    <p className="text-base font-semibold text-gray-900">Zero Ledger Discrepancies</p>
                                    <p className="text-sm text-gray-500 mt-1">All user balances match their deposit and order history ledger.</p>
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
                                                <TableHead className="text-right">Action</TableHead>
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
                                                    <TableCell className="text-right">
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="text-xs text-gray-600 hover:text-gray-900"
                                                            onClick={() => handleIgnoreAnomaly(row.user_id, row.user_email)}
                                                        >
                                                            <EyeOff className="w-3.5 h-3.5 mr-1" />
                                                            Ignore
                                                        </Button>
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

                {/* Tab 3: Threats & Ghost Orders */}
                <TabsContent value="threats" className="mt-4 space-y-6">
                    {/* Ghost Orders Section */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-lg">Ghost / Orphan Orders</CardTitle>
                                    <CardDescription>
                                        Orders executed on external provider gateways without corresponding finalized internal records.
                                    </CardDescription>
                                </div>
                                <Button onClick={() => refetchGhosts()} variant="outline" size="sm">
                                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                                    Refresh
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {isLoadingGhosts ? (
                                <div className="py-6 text-center text-gray-500">Checking ghost orders...</div>
                            ) : ghostOrders.length === 0 ? (
                                <div className="py-8 text-center text-gray-500 text-sm">
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
                                    <CardTitle className="text-lg">Abuse & Spam Detection Clusters</CardTitle>
                                    <CardDescription>
                                        Automated traffic analysis detecting rapid duplicate link ordering and volume anomalies.
                                    </CardDescription>
                                </div>
                                <Button onClick={() => refetchSuspicious()} variant="outline" size="sm">
                                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                                    Refresh
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {isLoadingSuspicious ? (
                                <div className="py-6 text-center text-gray-500">Loading abuse detection logs...</div>
                            ) : suspiciousActivities.length === 0 ? (
                                <div className="py-8 text-center text-gray-500 text-sm">
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
                                                        {act.activity_type.replace(/_/g, ' ')}
                                                    </TableCell>
                                                    <TableCell className="text-xs truncate max-w-[240px] font-mono">{act.link || 'N/A'}</TableCell>
                                                    <TableCell className="text-xs font-bold">{act.event_count}x</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className={act.severity === 'high' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}>
                                                            {act.severity}
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

                {/* Tab 4: System Audit Events */}
                <TabsContent value="events" className="mt-4 space-y-4">
                    <Card>
                        <CardHeader>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div>
                                    <CardTitle className="text-lg">Realtime System Security Events</CardTitle>
                                    <CardDescription>
                                        Live audit trail of security events, rate limit breaches, and provider anomalies.
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Select value={eventSeverityFilter} onValueChange={setEventSeverityFilter}>
                                        <SelectTrigger className="w-36 text-xs">
                                            <SelectValue placeholder="Severity" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Severities</SelectItem>
                                            <SelectItem value="critical">Critical</SelectItem>
                                            <SelectItem value="warning">Warning</SelectItem>
                                            <SelectItem value="info">Info</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        placeholder="Search event type..."
                                        value={eventSearch}
                                        onChange={(e) => setEventSearch(e.target.value)}
                                        className="w-48 text-xs"
                                    />
                                    <Button onClick={() => refetchEvents()} variant="outline" size="icon">
                                        <RefreshCw className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {isLoadingEvents ? (
                                <div className="py-6 text-center text-gray-500">Loading system events...</div>
                            ) : filteredEvents.length === 0 ? (
                                <div className="py-8 text-center text-gray-500 text-sm">
                                    No system events matching the selected filters.
                                </div>
                            ) : (
                                <div className="overflow-x-auto max-h-[500px]">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Event Type</TableHead>
                                                <TableHead>Severity</TableHead>
                                                <TableHead>Details / Payload</TableHead>
                                                <TableHead>Timestamp</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredEvents.map((ev) => (
                                                <TableRow key={ev.id}>
                                                    <TableCell className="font-semibold text-xs font-mono">
                                                        {ev.event_type}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className={
                                                            ev.severity === 'critical' ? 'bg-red-50 text-red-700 border-red-200' :
                                                            ev.severity === 'warning' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                            'bg-gray-50 text-gray-700'
                                                        }>
                                                            {ev.severity || 'info'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-xs font-mono text-gray-600 max-w-[320px] truncate">
                                                        {JSON.stringify(ev.details || {})}
                                                    </TableCell>
                                                    <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                                                        {new Date(ev.created_at).toLocaleString()}
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

                {/* Tab 5: Balance Mutation Logs */}
                <TabsContent value="balance-history" className="mt-4 space-y-4">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-lg">Balance Audit History Log</CardTitle>
                                    <CardDescription>
                                        Immutable record of balance adjustments, deposit credits, and order debits.
                                    </CardDescription>
                                </div>
                                <Button onClick={() => refetchBalanceLogs()} variant="outline" size="sm">
                                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                                    Refresh
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {isLoadingBalanceLogs ? (
                                <div className="py-6 text-center text-gray-500">Loading balance mutation history...</div>
                            ) : balanceLogs.length === 0 ? (
                                <div className="py-8 text-center text-gray-500 text-sm">
                                    No balance log entries recorded.
                                </div>
                            ) : (
                                <div className="overflow-x-auto max-h-[500px]">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>User ID</TableHead>
                                                <TableHead>Old Balance</TableHead>
                                                <TableHead>New Balance</TableHead>
                                                <TableHead>Amount Changed</TableHead>
                                                <TableHead>Reason / Trigger</TableHead>
                                                <TableHead>Timestamp</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {balanceLogs.map((log) => (
                                                <TableRow key={log.id}>
                                                    <TableCell className="font-mono text-xs">{log.user_id}</TableCell>
                                                    <TableCell className="text-xs">₵{parseFloat(log.old_balance || 0).toFixed(2)}</TableCell>
                                                    <TableCell className="text-xs font-semibold">₵{parseFloat(log.new_balance || 0).toFixed(2)}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className={parseFloat(log.change_amount || 0) >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}>
                                                            {parseFloat(log.change_amount || 0) >= 0 ? '+' : ''}₵{parseFloat(log.change_amount || 0).toFixed(2)}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-xs text-gray-700">{log.change_reason || 'N/A'}</TableCell>
                                                    <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                                                        {new Date(log.created_at).toLocaleString()}
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
