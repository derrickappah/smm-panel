import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
    Users, DollarSign, ShoppingCart, Activity, RefreshCw, Download, 
    Search, ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, Globe, Monitor, Compass, TrendingUp
} from 'lucide-react';
import { toast } from 'sonner';
import { 
    ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, AreaChart, Area
} from 'recharts';

// Segment constants
const SEGMENTS = {
    all: { label: 'All Users', desc: 'Every registered user profile', color: '#6366f1' },
    deposited_and_used: { label: 'Active Depositors', desc: 'Deposited and placed orders', color: '#10b981' },
    deposited_unused: { label: 'Idle Depositors', desc: 'Deposited but left balance unused', color: '#f59e0b' },
    never_deposited_or_ordered: { label: 'Dead Signups', desc: 'Registered but never deposited or ordered', color: '#ef4444' },
    browsers: { label: 'Browsers', desc: 'Active in last 30 days but never deposited', color: '#06b6d4' },
    frequent_buyers: { label: 'Frequent Buyers', desc: 'Customers with 10+ orders', color: '#8b5cf6' }
};

// Gradient reference mapping
const GRADIENTS = [
    'url(#emeraldGrad)',
    'url(#amberGrad)',
    'url(#roseGrad)',
    'url(#cyanGrad)',
    'url(#purpleGrad)'
];

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6'];

// Country flag generator from ISO code (e.g. GH -> 🇬🇭)
const getFlagEmoji = (countryCode) => {
    if (!countryCode || countryCode === 'UN') return '🌐';
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 127397 + char.charCodeAt(0));
    try {
        return String.fromCodePoint(...codePoints);
    } catch (e) {
        return '🌐';
    }
};

// Premium Custom Tooltip Component
const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="bg-white/95 backdrop-blur-md border border-gray-200 p-3 rounded-lg shadow-xl text-xs space-y-1.5 min-w-[150px]">
                <p className="font-bold text-gray-900">{payload[0].name || data.date || data.name}</p>
                <div className="flex items-center gap-1.5 font-semibold text-indigo-600">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: payload[0].color || '#6366f1' }} />
                    <span>Users: <span className="font-extrabold text-gray-900">{payload[0].value.toLocaleString()}</span></span>
                </div>
                {data.desc && <p className="text-gray-500 text-[10px] italic">{data.desc}</p>}
            </div>
        );
    }
    return null;
};

