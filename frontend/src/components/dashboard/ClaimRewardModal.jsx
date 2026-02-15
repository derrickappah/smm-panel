import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useRewardEligibility } from '@/hooks/useRewardEligibility';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Gift, Loader2, CheckCircle, XCircle, AlertCircle, Heart, Eye, ArrowRight, Sparkles, Trophy, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

const ClaimRewardModal = ({ isOpen, onClose }) => {
    const [link, setLink] = useState('');
    const [rewardType, setRewardType] = useState('likes'); // Default to likes
    const queryClient = useQueryClient();

    const { data: eligibilityData, isLoading: checkingEligibility, error: eligibilityError } = useRewardEligibility();

    const claimMutation = useMutation({
        mutationFn: async ({ personalLink, type }) => {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();

            if (sessionError || !session) {
                throw new Error('Not authenticated');
            }

            const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
            const response = await fetch(`${BACKEND_URL}/api/reward/claim-reward`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    link: personalLink,
                    reward_type: type
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to claim reward');
            }

            return data;
        },
        onSuccess: (data) => {
            toast.success(data.message || 'Reward claimed successfully! 🎉');
            queryClient.invalidateQueries({ queryKey: ['reward-eligibility'] });
            setLink('');

            // Auto-close after 2 seconds
            setTimeout(() => {
                onClose();
            }, 2000);
        },
        onError: (error) => {
            toast.error(error.message || 'Failed to claim reward');
        }
    });

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!link.trim()) {
            toast.error('Please enter your personal link');
            return;
        }

        claimMutation.mutate({
            personalLink: link.trim(),
            type: rewardType
        });
    };

    const handleClose = () => {
        if (!claimMutation.isPending) {
            setLink('');
            setRewardType('likes');
            onClose();
        }
    };

    // Get claimable amounts from eligibility data
    const likesAmount = eligibilityData?.data?.settings?.likes_amount || 1000;
    const viewsAmount = eligibilityData?.data?.settings?.views_amount || 1000;
    const requiredDeposit = eligibilityData?.data?.required || 15.00;
    const currentDeposit = eligibilityData?.data?.current || 0;
    const progressValue = Math.min((currentDeposit / requiredDeposit) * 100, 100);

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-none bg-white/95 backdrop-blur-xl shadow-2xl rounded-3xl">
                {/* Header with festive background */}
                <div className="relative h-32 bg-gradient-to-br from-primary via-primary/90 to-blue-600 flex items-center px-8 overflow-hidden">
                    {/* Abstract background shapes */}
                    <div className="absolute top-[-20%] right-[-10%] w-48 h-48 bg-white/10 rounded-full blur-3xl animate-pulse" />
                    <div className="absolute bottom-[-30%] left-[-5%] w-40 h-40 bg-blue-400/20 rounded-full blur-2xl" />

                    <div className="relative flex items-center gap-4">
                        <div className="p-3 bg-white/20 backdrop-blur-md rounded-2xl border border-white/30 shadow-inner">
                            <Trophy className="w-8 h-8 text-white animate-bounce" />
                        </div>
                        <div>
                            <DialogTitle className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                                Daily Reward
                                <Sparkles className="w-4 h-4 text-yellow-300 fill-yellow-300" />
                            </DialogTitle>
                            <DialogDescription className="text-blue-50/80 font-medium">
                                Level up your social presence every day
                            </DialogDescription>
                        </div>
                    </div>
                </div>

                <div className="p-8">
                    {/* Loading State */}
                    {checkingEligibility && (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                            <div className="relative">
                                <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                                <Loader2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-primary animate-pulse" />
                            </div>
                            <p className="text-muted-foreground font-medium animate-pulse">Checking your eligibility...</p>
                        </div>
                    )}

                    {/* Error State */}
                    {eligibilityError && !checkingEligibility && (
                        <div className="flex flex-col items-center justify-center py-12 space-y-6 text-center">
                            <div className="p-4 bg-red-50 rounded-full">
                                <XCircle className="w-12 h-12 text-destructive" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-lg font-bold">Something went wrong</h3>
                                <p className="text-muted-foreground px-4">
                                    {eligibilityError.message || 'Failed to check eligibility. Please try again later.'}
                                </p>
                            </div>
                            <Button
                                onClick={() => queryClient.invalidateQueries({ queryKey: ['reward-eligibility'] })}
                                variant="outline"
                                className="rounded-xl px-8"
                            >
                                Try Again
                            </Button>
                        </div>
                    )}

                    {/* Eligible State */}
                    {!checkingEligibility && !eligibilityError && eligibilityData?.status === 'eligible' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* Congrats Badge */}
                            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-100 rounded-2xl">
                                <div className="p-2 bg-green-500 rounded-lg">
                                    <CheckCircle className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-green-800">Congratulations!</p>
                                    <p className="text-xs text-green-600 font-medium">You've unlocked today's rewards with your deposits.</p>
                                </div>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-8">
                                {/* Reward Type Selection */}
                                <div className="space-y-4">
                                    <Label className="text-sm font-bold text-gray-700 uppercase tracking-widest px-1">Select Your Boost</Label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <button
                                            type="button"
                                            onClick={() => setRewardType('likes')}
                                            className={cn(
                                                "group relative flex flex-col items-center justify-center p-6 rounded-3xl border-2 transition-all duration-300",
                                                rewardType === 'likes'
                                                    ? "border-rose-500 bg-rose-50/50 shadow-lg shadow-rose-100 ring-1 ring-rose-500/20"
                                                    : "border-gray-100 bg-gray-50/50 hover:border-rose-200 hover:bg-rose-50/20"
                                            )}
                                        >
                                            <div className={cn(
                                                "p-3 rounded-2xl mb-3 transition-colors",
                                                rewardType === 'likes' ? "bg-rose-500 text-white" : "bg-white text-rose-400 border border-rose-100"
                                            )}>
                                                <Heart className={cn("w-6 h-6", rewardType === 'likes' && "fill-current")} />
                                            </div>
                                            <span className={cn("text-2xl font-black", rewardType === 'likes' ? "text-rose-600" : "text-gray-900")}>
                                                {likesAmount.toLocaleString()}
                                            </span>
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Daily Likes</span>
                                            {rewardType === 'likes' && <div className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full animate-ping" />}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setRewardType('views')}
                                            className={cn(
                                                "group relative flex flex-col items-center justify-center p-6 rounded-3xl border-2 transition-all duration-300",
                                                rewardType === 'views'
                                                    ? "border-indigo-500 bg-indigo-50/50 shadow-lg shadow-indigo-100 ring-1 ring-indigo-500/20"
                                                    : "border-gray-100 bg-gray-50/50 hover:border-indigo-200 hover:bg-indigo-50/20"
                                            )}
                                        >
                                            <div className={cn(
                                                "p-3 rounded-2xl mb-3 transition-colors",
                                                rewardType === 'views' ? "bg-indigo-500 text-white" : "bg-white text-indigo-400 border border-indigo-100"
                                            )}>
                                                <Eye className="w-6 h-6" />
                                            </div>
                                            <span className={cn("text-2xl font-black", rewardType === 'views' ? "text-indigo-600" : "text-gray-900")}>
                                                {viewsAmount.toLocaleString()}
                                            </span>
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Daily Views</span>
                                            {rewardType === 'views' && <div className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 rounded-full animate-ping" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <Label htmlFor="personal-link" className="text-sm font-bold text-gray-700 uppercase tracking-widest px-1">Your Engagement Link</Label>
                                    <div className="relative group">
                                        <Input
                                            id="personal-link"
                                            type="text"
                                            placeholder="https://social.com/p/yourpost"
                                            value={link}
                                            onChange={(e) => setLink(e.target.value)}
                                            disabled={claimMutation.isPending}
                                            className="w-full text-base py-7 px-4 rounded-2xl border-gray-100 bg-gray-50/50 focus:bg-white focus:ring-primary/20 transition-all font-medium"
                                        />
                                        {!link && <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300"><ArrowRight className="w-5 h-5" /></div>}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 px-2 font-medium">
                                        <AlertCircle className="w-3 h-3 text-primary" />
                                        Make sure your account is public before claiming
                                    </p>
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full py-8 text-lg font-bold rounded-2xl shadow-xl shadow-primary/20 hover:shadow-primary/30 active:scale-[0.98] transition-all bg-gradient-to-r from-primary to-blue-600"
                                    disabled={claimMutation.isPending || !link.trim()}
                                >
                                    {claimMutation.isPending ? (
                                        <div className="flex items-center gap-3">
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            <span>Processing Reward...</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-3">
                                            <Sparkles className="w-5 h-5 text-yellow-300" />
                                            <span>Boost My Page Now</span>
                                        </div>
                                    )}
                                </Button>
                            </form>
                        </div>
                    )}

                    {/* Not Eligible State */}
                    {!checkingEligibility && !eligibilityError && eligibilityData?.status === 'not_eligible' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="space-y-6 text-center">
                                <div className="relative inline-block">
                                    <div className="absolute inset-0 bg-yellow-400/20 blur-2xl rounded-full" />
                                    <div className="relative p-6 bg-yellow-50 rounded-full inline-block border-2 border-yellow-200">
                                        <Gift className="w-12 h-12 text-yellow-600" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-2xl font-extrabold text-gray-900 tracking-tight">Unlock Your Prize</h3>
                                    <p className="text-muted-foreground max-w-[280px] mx-auto text-sm font-medium leading-relaxed">
                                        Almost there! Complete your daily deposit goal to claim your social boost.
                                    </p>
                                </div>
                            </div>

                            <div className="bg-white border-2 border-gray-50 rounded-3xl p-6 shadow-sm space-y-4">
                                <div className="flex items-center justify-between text-sm mb-1 px-1">
                                    <span className="font-bold text-gray-500">Progress</span>
                                    <span className="font-black text-primary">{Math.round(progressValue)}%</span>
                                </div>
                                <Progress value={progressValue} className="h-4 rounded-full bg-gray-100" />
                                <div className="flex justify-between items-end">
                                    <div className="space-y-1">
                                        <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Current Deposit</p>
                                        <p className="text-lg font-black text-gray-800">GHS {currentDeposit.toFixed(2)}</p>
                                    </div>
                                    <div className="text-right space-y-1">
                                        <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Daily Goal</p>
                                        <p className="text-lg font-black text-primary">GHS {requiredDeposit.toFixed(2)}</p>
                                    </div>
                                </div>
                            </div>

                            <Button
                                onClick={() => {
                                    handleClose();
                                    setTimeout(() => {
                                        const depositSection = document.getElementById('deposit-section');
                                        if (depositSection) depositSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }, 100);
                                }}
                                className="w-full py-8 text-lg font-bold rounded-2xl shadow-xl shadow-primary/10 hover:shadow-primary/20 bg-gray-900 hover:bg-black transition-all group"
                            >
                                <div className="flex items-center gap-3">
                                    <span>Fund Wallet to Unlock</span>
                                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </div>
                            </Button>
                        </div>
                    )}

                    {/* Already Claimed State */}
                    {!checkingEligibility && !eligibilityError && eligibilityData?.status === 'claimed' && (
                        <div className="py-12 flex flex-col items-center text-center space-y-8 animate-in zoom-in duration-500">
                            <div className="relative">
                                <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full scale-150" />
                                <div className="relative p-8 bg-blue-50 rounded-full inline-block border-2 border-blue-100">
                                    <CheckCircle className="w-16 h-16 text-blue-600" />
                                </div>
                            </div>
                            <div className="space-y-3 px-4">
                                <h3 className="text-2xl font-black text-gray-900 tracking-tight">Today's Goal Met!</h3>
                                <p className="text-muted-foreground font-medium leading-relaxed">
                                    You've already claimed your daily boost. Your social growth is in progress! 🚀
                                </p>
                            </div>
                            <div className="flex flex-col gap-3 w-full max-w-[280px]">
                                <div className="flex items-center justify-center gap-2 p-4 bg-gray-50 rounded-2xl text-sm font-bold text-gray-500 border border-gray-100">
                                    <Calendar className="w-4 h-4" />
                                    <span>Resetting at Midnight UTC</span>
                                </div>
                                <Button variant="ghost" onClick={handleClose} className="rounded-xl font-bold text-gray-400">
                                    Close and Explore
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ClaimRewardModal;
