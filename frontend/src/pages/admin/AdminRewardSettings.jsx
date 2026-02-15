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
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);

    const { data: settings, isLoading: settingsLoading } = useRewardSettings();
    const { data: logs, isLoading: logsLoading } = useRewardSettingLogs(20);
    const updateLimitMutation = useUpdateRewardLimit();

    const currentLimit = settings?.daily_deposit_limit || 15.00;

    const handleSaveClick = () => {
        const limit = parseFloat(newLimit);

        if (isNaN(limit) || limit < 1 || limit > 10000) {
            toast.error('Please enter a valid amount between GHS 1 and GHS 10,000');
            return;
        }

        if (limit === currentLimit) {
            toast.info('No change needed - value is already set to this amount');
            return;
        }

        setShowConfirmDialog(true);
    };

    const handleConfirm = () => {
        const limit = parseFloat(newLimit);
        updateLimitMutation.mutate(limit, {
            onSuccess: (data) => {
                toast.success(data.message || 'Deposit limit updated successfully');
                setNewLimit('');
                setShowConfirmDialog(false);
            },
            onError: (error) => {
                toast.error(error.message || 'Failed to update deposit limit');
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
                    Configure the daily deposit requirement for reward claims
                </p>
            </div>

            {/* Deposit Limit Card */}
            <Card className="border-2 border-primary/10">
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                            <Settings className="w-5 h-5" />
                        </div>
                        <div>
                            <CardTitle>Daily Deposit Requirement</CardTitle>
                            <CardDescription>
                                Minimum deposit amount users must make to claim the daily reward
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {settingsLoading ? (
                        <Skeleton className="h-24 w-full" />
                    ) : (
                        <>
                            {/* Current Limit Display */}
                            <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6">
                                <div className="text-sm text-muted-foreground mb-2">Current Limit</div>
                                <div className="text-4xl font-bold text-blue-600">
                                    GHS {currentLimit.toFixed(2)}
                                </div>
                                {settings?.updated_at && (
                                    <div className="text-xs text-muted-foreground mt-2">
                                        Last updated: {format(new Date(settings.updated_at), 'MMM dd, yyyy HH:mm')}
                                    </div>
                                )}
                            </div>

                            {/* Update Form */}
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="new-limit">New Deposit Limit (GHS)</Label>
                                    <Input
                                        id="new-limit"
                                        type="number"
                                        step="0.01"
                                        min="1"
                                        max="10000"
                                        placeholder={currentLimit.toFixed(2)}
                                        value={newLimit}
                                        onChange={(e) => setNewLimit(e.target.value)}
                                        className="text-lg font-mono"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Enter a value between GHS 1.00 and GHS 10,000.00
                                    </p>
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
                <CardFooter className="bg-gray-50/50 justify-end rounded-b-xl border-t p-4">
                    <Button
                        onClick={handleSaveClick}
                        disabled={!newLimit || updateLimitMutation.isPending || settingsLoading}
                        className="bg-primary hover:bg-primary/90 transition-all shadow-sm"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        {updateLimitMutation.isPending ? 'Updating...' : 'Update Limit'}
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
                            Confirm Deposit Limit Change
                        </DialogTitle>
                        <DialogDescription>
                            This change will affect all users immediately. Please confirm the new limit.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">Current Limit:</span>
                                <span className="text-lg font-bold">GHS {currentLimit.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-center text-2xl text-muted-foreground">
                                ↓
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">New Limit:</span>
                                <span className="text-lg font-bold text-blue-600">GHS {parseFloat(newLimit).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowConfirmDialog(false)}
                            disabled={updateLimitMutation.isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleConfirm}
                            disabled={updateLimitMutation.isPending}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            {updateLimitMutation.isPending ? 'Updating...' : 'Confirm Change'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default AdminRewardSettings;