export default function AdminAnalytics() {
    const [activeTab, setActiveTab] = useState('segmentation'); // 'segmentation' | 'live'
    
    // Live Tracker State
    const [onlineUsers, setOnlineUsers] = useState([]);
    
    // Segmentation Stats State
    const [segmentStats, setSegmentStats] = useState({
        total_users: 0,
        deposited_and_used: 0,
        deposited_unused: 0,
        never_deposited_or_ordered: 0,
        browsers: 0,
        frequent_buyers: 0
    });
    const [signupTrend, setSignupTrend] = useState([]);
    const [statsLoading, setStatsLoading] = useState(true);

    // List State
    const [activeSegment, setActiveSegment] = useState('all');
    const [usersList, setUsersList] = useState([]);
    const [listLoading, setListLoading] = useState(true);
    const [totalUsers, setTotalUsers] = useState(0);
    const [page, setPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState('created_at');
    const [sortOrder, setSortOrder] = useState('desc');
    const [activePieIndex, setActivePieIndex] = useState(-1);
    const limit = 50;

    // --- LIVE PRESENCE LOGIC ---
    useEffect(() => {
        if (activeTab !== 'live') return;

        // Connect to presence channel
        const channel = supabase.channel('online-users');

        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                const flattened = [];
                
                Object.keys(state).forEach(key => {
                    const presences = state[key];
                    if (presences && presences.length > 0) {
                        // In case of multiple tabs for same user, take the latest active
                        const latest = presences.reduce((prev, current) => {
                            return new Date(current.last_active) > new Date(prev.last_active) ? current : prev;
                        });
                        flattened.push(latest);
                    }
                });

                setOnlineUsers(flattened);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeTab]);

    // --- FETCH SEGMENTATION STATS ---
    const fetchStats = async () => {
        setStatsLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const res = await fetch('/api/admin/user-segmentation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ action: 'stats' })
            });

            if (!res.ok) throw new Error('Failed to fetch statistics');
            const data = await res.json();
            if (data.success && data.stats) {
                setSegmentStats(data.stats.counts || {});
                setSignupTrend(data.stats.trend || []);
            }
        } catch (err) {
            console.error('Stats fetch error:', err);
            toast.error('Failed to load user segmentation metrics');
        } finally {
            setStatsLoading(false);
        }
    };

    // --- FETCH SEGMENT USERS LIST ---
    const fetchUsersList = useCallback(async () => {
        setListLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const offset = (page - 1) * limit;

            const res = await fetch('/api/admin/user-segmentation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    action: 'list',
                    segment: activeSegment,
                    search: searchTerm,
                    limit,
                    offset,
                    sortField,
                    sortOrder
                })
            });

            if (!res.ok) throw new Error('Failed to fetch users list');
            const data = await res.json();
            if (data.success) {
                setUsersList(data.users);
                setTotalUsers(data.total);
            }
        } catch (err) {
            console.error('Users list fetch error:', err);
            toast.error('Failed to load segment users');
        } finally {
            setListLoading(false);
        }
    }, [activeSegment, page, searchTerm, sortField, sortOrder]);

    // Fetch initial segmentation stats on mount
    useEffect(() => {
        if (activeTab === 'segmentation') {
            fetchStats();
        }
    }, [activeTab]);

    // Re-fetch list on filter/page change
    useEffect(() => {
        if (activeTab === 'segmentation') {
            fetchUsersList();
        }
    }, [activeTab, fetchUsersList]);

    // Reset pagination on filter change
    const handleSegmentChange = (segment) => {
        setActiveSegment(segment);
        setPage(1);
    };

    // Toggle sorting parameters
    const handleSort = (field) => {
        if (sortField === field) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
        setPage(1);
    };

    // Export CSV
    const handleExportCSV = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            // Fetch ALL matching users in this segment (limit 10000 for csv export)
            const res = await fetch('/api/admin/user-segmentation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    action: 'list',
                    segment: activeSegment,
                    search: searchTerm,
                    limit: 10000,
                    offset: 0,
                    sortField,
                    sortOrder
                })
            });

            if (!res.ok) throw new Error('Failed to fetch export data');
            const data = await res.json();
            if (!data.success) throw new Error(data.error);

            const headers = ['Name', 'Email', 'Phone', 'Role', 'Balance (₵)', 'Spend (₵)', 'Deposits', 'Orders', 'Joined Date', 'Last Active'];
            const rows = data.users.map(u => [
                u.name || 'N/A',
                u.email || 'N/A',
                u.phone_number || 'N/A',
                u.role || 'user',
                u.balance?.toFixed(2) || '0.00',
                u.total_spend?.toFixed(2) || '0.00',
                u.approved_deposits_count || 0,
                u.total_orders_count || 0,
                u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A',
                u.last_active ? new Date(u.last_active).toLocaleString() : 'Never'
            ]);

            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            ].join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `segment_${activeSegment}_${new Date().toISOString().split('T')[0]}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success('Segment exported successfully');
        } catch (err) {
            console.error('CSV export failed:', err);
            toast.error('Failed to export segment data');
        }
    };

    // Recharts Formatting
    const chartData = useMemo(() => {
        return [
            { name: 'Active Depositors', value: segmentStats.deposited_and_used || 0, desc: 'Deposited & placed orders' },
            { name: 'Idle Depositors', value: segmentStats.deposited_unused || 0, desc: 'Left balance unused, 0 orders' },
            { name: 'Dead Signups', value: segmentStats.never_deposited_or_ordered || 0, desc: 'Never deposited or ordered' },
            { name: 'Browsers', value: segmentStats.browsers || 0, desc: 'Active last 30d, 0 deposits' },
            { name: 'Frequent Buyers', value: segmentStats.frequent_buyers || 0, desc: 'Placed 10+ orders' }
        ];
    }, [segmentStats]);

    // Live Tracker Metrics
    const liveMetrics = useMemo(() => {
        const total = onlineUsers.length;
        const members = onlineUsers.filter(u => !u.is_guest).length;
        const guests = total - members;
        return { total, members, guests };
    }, [onlineUsers]);

    // Track active pie slide hover
    const onPieEnter = useCallback((_, index) => {
        setActivePieIndex(index);
    }, []);

    const onPieLeave = useCallback(() => {
        setActivePieIndex(-1);
    }, []);

    return (
        <div className="space-y-6">
            {/* Top Navigation Tabs */}
            <div className="flex border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('segmentation')}
                    className={`px-6 py-3 font-semibold text-sm transition-colors border-b-2 -mb-px flex items-center gap-2 ${
                        activeTab === 'segmentation' 
                            ? 'border-indigo-600 text-indigo-600' 
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <Activity className="w-4 h-4" />
                    User Segmentation
                </button>
                <button
                    onClick={() => setActiveTab('live')}
                    className={`px-6 py-3 font-semibold text-sm transition-colors border-b-2 -mb-px flex items-center gap-2 relative ${
                        activeTab === 'live' 
                            ? 'border-indigo-600 text-indigo-600' 
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <Globe className="w-4 h-4" />
                    Live Presence
                    {liveMetrics.total > 0 && (
                        <span className="flex h-2.5 w-2.5 absolute top-2 right-1">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                        </span>
                    )}
                </button>
            </div>

            {/* TAB 1: USER SEGMENTATION */}
            {activeTab === 'segmentation' && (
                <>
                    {/* Segmentation KPI Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        {/* Total Users */}
                        <div 
                            onClick={() => handleSegmentChange('all')}
                            className={`p-4 bg-white border rounded-lg cursor-pointer transition-all ${
                                activeSegment === 'all' 
                                    ? 'border-indigo-600 ring-2 ring-indigo-100 shadow-md scale-[1.02]' 
                                    : 'border-gray-200 hover:border-indigo-300'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded">
                                    <Users className="w-4 h-4" />
                                </span>
                                <span className="text-xl font-bold text-gray-900">
                                    {statsLoading ? '...' : segmentStats.total_users}
                                </span>
                            </div>
                            <h3 className="text-xs font-semibold text-gray-700">Total Profiles</h3>
                            <p className="text-[10px] text-gray-400 mt-1">Entire site directory</p>
                        </div>

                        {/* Active Depositors */}
                        <div 
                            onClick={() => handleSegmentChange('deposited_and_used')}
                            className={`p-4 bg-white border rounded-lg cursor-pointer transition-all ${
                                activeSegment === 'deposited_and_used' 
                                    ? 'border-emerald-600 ring-2 ring-emerald-100 shadow-md scale-[1.02]' 
                                    : 'border-gray-200 hover:border-emerald-300'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded">
                                    <DollarSign className="w-4 h-4" />
                                </span>
                                <span className="text-xl font-bold text-gray-900">
                                    {statsLoading ? '...' : segmentStats.deposited_and_used}
                                </span>
                            </div>
                            <h3 className="text-xs font-semibold text-gray-700">Active Depositors</h3>
                            <p className="text-[10px] text-gray-400 mt-1">Deposited & placed orders</p>
                        </div>

                        {/* Idle Depositors */}
                        <div 
                            onClick={() => handleSegmentChange('deposited_unused')}
                            className={`p-4 bg-white border rounded-lg cursor-pointer transition-all ${
                                activeSegment === 'deposited_unused' 
                                    ? 'border-amber-600 ring-2 ring-amber-100 shadow-md scale-[1.02]' 
                                    : 'border-gray-200 hover:border-amber-300'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="p-1.5 bg-amber-50 text-amber-600 rounded">
                                    <ShoppingCart className="w-4 h-4" />
                                </span>
                                <span className="text-xl font-bold text-gray-900">
                                    {statsLoading ? '...' : segmentStats.deposited_unused}
                                </span>
                            </div>
                            <h3 className="text-xs font-semibold text-gray-700">Idle Depositors</h3>
                            <p className="text-[10px] text-gray-400 mt-1">Balance remaining, 0 orders</p>
                        </div>

                        {/* Dead Signups */}
                        <div 
                            onClick={() => handleSegmentChange('never_deposited_or_ordered')}
                            className={`p-4 bg-white border rounded-lg cursor-pointer transition-all ${
                                activeSegment === 'never_deposited_or_ordered' 
                                    ? 'border-red-600 ring-2 ring-red-100 shadow-md scale-[1.02]' 
                                    : 'border-gray-200 hover:border-red-300'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="p-1.5 bg-red-50 text-red-600 rounded">
                                    <Users className="w-4 h-4" />
                                </span>
                                <span className="text-xl font-bold text-gray-900">
                                    {statsLoading ? '...' : segmentStats.never_deposited_or_ordered}
                                </span>
                            </div>
                            <h3 className="text-xs font-semibold text-gray-700">Dead Signups</h3>
                            <p className="text-[10px] text-gray-400 mt-1">Never deposited or ordered</p>
                        </div>

                        {/* Browsers */}
                        <div 
                            onClick={() => handleSegmentChange('browsers')}
                            className={`p-4 bg-white border rounded-lg cursor-pointer transition-all ${
                                activeSegment === 'browsers' 
                                    ? 'border-cyan-600 ring-2 ring-cyan-100 shadow-md scale-[1.02]' 
                                    : 'border-gray-200 hover:border-cyan-300'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="p-1.5 bg-cyan-50 text-cyan-600 rounded">
                                    <Activity className="w-4 h-4" />
                                </span>
                                <span className="text-xl font-bold text-gray-900">
                                    {statsLoading ? '...' : segmentStats.browsers}
                                </span>
                            </div>
                            <h3 className="text-xs font-semibold text-gray-700">Active Browsers</h3>
                            <p className="text-[10px] text-gray-400 mt-1">Logged in last 30d, 0 deposits</p>
                        </div>

                        {/* Frequent Buyers */}
                        <div 
                            onClick={() => handleSegmentChange('frequent_buyers')}
                            className={`p-4 bg-white border rounded-lg cursor-pointer transition-all ${
                                activeSegment === 'frequent_buyers' 
                                    ? 'border-purple-600 ring-2 ring-purple-100 shadow-md scale-[1.02]' 
                                    : 'border-gray-200 hover:border-purple-300'
                            }`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="p-1.5 bg-purple-50 text-purple-600 rounded">
                                    <ShoppingCart className="w-4 h-4" />
                                </span>
                                <span className="text-xl font-bold text-gray-900">
                                    {statsLoading ? '...' : segmentStats.frequent_buyers}
                                </span>
                            </div>
                            <h3 className="text-xs font-semibold text-gray-700">Frequent Buyers</h3>
                            <p className="text-[10px] text-gray-400 mt-1">Customer loyalty (10+ orders)</p>
                        </div>
                    </div>

                    {/* Chart Visualizations */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Donut Chart: Segment Distribution */}
                        <Card className="shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-base font-bold flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-indigo-500" />
                                    Segment Cohorts Ratio
                                </CardTitle>
                                <CardDescription>Percentage breakdown of all profiles based on lifecycle stage (hover to inspect)</CardDescription>
                            </CardHeader>
                            <CardContent className="h-72 relative flex items-center justify-center">
                                {statsLoading ? (
                                    <div className="flex items-center gap-2 text-sm text-gray-500">
                                        <RefreshCw className="w-4 h-4 animate-spin" /> Loading chart data...
                                    </div>
                                ) : (
                                    <div className="w-full h-full relative">
                                        {/* Center Content Overlay */}
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
                                            {activePieIndex === -1 ? (
                                                <>
                                                    <span className="text-3xl font-extrabold text-gray-950">
                                                        {segmentStats.total_users?.toLocaleString()}
                                                    </span>
                                                    <span className="text-xs font-bold text-gray-400 mt-0.5 uppercase tracking-wider">Total Users</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="text-3xl font-extrabold" style={{ color: COLORS[activePieIndex % COLORS.length] }}>
                                                        {chartData.filter(d => d.value > 0)[activePieIndex]?.value.toLocaleString()}
                                                    </span>
                                                    <span className="text-xs font-bold text-gray-500 mt-0.5 max-w-[130px] text-center truncate">
                                                        {chartData.filter(d => d.value > 0)[activePieIndex]?.name}
                                                    </span>
                                                </>
                                            )}
                                        </div>

                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <defs>
                                                    <linearGradient id="emeraldGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor="#34d399" />
                                                        <stop offset="100%" stopColor="#059669" />
                                                    </linearGradient>
                                                    <linearGradient id="amberGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor="#fbbf24" />
                                                        <stop offset="100%" stopColor="#d97706" />
                                                    </linearGradient>
                                                    <linearGradient id="roseGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor="#fb7185" />
                                                        <stop offset="100%" stopColor="#e11d48" />
                                                    </linearGradient>
                                                    <linearGradient id="cyanGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor="#22d3ee" />
                                                        <stop offset="100%" stopColor="#0891b2" />
                                                    </linearGradient>
                                                    <linearGradient id="purpleGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor="#c084fc" />
                                                        <stop offset="100%" stopColor="#7c3aed" />
                                                    </linearGradient>
                                                </defs>
                                                <Pie
                                                    data={chartData.filter(d => d.value > 0)}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={70}
                                                    outerRadius={95}
                                                    paddingAngle={3}
                                                    dataKey="value"
                                                    onMouseEnter={onPieEnter}
                                                    onMouseLeave={onPieLeave}
                                                    cursor="pointer"
                                                >
                                                    {chartData.filter(d => d.value > 0).map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={GRADIENTS[index % GRADIENTS.length]} stroke="#fff" strokeWidth={2} />
                                                    ))}
                                                </Pie>
                                                <Tooltip content={<CustomTooltip />} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Bar Chart: User Count Comparisons */}
                        <Card className="shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-base font-bold flex items-center gap-2">
                                    <Users className="w-4 h-4 text-indigo-500" />
                                    Cohort Comparisons
                                </CardTitle>
                                <CardDescription>Comparison scale displaying active volumes across user categories</CardDescription>
                            </CardHeader>
                            <CardContent className="h-72">
                                {statsLoading ? (
                                    <div className="flex items-center justify-center h-full gap-2 text-sm text-gray-500">
                                        <RefreshCw className="w-4 h-4 animate-spin" /> Loading chart data...
                                    </div>
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                                            <defs>
                                                {/* Re-use pie gradients */}
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                                            <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                                            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f9fafb' }} />
                                            <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]}>
                                                {chartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={GRADIENTS[index % GRADIENTS.length]} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* signup trend area chart */}
                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base font-bold flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-indigo-500" />
                                User Signup Growth Trend
                            </CardTitle>
                            <CardDescription>Daily registration count for the last 14 days</CardDescription>
                        </CardHeader>
                        <CardContent className="h-64">
                            {statsLoading ? (
                                <div className="flex items-center justify-center h-full gap-2 text-sm text-gray-500">
                                    <RefreshCw className="w-4 h-4 animate-spin" /> Loading trend data...
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={signupTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="indigoGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Area 
                                            type="monotone" 
                                            dataKey="count" 
                                            name="Signups"
                                            stroke="#6366f1" 
                                            strokeWidth={3}
                                            fillOpacity={1} 
                                            fill="url(#indigoGrad)" 
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </CardContent>
                    </Card>

                    {/* Segment Cohort Users Directory Table */}
                    <Card className="shadow-sm">
                        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <CardTitle className="text-base font-bold text-gray-900">
                                    {SEGMENTS[activeSegment].label} List
                                </CardTitle>
                                <CardDescription>{SEGMENTS[activeSegment].desc}</CardDescription>
                            </div>
                            <div className="flex items-center gap-3 w-full sm:w-auto">
                                <div className="relative flex-1 sm:w-64">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                    <Input
                                        placeholder="Search segment..."
                                        value={searchTerm}
                                        onChange={(e) => {
                                            setSearchTerm(e.target.value);
                                            setPage(1);
                                        }}
                                        className="pl-9 h-10 w-full"
                                    />
                                </div>
                                <Button 
                                    onClick={handleExportCSV} 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-10 shrink-0"
                                    disabled={usersList.length === 0}
                                >
                                    <Download className="w-4 h-4 mr-2" />
                                    Export CSV
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0 overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[800px]">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase">
                                        <th 
                                            onClick={() => handleSort('name')}
                                            className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors"
                                        >
                                            Name <ArrowUpDown className="w-3.5 h-3.5 inline ml-1" />
                                        </th>
                                        <th 
                                            onClick={() => handleSort('email')}
                                            className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors"
                                        >
                                            Email <ArrowUpDown className="w-3.5 h-3.5 inline ml-1" />
                                        </th>
                                        <th className="px-6 py-4">Phone</th>
                                        <th 
                                            onClick={() => handleSort('balance')}
                                            className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors"
                                        >
                                            Balance <ArrowUpDown className="w-3.5 h-3.5 inline ml-1" />
                                        </th>
                                        <th 
                                            onClick={() => handleSort('total_spend')}
                                            className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors"
                                        >
                                            Spend <ArrowUpDown className="w-3.5 h-3.5 inline ml-1" />
                                        </th>
                                        <th className="px-6 py-4 text-center">Deposits</th>
                                        <th className="px-6 py-4 text-center">Orders</th>
                                        <th 
                                            onClick={() => handleSort('last_active')}
                                            className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors"
                                        >
                                            Last Active <ArrowUpDown className="w-3.5 h-3.5 inline ml-1" />
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm divide-y divide-gray-100">
                                    {listLoading ? (
                                        <tr>
                                            <td colSpan={8} className="text-center py-8 text-gray-500">
                                                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-600" />
                                                Loading segment users...
                                            </td>
                                        </tr>
                                    ) : usersList.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="text-center py-8 text-gray-500">
                                                No users found matching this cohort criteria.
                                            </td>
                                        </tr>
                                    ) : (
                                        usersList.map((user) => (
                                            <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-6 py-4 font-semibold text-gray-900">{user.name}</td>
                                                <td className="px-6 py-4 text-gray-600 break-all">{user.email}</td>
                                                <td className="px-6 py-4 text-gray-500">{user.phone_number || 'N/A'}</td>
                                                <td className="px-6 py-4 font-medium text-gray-900">₵{user.balance?.toFixed(2) || '0.00'}</td>
                                                <td className="px-6 py-4 font-medium text-indigo-600">₵{user.total_spend?.toFixed(2) || '0.00'}</td>
                                                <td className="px-6 py-4 text-center font-bold text-emerald-600">{user.approved_deposits_count}</td>
                                                <td className="px-6 py-4 text-center font-bold text-gray-700">{user.total_orders_count}</td>
                                                <td className="px-6 py-4 text-gray-500 text-xs">
                                                    {user.last_active ? new Date(user.last_active).toLocaleString() : 'Never'}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </CardContent>
                        {/* Pagination footer */}
                        <div className="p-4 border-t border-gray-100 flex items-center justify-between">
                            <span className="text-xs text-gray-500">
                                Showing {usersList.length > 0 ? (page - 1) * limit + 1 : 0} to {Math.min(page * limit, totalUsers)} of {totalUsers}
                            </span>
                            <div className="flex gap-2">
                                <Button 
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    variant="outline" 
                                    size="sm"
                                >
                                    Previous
                                </Button>
                                <Button 
                                    onClick={() => setPage(p => p + 1)}
                                    disabled={page * limit >= totalUsers}
                                    variant="outline" 
                                    size="sm"
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    </Card>
                </>
            )}

            {/* TAB 2: LIVE PRESENCE */}
            {activeTab === 'live' && (
                <>
                    {/* Live Statistics Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <Card className="shadow-sm border-l-4 border-l-indigo-600">
                            <CardContent className="p-6 flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Online</p>
                                    <h3 className="text-3xl font-bold text-gray-900 mt-1">{liveMetrics.total}</h3>
                                </div>
                                <span className="p-3 bg-indigo-50 text-indigo-600 rounded-full">
                                    <Globe className="w-6 h-6" />
                                </span>
                            </CardContent>
                        </Card>
                        
                        <Card className="shadow-sm border-l-4 border-l-emerald-600">
                            <CardContent className="p-6 flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Members Active</p>
                                    <h3 className="text-3xl font-bold text-gray-900 mt-1">{liveMetrics.members}</h3>
                                </div>
                                <span className="p-3 bg-emerald-50 text-emerald-600 rounded-full">
                                    <Users className="w-6 h-6" />
                                </span>
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-l-4 border-l-cyan-600">
                            <CardContent className="p-6 flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Guest Visitors</p>
                                    <h3 className="text-3xl font-bold text-gray-900 mt-1">{liveMetrics.guests}</h3>
                                </div>
                                <span className="p-3 bg-cyan-50 text-cyan-600 rounded-full">
                                    <Compass className="w-6 h-6" />
                                </span>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Live Online Users Table */}
                    <Card className="shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-base font-bold flex items-center gap-2">
                                <Globe className="w-5 h-5 text-green-500" />
                                Real-Time Visitors
                            </CardTitle>
                            <CardDescription>Currently online users tracked dynamically using Realtime Presence channels</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0 overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[800px]">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase">
                                        <th className="px-6 py-4">Visitor</th>
                                        <th className="px-6 py-4">Location</th>
                                        <th className="px-6 py-4">Current Page</th>
                                        <th className="px-6 py-4">Device / Browser</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4">Last Activity</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm divide-y divide-gray-100">
                                    {onlineUsers.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="text-center py-12 text-gray-500">
                                                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-600" />
                                                Waiting for presence ping...
                                            </td>
                                        </tr>
                                    ) : (
                                        onlineUsers.map((visitor) => (
                                            <tr key={visitor.user_id} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-gray-900 flex items-center gap-2">
                                                            {visitor.name}
                                                            {visitor.role === 'admin' && (
                                                                <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0.5 rounded">Admin</span>
                                                            )}
                                                            {visitor.is_guest && (
                                                                <span className="bg-gray-100 text-gray-600 text-[10px] font-medium px-1.5 py-0.5 rounded">Guest</span>
                                                            )}
                                                        </span>
                                                        <span className="text-xs text-gray-500 mt-0.5 break-all">{visitor.email}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2 text-gray-700 font-medium">
                                                        <span className="text-lg" title={visitor.country_code}>
                                                            {getFlagEmoji(visitor.country_code)}
                                                        </span>
                                                        <span>{visitor.city}, {visitor.country}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <a 
                                                        href={visitor.current_page} 
                                                        target="_blank" 
                                                        rel="noreferrer"
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 border border-indigo-100 rounded text-indigo-700 text-xs font-semibold hover:bg-indigo-100 transition-colors"
                                                    >
                                                        {visitor.current_page}
                                                        <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2 text-gray-600 text-xs">
                                                        <Monitor className="w-3.5 h-3.5" />
                                                        <span>{visitor.device} ({visitor.browser})</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="inline-flex items-center gap-1 text-green-700 text-xs font-semibold">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-green-500"></span>
                                                        Active
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-xs text-gray-500">
                                                    {new Date(visitor.last_active).toLocaleTimeString()}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
