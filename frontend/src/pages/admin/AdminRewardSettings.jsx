import React, { useState } from 'react';
import { useRewardTiers, useUpsertRewardTier, useDeleteRewardTier } from '@/hooks/useAdminRewards';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Settings, Plus, Trash2, Edit2, Trophy, Coins, Eye, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';

const AdminRewardSettings = () => {
    const { data: tiers, isLoading: tiersLoading } = useRewardTiers();
    const upsertTierMutation = useUpsertRewardTier();
    const deleteTierMutation = useDeleteRewardTier();

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingTier, setEditingTier] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        required_amount: '',
        reward_likes: '',
        reward_views: '',
        position: 0
    });

    const handleOpenDialog = (tier = null) => {
        if (tier) {
            setEditingTier(tier);
            setFormData({
                name: tier.name,
                required_amount: tier.required_amount,
                reward_likes: tier.reward_likes,
                reward_views: tier.reward_views,
                position: tier.position || 0
            });
        } else {
            setEditingTier(null);
            setFormData({
                name: '',
                required_amount: '',
                reward_likes: '',
                reward_views: '',
                position: (tiers?.length || 0) + 1
            });
        }
        setIsDialogOpen(true);
    };

    const handleSave = () => {
        const payload = {
            name: formData.name,
            required_amount: parseFloat(formData.required_amount),
            reward_likes: parseInt(formData.reward_likes),
            reward_views: parseInt(formData.reward_views),
            position: parseInt(formData.position)
        };

        if (editingTier) {
            payload.id = editingTier.id;
        }

        upsertTierMutation.mutate(payload, {
            onSuccess: () => {
                toast.success(editingTier ? 'Tier updated successfully' : 'New tier added successfully');
                setIsDialogOpen(false);
            },
            onError: (error) => {
                toast.error(error.message);
            }
        });
    };

    const handleDelete = (id) => {
        if (window.confirm('Are you sure you want to delete this tier?')) {
            deleteTierMutation.mutate(id, {
                onSuccess: () => toast.success('Tier deleted successfully'),
                onError: (error) => toast.error(error.message)
            });
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                    Reward Tiers
                </h2>
                <p className="text-muted-foreground mt-1">
                    Manage the daily reward tiers and their requirements
                </p>
            </div>

            {/* Tiers List */}
            <div className="grid grid-cols-1 gap-4">
                {tiersLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-32 w-full rounded-xl" />
                    ))
                ) : tiers && tiers.length > 0 ? (
                    tiers.map((tier) => (
                        <Card key={tier.id} className="group border-2 border-transparent hover:border-primary/10 transition-all">
                            <CardContent className="p-6 flex items-center justify-between">
                                <div className="flex items-center gap-6">
                                    <div className="flex flex-col items-center justify-center w-16 h-16 rounded-full bg-yellow-50 text-yellow-600 border border-yellow-100">
                                        <Trophy className="w-8 h-8 mb-1" />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-xl font-bold text-gray-900">{tier.name}</h3>
                                            <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100 border-none">
                                                Deposit GHS {parseFloat(tier.required_amount).toFixed(2)}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center gap-4 text-sm text-gray-500">
                                            <div className="flex items-center gap-1">
                                                <ThumbsUp className="w-4 h-4 text-blue-500" />
                                                <span className="font-medium text-gray-700">{parseInt(tier.reward_likes).toLocaleString()} Likes</span>
                                            </div>
                                            <div className="w-1 h-1 rounded-full bg-gray-300" />
                                            <div className="flex items-center gap-1">
                                                <Eye className="w-4 h-4 text-purple-500" />
                                                <span className="font-medium text-gray-700">{parseInt(tier.reward_views).toLocaleString()} Views</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(tier)}>
                                        <Edit2 className="w-4 h-4 text-gray-500" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => handleDelete(tier.id)}>
                                        <Trash2 className="w-4 h-4 text-red-500" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                ) : (
                    <div className="text-center py-12 border-2 border-dashed rounded-xl">
                        <Trophy className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                        <h3 className="text-lg font-medium text-gray-900">No Tiers Configured</h3>
                        <p className="text-gray-500">Add your first reward tier to get started</p>
                    </div>
                )}

                <Button
                    onClick={() => handleOpenDialog()}
                    className="w-full h-12 border-2 border-dashed border-gray-200 bg-gray-50 text-gray-500 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    Add New Tier
                </Button>
            </div>

            {/* Edit/Add Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingTier ? 'Edit Reward Tier' : 'Add Reward Tier'}</DialogTitle>
                        <DialogDescription>
                            Configure the deposit requirement and rewards for this tier.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Tier Name</Label>
                            <Input
                                placeholder="e.g. Bronze Tier"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Required Deposit (GHS)</Label>
                            <div className="relative">
                                <Coins className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                <Input
                                    className="pl-9"
                                    type="number"
                                    placeholder="0.00"
                                    value={formData.required_amount}
                                    onChange={(e) => setFormData({ ...formData, required_amount: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Reward Likes</Label>
                                <div className="relative">
                                    <ThumbsUp className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                    <Input
                                        className="pl-9"
                                        type="number"
                                        placeholder="0"
                                        value={formData.reward_likes}
                                        onChange={(e) => setFormData({ ...formData, reward_likes: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Reward Views</Label>
                                <div className="relative">
                                    <Eye className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                    <Input
                                        className="pl-9"
                                        type="number"
                                        placeholder="0"
                                        value={formData.reward_views}
                                        onChange={(e) => setFormData({ ...formData, reward_views: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Position (Sort Order)</Label>
                            <Input
                                type="number"
                                placeholder="0"
                                value={formData.position}
                                onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSave} disabled={upsertTierMutation.isPending}>
                            {upsertTierMutation.isPending ? 'Saving...' : 'Save Tier'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default AdminRewardSettings;
