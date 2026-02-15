import React, { useState } from 'react';
import { useRewardSettings, useRewardSettingLogs, useUpdateRewardLimit } from '@/hooks/useAdminRewards';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Settings, Save, AlertTriangle, History } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const AdminRewardSettings = () => {
    const [newLimit, setNewLimit] = useState('');
    const [newLikesAmount, setNewLikesAmount] = useState('');
    const [newViewsAmount, setNewViewsAmount] = useState('');
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);

    const { data: settings, isLoading: settingsLoading } = useRewardSettings();
    const { data: logs, isLoading: logsLoading } = useRewardSettingLogs(20);
    const updateMutation = useUpdateRewardLimit();

    const currentLimit = settings?.daily_deposit_limit || 15.00;
    const currentLikes = settings?.likes_amount || 1000;
    const currentViews = settings?.views_amount || 1000;

    const handleSaveClick = () => {
        const limit = newLimit ? parseFloat(newLimit) : currentLimit;
        const likes = newLikesAmount ? parseInt(newLikesAmount) : currentLikes;
        const views = newViewsAmount ? parseInt(newViewsAmount) : currentViews;

        if (isNaN(limit) || limit < 1 || limit > 10000) {
            toast.error('Please enter a valid deposit limit between GHS 1 and GHS 10,000');
            return;
        }

        if (isNaN(likes) || likes < 1 || likes > 50000) {
            toast.error('Please enter a valid likes amount between 1 and 50,000');
            return;
        }

        if (isNaN(views) || views < 1 || views > 50000) {
            toast.error('Please enter a valid views amount between 1 and 50,000');
            return;
        }

        if (limit === currentLimit && likes === currentLikes && views === currentViews) {
            toast.info('No changes detected');
            return;
        }

        setShowConfirmDialog(true);
    };

    const handleConfirm = () => {
        const settingsPayload = {};
        if (newLimit) settingsPayload.daily_deposit_limit = parseFloat(newLimit);
        if (newLikesAmount) settingsPayload.likes_amount = parseInt(newLikesAmount);
        if (newViewsAmount) settingsPayload.views_amount = parseInt(newViewsAmount);

        updateMutation.mutate(settingsPayload, {
            onSuccess: (data) => {
                toast.success(data.message || 'Settings updated successfully');
                setNewLimit('');
                setNewLikesAmount('');
                setNewViewsAmount('');
                setShowConfirmDialog(false);
            },
            onError: (error) => {
                toast.error(error.message || 'Failed to update settings');
            }
        });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                    Reward Settings
                </h2>
                <p className="text-muted-foreground mt-1">
                    Configure the daily deposit requirement and reward amounts
                </p>
            </div>

            {/* Config Card */}
            <Card className="border-2 border-primary/10">
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                            <Settings className="w-5 h-5" />
                        </div>
                        <div>
                            <CardTitle>Reward Configuration</CardTitle>
                            <CardDescription>
                                Set the minimum deposit requirement and the values for available rewards
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-8">
                    {settingsLoading ? (
                        <Skeleton className="h-64 w-full" />
                    ) : (
                        <>
                            {/* Summary row */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <div className="text-xs text-blue-600 font-semibold mb-1 uppercase tracking-wider">Required Deposit</div>
                                    <div className="text-2xl font-bold text-blue-700">GHS {currentLimit.toFixed(2)}</div>
                                </div>
                                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                                    <div className="text-xs text-purple-600 font-semibold mb-1 uppercase tracking-wider">Likes Reward</div>
                                    <div className="text-2xl font-bold text-purple-700">{currentLikes.toLocaleString()}</div>
                                </div>
                                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                                    <div className="text-xs text-indigo-600 font-semibold mb-1 uppercase tracking-wider">Views Reward</div>
                                    <div className="text-2xl font-bold text-indigo-700">{currentViews.toLocaleString()}</div>
                                </div>
                            </div>

                            {/* Update Form */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-2">
                                    <Label htmlFor="new-limit">New Deposit Limit (GHS)</Label>
                                    <Input
                                        id="new-limit"
                                        type="number"
                                        step="0.01"
                                        placeholder={currentLimit.toFixed(2)}
                                        value={newLimit}
                                        onChange={(e) => setNewLimit(e.target.value)}
                                        className="font-mono"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="likes-amount">New Likes Amount</Label>
                                    <Input
                                        id="likes-amount"
                                        type="number"
                                        placeholder={currentLikes.toString()}
                                        value={newLikesAmount}
                                        onChange={(e) => setNewLikesAmount(e.target.value)}
                                        className="font-mono"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="views-amount">New Views Amount</Label>
                                    <Input
                                        id="views-amount"
                                        type="number"
                                        placeholder={currentViews.toString()}
                                        value={newViewsAmount}
                                        onChange={(e) => setNewViewsAmount(e.target.value)}
                                        className="font-mono"
                                    />
                                </div>
                            </div>

                            {settings?.updated_at && (
                                <p className="text-xs text-muted-foreground text-right italic">
                                    Last updated: {format(new Date(settings.updated_at), 'MMM dd, yyyy HH:mm')}
                                </p>
                            )}
                        </>
                    )}
                </CardContent>
                <CardFooter className="bg-gray-50/50 justify-end rounded-b-xl border-t p-4">
                    <Button
                        onClick={handleSaveClick}
                        disabled={(!newLimit && !newLikesAmount && !newViewsAmount) || updateMutation.isPending || settingsLoading}
                        className="bg-primary hover:bg-primary/90 transition-all shadow-sm px-8"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
                    </Button>
                </CardFooter>
            </Card>

            {/* Audit Log */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
                            <History className="w-5 h-5" />
                        </div>
                        <div>
                            <CardTitle>Change History</CardTitle>
                            <CardDescription>
                                Recent changes to the deposit limit setting
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {logsLoading ? (
                        <div className="space-y-3">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <Skeleton key={i} className="h-16 w-full" />
                            ))}
                        </div>
                    ) : logs && logs.length > 0 ? (
                        <div className="space-y-3">
                            {logs.map((log) => (
                                <div
                                    key={log.id}
                                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-medium">{log.profiles?.name || 'Unknown Admin'}</span>
                                            <Badge variant="outline" className="text-xs">
                                                {log.profiles?.email || 'N/A'}
                                            </Badge>
                                        </div>
                                        <div className="text-sm text-muted-foreground">
                                            Changed from GHS {parseFloat(log.old_value).toFixed(2)} → GHS {parseFloat(log.new_value).toFixed(2)}
                                        </div>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                        {format(new Date(log.created_at), 'MMM dd, yyyy HH:mm')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-muted-foreground">
                            <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>No change history available</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Confirmation Dialog */}
            <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-yellow-600" />
                            Confirm Changes
                        </DialogTitle>
                        <DialogDescription>
                            These changes will affect all users immediately. Please confirm the new settings.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-2">
                            {newLimit && (
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">New Deposit Limit:</span>
                                    <span className="text-lg font-bold text-blue-600">GHS {parseFloat(newLimit).toFixed(2)}</span>
                                </div>
                            )}
                            {newLikesAmount && (
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">New Likes Amount:</span>
                                    <span className="text-lg font-bold text-purple-600">{parseInt(newLikesAmount).toLocaleString()}</span>
                                </div>
                            )}
                            {newViewsAmount && (
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">New Views Amount:</span>
                                    <span className="text-lg font-bold text-indigo-600">{parseInt(newViewsAmount).toLocaleString()}</span>
                                </div>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowConfirmDialog(false)}
                            disabled={updateMutation.isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleConfirm}
                            disabled={updateMutation.isPending}
                            className="bg-primary hover:bg-primary/90"
                        >
                            {updateMutation.isPending ? 'Updating...' : 'Confirm Changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default AdminRewardSettings;
