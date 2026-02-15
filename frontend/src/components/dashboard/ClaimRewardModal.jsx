import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useRewardEligibility } from '@/hooks/useRewardEligibility';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Gift, Loader2, CheckCircle, XCircle, AlertCircle, Heart, Eye, ArrowRight, Clock, ShieldCheck, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const ClaimRewardModal = ({ isOpen, onClose }) => {
    const [link, setLink] = useState('');
    const [rewardType, setRewardType] = useState('likes');
    const queryClient = useQueryClient();

    const { data: eligibilityData, isLoading: checkingEligibility, error: eligibilityError } = useRewardEligibility();

    // Countdown Logic
    const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });

    useEffect(() => {
        const calculateTimeLeft = () => {
            const now = new Date();
            const nextReset = new Date(Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate() + 1,
                0, 0, 0
            ));
            const diff = nextReset - now;

            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff / (1000 * 60)) % 60);
            const seconds = Math.floor((diff / 1000) % 60);

            return { hours, minutes, seconds };
        };

        const timer = setInterval(() => {
            setTimeLeft(calculateTimeLeft());
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    const formatTime = (val) => val.toString().padStart(2, '0');

    const claimMutation = useMutation({
        mutationFn: async ({ personalLink, type }) => {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !session) throw new Error('Not authenticated');

            const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
            const response = await fetch(`${BACKEND_URL}/api/reward/claim-reward`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ link: personalLink, reward_type: type })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to claim reward');
            return data;
        },
        onSuccess: (data) => {
            toast.success(data.message || 'Reward claimed! 🚀');
            queryClient.invalidateQueries({ queryKey: ['reward-eligibility'] });
            setLink('');
            setTimeout(onClose, 2000);
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
        claimMutation.mutate({ personalLink: link.trim(), type: rewardType });
    };

    const handleClose = () => {
        if (!claimMutation.isPending) {
            setLink('');
            setRewardType('likes');
            onClose();
        }
    };

    const likesAmount = eligibilityData?.data?.settings?.likes_amount || 1000;
    const viewsAmount = eligibilityData?.data?.settings?.views_amount || 1000;
    const requiredDeposit = eligibilityData?.data?.required || 15.00;
    const currentDeposit = eligibilityData?.data?.current || 0;
    const progressValue = Math.min((currentDeposit / requiredDeposit) * 100, 100);

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden border border-white/20 bg-[#0a0a0b] shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] rounded-2xl">
                {/* Sleek Obsidian Header */}
                <div className="bg-[#121214] border-b border-white/5 p-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                            <Zap className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <DialogTitle className="text-lg font-bold text-white tracking-tight">Reward Hub</DialogTitle>
                            <DialogDescription className="text-gray-500 text-xs">Unlock daily growth boosters</DialogDescription>
                        </div>
                    </div>
                    {/* Compact Countdown */}
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Next reset</span>
                        <div className="flex gap-1 font-mono text-xs font-bold text-primary/80 bg-primary/5 px-2 py-1 rounded-md border border-primary/10">
                            <span>{formatTime(timeLeft.hours)}h</span>
                            <span className="animate-pulse">:</span>
                            <span>{formatTime(timeLeft.minutes)}m</span>
                            <span className="animate-pulse">:</span>
                            <span>{formatTime(timeLeft.seconds)}s</span>
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    {checkingEligibility && (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                            <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
                            <p className="text-gray-500 text-sm font-medium">Syncing account status...</p>
                        </div>
                    )}

                    {eligibilityError && !checkingEligibility && (
                        <div className="flex flex-col items-center text-center py-8 space-y-4">
                            <XCircle className="w-10 h-10 text-destructive/50" />
                            <div className="space-y-1">
                                <h3 className="text-white font-bold">Connection Error</h3>
                                <p className="text-gray-500 text-xs px-8">Unable to fetch reward status. Please try again.</p>
                            </div>
                            <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['reward-eligibility'] })} variant="outline" className="h-8 border-white/10 text-xs">Re-sync</Button>
                        </div>
                    )}

                    {!checkingEligibility && !eligibilityError && eligibilityData?.status === 'eligible' && (
                        <div className="space-y-6 animate-in fade-in duration-500">
                            <div className="flex items-center gap-3 p-4 bg-green-500/5 border border-green-500/10 rounded-xl">
                                <ShieldCheck className="w-5 h-5 text-green-500" />
                                <span className="text-xs font-bold text-green-500 uppercase tracking-wider">Access Unlocked</span>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="space-y-3">
                                    <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Selected Booster</Label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setRewardType('likes')}
                                            className={cn(
                                                "relative flex flex-col items-center p-5 rounded-xl border-2 transition-all duration-200",
                                                rewardType === 'likes' ? "border-primary bg-primary/5 shadow-[0_0_20px_rgba(59,130,246,0.1)]" : "border-white/5 bg-white/5 hover:border-white/10"
                                            )}
                                        >
                                            <Heart className={cn("w-5 h-5 mb-2", rewardType === 'likes' ? "text-primary fill-primary" : "text-gray-600")} />
                                            <span className={cn("text-xl font-black", rewardType === 'likes' ? "text-white" : "text-gray-400")}>{likesAmount.toLocaleString()}</span>
                                            <span className="text-[9px] font-bold text-gray-500 uppercase">Daily Likes</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setRewardType('views')}
                                            className={cn(
                                                "relative flex flex-col items-center p-5 rounded-xl border-2 transition-all duration-200",
                                                rewardType === 'views' ? "border-primary bg-primary/5 shadow-[0_0_20px_rgba(59,130,246,0.1)]" : "border-white/5 bg-white/5 hover:border-white/10"
                                            )}
                                        >
                                            <Eye className={cn("w-5 h-5 mb-2", rewardType === 'views' ? "text-primary" : "text-gray-600")} />
                                            <span className={cn("text-xl font-black", rewardType === 'views' ? "text-white" : "text-gray-400")}>{viewsAmount.toLocaleString()}</span>
                                            <span className="text-[9px] font-bold text-gray-500 uppercase">Daily Views</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <Label htmlFor="personal-link" className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Engagement Link</Label>
                                    <Input
                                        id="personal-link"
                                        placeholder="Paste Instagram/Post Link here"
                                        value={link}
                                        onChange={(e) => setLink(e.target.value)}
                                        disabled={claimMutation.isPending}
                                        className="h-12 bg-white/5 border-white/10 rounded-xl focus:border-primary/50 text-white placeholder:text-gray-600 shadow-inner"
                                    />
                                </div>

                                <Button
                                    type="submit"
                                    disabled={claimMutation.isPending || !link.trim()}
                                    className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-[0_10px_20px_-10px_rgba(59,130,246,0.5)] transition-all active:scale-[0.98]"
                                >
                                    {claimMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Deploy Boost Now"}
                                </Button>
                            </form>
                        </div>
                    )}

                    {!checkingEligibility && !eligibilityError && eligibilityData?.status === 'not_eligible' && (
                        <div className="space-y-8 animate-in fade-in duration-500">
                            <div className="text-center space-y-4">
                                <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto">
                                    <Gift className="w-6 h-6 text-gray-400" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-lg font-bold text-white">Requirement Pending</h3>
                                    <p className="text-gray-500 text-xs px-12">Complete your daily deposit goal to activate today's reward selection.</p>
                                </div>
                            </div>

                            <div className="bg-white/5 border border-white/5 rounded-2xl p-5 space-y-4">
                                <div className="flex justify-between items-end mb-1">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Daily Progress</span>
                                    <span className="text-sm font-black text-primary">{Math.round(progressValue)}%</span>
                                </div>
                                <Progress value={progressValue} className="h-2 bg-white/10 rounded-full" />
                                <div className="flex justify-between font-mono text-[10px] text-gray-500 pt-1">
                                    <span>GHS {currentDeposit.toFixed(2)}</span>
                                    <span>GOAL: GHS {requiredDeposit.toFixed(2)}</span>
                                </div>
                            </div>

                            <Button
                                onClick={() => {
                                    handleClose(); setTimeout(() => {
                                        const el = document.getElementById('deposit-section');
                                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }, 100);
                                }}
                                className="w-full h-12 bg-white text-black hover:bg-white/90 font-bold rounded-xl flex items-center justify-center gap-2 group"
                            >
                                <span>Fund Wallet</span>
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </Button>
                        </div>
                    )}

                    {!checkingEligibility && !eligibilityError && eligibilityData?.status === 'claimed' && (
                        <div className="py-10 flex flex-col items-center text-center space-y-6 animate-in zoom-in duration-500">
                            <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                                <CheckCircle className="w-8 h-8 text-primary shadow-[0_0_20px_rgba(59,130,246,0.3)]" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-bold text-white">Daily Goal Achieved</h3>
                                <p className="text-gray-500 text-sm max-w-[240px] mx-auto">You've successfully secured your boost for today.</p>
                            </div>

                            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 w-full max-w-[300px] flex flex-col items-center">
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-3">Time until next claim</span>
                                <div className="flex gap-4 items-center">
                                    <div className="flex flex-col items-center">
                                        <span className="text-2xl font-black text-white">{formatTime(timeLeft.hours)}</span>
                                        <span className="text-[8px] font-bold text-gray-600 uppercase">Hours</span>
                                    </div>
                                    <span className="text-xl font-bold text-white/20 mb-3">:</span>
                                    <div className="flex flex-col items-center">
                                        <span className="text-2xl font-black text-white">{formatTime(timeLeft.minutes)}</span>
                                        <span className="text-[8px] font-bold text-gray-600 uppercase">Minutes</span>
                                    </div>
                                    <span className="text-xl font-bold text-white/20 mb-3">:</span>
                                    <div className="flex flex-col items-center">
                                        <span className="text-2xl font-black text-white">{formatTime(timeLeft.seconds)}</span>
                                        <span className="text-[8px] font-bold text-gray-600 uppercase">Seconds</span>
                                    </div>
                                </div>
                            </div>

                            <Button variant="ghost" onClick={handleClose} className="text-gray-500 hover:text-white transition-colors">
                                Return to Dashboard
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ClaimRewardModal;
