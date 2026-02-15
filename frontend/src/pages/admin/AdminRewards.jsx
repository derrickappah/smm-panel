import React, { useState } from 'react';
import { useAdminRewardClaims, useRewardStats } from '@/hooks/useAdminRewards';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Gift, Users, TrendingUp, DollarSign, ExternalLink, Calendar, Search } from 'lucide-react';
import { format } from 'date-fns';

const AdminRewards = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFilter, setDateFilter] = useState('');

    const filters = {};
    if (dateFilter) {
        filters.startDate = dateFilter;
        filters.endDate = dateFilter;
    }

    const { data: claims, isLoading: claimsLoading } = useAdminRewardClaims(filters);
    const { data: stats, isLoading: statsLoading } = useRewardStats();

    // Filter claims by search query (email or name)
    const filteredClaims = claims?.filter(claim => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            claim.profiles?.email?.toLowerCase().includes(query) ||
            claim.profiles?.name?.toLowerCase().includes(query)
        );
    });

    const statCards = [
        {
            title: 'Claims Today',
            value: stats?.claimsToday || 0,
            icon: Gift,
            color: 'bg-blue-100 text-blue-600',
            bgColor: 'bg-blue-50'
        },
        {
            title: 'Claims This Week',
            value: stats?.claimsThisWeek || 0,
            icon: TrendingUp,
            color: 'bg-green-100 text-green-600',
            bgColor: 'bg-green-50'
        },
        {
            title: 'Unique Users',
            value: stats?.uniqueUsers || 0,
            icon: Users,
            color: 'bg-purple-100 text-purple-600',
            bgColor: 'bg-purple-50'
        },
        {
            title: 'Avg Deposit',
            value: `GHS ${stats?.averageDeposit?.toFixed(2) || '0.00'}`,
            icon: DollarSign,
            color: 'bg-yellow-100 text-yellow-600',
            bgColor: 'bg-yellow-50'
        }
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                    Reward Claims
                </h2>
                <p className="text-muted-foreground mt-1">
                    View and manage daily reward claims from users
                </p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {statsLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-32 w-full rounded-xl" />
                    ))
                ) : (
                    statCards.map((stat, index) => (
                        <Card key={index} className="border-2 hover:shadow-lg transition-shadow">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">
                                    {stat.title}
                                </CardTitle>
                                <div className={`p-2 rounded-lg ${stat.color}`}>
                                    <stat.icon className="w-4 h-4" />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{stat.value}</div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Filters</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by email or name..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="date"
                                value={dateFilter}
                                onChange={(e) => setDateFilter(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Claims Table */}
            <Card>
                <CardHeader>
                    <CardTitle>All Claims</CardTitle>
                    <CardDescription>
                        {filteredClaims?.length || 0} claim(s) found
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {claimsLoading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <Skeleton key={i} className="h-16 w-full" />
                            ))}
                        </div>
                    ) : filteredClaims && filteredClaims.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left py-3 px-4 font-semibold text-sm">User</th>
                                        <th className="text-left py-3 px-4 font-semibold text-sm">Deposit Total</th>
                                        <th className="text-left py-3 px-4 font-semibold text-sm">Link</th>
                                        <th className="text-left py-3 px-4 font-semibold text-sm">Claim Date</th>
                                        <th className="text-left py-3 px-4 font-semibold text-sm">Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredClaims.map((claim) => (
                                        <tr key={claim.id} className="border-b hover:bg-gray-50 transition-colors">
                                            <td className="py-3 px-4">
                                                <div>
                                                    <div className="font-medium">{claim.profiles?.name || 'Unknown'}</div>
                                                    <div className="text-sm text-muted-foreground">{claim.profiles?.email || 'N/A'}</div>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <Badge variant="secondary" className="bg-green-100 text-green-700">
                                                    GHS {parseFloat(claim.deposit_total).toFixed(2)}
                                                </Badge>
                                            </td>
                                            <td className="py-3 px-4">
                                                <a
                                                    href={claim.link}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
                                                >
                                                    <span className="max-w-[200px] truncate">{claim.link}</span>
                                                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                                </a>
                                            </td>
                                            <td className="py-3 px-4">
                                                {format(new Date(claim.claim_date), 'MMM dd, yyyy')}
                                            </td>
                                            <td className="py-3 px-4 text-sm text-muted-foreground">
                                                {format(new Date(claim.created_at), 'HH:mm:ss')}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-muted-foreground">
                            <Gift className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>No reward claims found</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default AdminRewards;
