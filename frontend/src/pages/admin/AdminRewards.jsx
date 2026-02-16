import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAdminRewardClaims, useRewardStats, useProcessRewardOrder } from '@/hooks/useAdminRewards';
import { useAdminServices } from '@/hooks/useAdminServices'; // Assuming this exists or using direct fetch
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Gift, Users, TrendingUp, DollarSign, ExternalLink, Calendar, Search, CheckCircle, XCircle, Loader2, Play } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

const AdminRewards = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFilter, setDateFilter] = useState('');
    const [selectedClaims, setSelectedClaims] = useState([]);
    const [selectedServiceId, setSelectedServiceId] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const filters = {};
    if (dateFilter) {
        filters.startDate = dateFilter;
        filters.endDate = dateFilter;
    }

    const { data: claims, isLoading: claimsLoading } = useAdminRewardClaims(filters);
    const { data: stats, isLoading: statsLoading } = useRewardStats();
    const { data: services } = useAdminServices ? useAdminServices() : { data: [] }; // Fallback if hook missing

    const processOrderMutation = useProcessRewardOrder();

    // Filter claims by search query AND status
    const filteredClaims = claims?.filter(claim => {
        const matchesSearch = !searchQuery || (
            claim.profiles?.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            claim.profiles?.name?.toLowerCase().includes(searchQuery.toLowerCase())
        );
        return matchesSearch;
    });

    // Handle Bulk Selection
    const handleSelectAll = (checked) => {
        if (checked) {
            const pendingClaims = filteredClaims?.filter(c => c.status === 'pending') || [];
            setSelectedClaims(pendingClaims.map(c => c.id));
        } else {
            setSelectedClaims([]);
        }
    };

    const handleSelectClaim = (id, checked) => {
        if (checked) {
            setSelectedClaims(prev => [...prev, id]);
        } else {
            setSelectedClaims(prev => prev.filter(c => c !== id));
        }
    };

    // Process Logic
    const handleProcess = async () => {
        if (!selectedServiceId) {
            toast.error('Please select a service first');
            return;
        }
        if (selectedClaims.length === 0) {
            toast.error('No claims selected');
            return;
        }

        setIsProcessing(true);
        let successCount = 0;
        let failCount = 0;

        for (const claimId of selectedClaims) {
            const claim = claims.find(c => c.id === claimId);
            if (!claim) continue;

            try {
                // 1. Create Order in DB (via RPC)
                const processingResult = await processOrderMutation.mutateAsync({
                    claimId: claimId,
                    serviceId: selectedServiceId,
                    quantity: claim.reward_amount || 1000 // Default quantity
                });

                const newOrderId = processingResult?.order_id;

                // 2. Automate Panel Placement
                if (newOrderId) {
                    try {
                        const { data: { session } } = await supabase.auth.getSession();
                        const response = await fetch('/api/admin/retry-order', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${session?.access_token}`
                            },
                            body: JSON.stringify({ order_id: newOrderId })
                        });

                        const result = await response.json();
                        if (response.ok && result.success) {
                            console.log(`Successfully placed panel order for ${newOrderId}:`, result.provider_order_id);
                        } else {
                            console.warn(`Panel fulfillment failed for ${newOrderId}:`, result.message || result.error);
                            // We don't fail the whole process if API placement fails, 
                            // as the order already exists in DB as "Processed Reward"
                        }
                    } catch (panelError) {
                        console.error(`Fulfillment API error for ${newOrderId}:`, panelError);
                    }
                }

                successCount++;
            } catch (error) {
                console.error(`Failed to process claim ${claimId}:`, error);
                failCount++;
            }
        }

        setIsProcessing(false);
        setSelectedClaims([]);

        if (successCount > 0) toast.success(`Successfully processed ${successCount} claims`);
        if (failCount > 0) toast.error(`Failed to process ${failCount} claims`);
    };

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
                    View and process user reward claims
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

            {/* Processing Toolbar */}
            <Card className="border-2 border-primary/20 bg-primary/5">
                <CardContent className="p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <div className="w-full md:w-[300px]">
                            <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                                <SelectTrigger className="bg-white">
                                    <SelectValue placeholder="Select Service to Process" />
                                </SelectTrigger>
                                <SelectContent>
                                    {services?.map(service => (
                                        <SelectItem key={service.id} value={service.id}>
                                            {service.name} (ID: {service.id})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <span className="text-sm text-gray-500 whitespace-nowrap">
                            {selectedClaims.length} selected
                        </span>
                    </div>
                    <Button
                        onClick={handleProcess}
                        disabled={selectedClaims.length === 0 || !selectedServiceId || isProcessing}
                        className="w-full md:w-auto"
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            <>
                                <Play className="w-4 h-4 mr-2 fill-current" />
                                Process Selected
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>

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
                                        <th className="w-10 p-4">
                                            <Checkbox
                                                checked={selectedClaims.length > 0 && selectedClaims.length === filteredClaims.filter(c => c.status === 'pending').length}
                                                onCheckedChange={handleSelectAll}
                                            />
                                        </th>
                                        <th className="text-left py-3 px-4 font-semibold text-sm">Status</th>
                                        <th className="text-left py-3 px-4 font-semibold text-sm">User</th>
                                        <th className="text-left py-3 px-4 font-semibold text-sm">Reward</th>
                                        <th className="text-left py-3 px-4 font-semibold text-sm">Deposit</th>
                                        <th className="text-left py-3 px-4 font-semibold text-sm">Link</th>
                                        <th className="text-left py-3 px-4 font-semibold text-sm">Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredClaims.map((claim) => (
                                        <tr key={claim.id} className="border-b hover:bg-gray-50 transition-colors">
                                            <td className="p-4">
                                                <Checkbox
                                                    checked={selectedClaims.includes(claim.id)}
                                                    onCheckedChange={(checked) => handleSelectClaim(claim.id, checked)}
                                                    disabled={claim.status === 'processed'}
                                                />
                                            </td>
                                            <td className="py-3 px-4">
                                                {claim.status === 'processed' ? (
                                                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none">
                                                        Processed
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-yellow-600 border-yellow-200 bg-yellow-50">
                                                        Pending
                                                    </Badge>
                                                )}
                                            </td>
                                            <td className="py-3 px-4">
                                                <div>
                                                    <div className="font-medium">{claim.profiles?.name || 'Unknown'}</div>
                                                    <div className="text-sm text-muted-foreground">{claim.profiles?.email || 'N/A'}</div>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="flex flex-col gap-1">
                                                    <Badge variant="outline" className={`w-fit capitalize ${claim.reward_type === 'likes' ? 'border-primary text-primary bg-primary/5' : 'border-purple-500 text-purple-600 bg-purple-50'}`}>
                                                        {claim.reward_type || 'Likes'}
                                                    </Badge>
                                                    <span className="font-bold">{(claim.reward_amount || 1000).toLocaleString()}</span>
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
                                                <div className="text-sm">
                                                    <div className="font-medium">{format(new Date(claim.claim_date), 'MMM dd, yyyy')}</div>
                                                    <div className="text-muted-foreground">{format(new Date(claim.created_at), 'HH:mm')}</div>
                                                </div>
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
