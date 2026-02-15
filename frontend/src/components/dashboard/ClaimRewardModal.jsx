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
            <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden border-none bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)] rounded-3xl">
                {/* Premium Light Header */}
                <div className="bg-slate-50/80 backdrop-blur-sm border-b border-slate-100 p-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center border border-primary/10">
                            <Zap className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <DialogTitle className="text-lg font-bold text-slate-900 tracking-tight">Reward Hub</DialogTitle>
                            <DialogDescription className="text-slate-500 text-xs">Premium daily growth boosters</DialogDescription>
                        </div>
                    </div>
                    {/* Compact Countdown - Light Style */}
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 pb-0.5 border-b border-slate-100">Resetting In</span>
                        <div className="flex gap-1 font-mono text-sm font-black text-slate-700">
                            <span>{formatTime(timeLeft.hours)}h</span>
                            <span className="text-slate-300 animate-pulse">:</span>
                            <span>{formatTime(timeLeft.minutes)}m</span>
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    {checkingEligibility && (
                        <div className="flex flex-col items-center justify-center py-16 space-y-4">
                            <Loader2 className="w-8 h-8 animate-spin text-primary/40" />
                            <p className="text-slate-400 text-sm font-medium">Authenticating claim...</p>
                        </div>
                    )}

                    {eligibilityError && !checkingEligibility && (
                        <div className="flex flex-col items-center text-center py-8 space-y-4">
                            <XCircle className="w-10 h-10 text-destructive/50" />
                            <div className="space-y-1">
                                <h3 className="text-slate-900 font-bold">Connection Error</h3>
                                <p className="text-slate-500 text-xs px-8">Unable to fetch reward status. Please try again.</p>
                            </div>
                            <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['reward-eligibility'] })} variant="outline" className="h-8 border-slate-200 text-xs text-slate-700 hover:bg-slate-50">Re-sync</Button>
                        </div>
                    )}

                    {!checkingEligibility && !eligibilityError && eligibilityData?.status === 'eligible' && (
                        <div className="space-y-6 animate-in fade-in duration-500">
                            <div className="flex items-center gap-3 p-4 bg-blue-50/50 border border-blue-100/50 rounded-2xl">
                                <ShieldCheck className="w-5 h-5 text-blue-600" />
                                <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Claim Eligibility Verified</span>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="space-y-3">
                                    <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Selection</Label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <button
                                            type="button"
                                            onClick={() => setRewardType('likes')}
                                            className={cn(
                                                "relative flex flex-col items-center p-6 rounded-2xl border-2 transition-all duration-300",
                                                rewardType === 'likes'
                                                    ? "border-primary bg-primary/[0.02] shadow-[0_10px_30px_-10px_rgba(59,130,246,0.15)] ring-1 ring-primary/10"
                                                    : "border-slate-50 bg-slate-50/30 hover:border-slate-100 hover:bg-slate-50/50"
                                            )}
                                        >
                                            <Heart className={cn("w-6 h-6 mb-3", rewardType === 'likes' ? "text-primary fill-primary" : "text-slate-300")} />
                                            <span className={cn("text-2xl font-black", rewardType === 'likes' ? "text-slate-900" : "text-slate-400")}>{likesAmount.toLocaleString()}</span>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Daily Likes</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setRewardType('views')}
                                            className={cn(
                                                "relative flex flex-col items-center p-6 rounded-2xl border-2 transition-all duration-300",
                                                rewardType === 'views'
                                                    ? "border-primary bg-primary/[0.02] shadow-[0_10px_30px_-10px_rgba(59,130,246,0.15)] ring-1 ring-primary/10"
                                                    : "border-slate-50 bg-slate-50/30 hover:border-slate-100 hover:bg-slate-50/50"
                                            )}
                                        >
                                            <Eye className={cn("w-6 h-6 mb-3", rewardType === 'views' ? "text-primary" : "text-slate-300")} />
                                            <span className={cn("text-2xl font-black", rewardType === 'views' ? "text-slate-900" : "text-slate-400")}>{viewsAmount.toLocaleString()}</span>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Daily Views</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2.5">
                                    <Label htmlFor="personal-link" className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Target Link</Label>
                                    <Input
                                        id="personal-link"
                                        placeholder="Paste Post URL here"
                                        value={link}
                                        onChange={(e) => setLink(e.target.value)}
                                        disabled={claimMutation.isPending}
                                        className="h-12 bg-white border-slate-100 rounded-xl focus:ring-primary/20 text-slate-900 placeholder:text-slate-300 shadow-sm"
                                    />
                                </div>

                                <Button
                                    type="submit"
                                    disabled={claimMutation.isPending || !link.trim()}
                                    className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-bold rounded-2xl shadow-[0_15px_30px_-10px_rgba(59,130,246,0.4)] transition-all active:scale-[0.98] mt-2 group"
                                >
                                    {claimMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                                        <div className="flex items-center gap-2">
                                            <span>Claim Booster</span>
                                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    )}
                                </Button>
                            </form>
                        </div>
                    )}

                    {!checkingEligibility && !eligibilityError && eligibilityData?.status === 'not_eligible' && (
                        <div className="space-y-8 animate-in fade-in duration-500 py-4">
                            <div className="text-center space-y-4">
                                <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mx-auto border border-slate-100 shadow-inner">
                                    <Gift className="w-7 h-7 text-slate-300" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-xl font-black text-slate-900 tracking-tight">Requirement Pending</h3>
                                    <p className="text-slate-500 text-xs px-10 leading-relaxed font-medium">Complete your daily deposit target to unlock today's social boosters.</p>
                                </div>
                            </div>

                            <div className="bg-slate-50 rounded-3xl p-6 space-y-5 border border-slate-100 shadow-sm">
                                <div className="flex justify-between items-end mb-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Progress to Unlock</span>
                                    <span className="text-sm font-black text-primary">{Math.round(progressValue)}%</span>
                                </div>
                                <Progress value={progressValue} className="h-2.5 bg-slate-200 rounded-full" />
                                <div className="flex justify-between text-[11px] font-bold">
                                    <div className="space-y-0.5">
                                        <p className="text-slate-300 uppercase text-[8px]">Current</p>
                                        <p className="text-slate-700">GHS {currentDeposit.toFixed(2)}</p>
                                    </div>
                                    <div className="text-right space-y-0.5">
                                        <p className="text-slate-300 uppercase text-[8px]">Daily Goal</p>
                                        <p className="text-primary">GHS {requiredDeposit.toFixed(2)}</p>
                                    </div>
                                </div>
                            </div>

                            <Button
                                onClick={() => {
                                    handleClose(); setTimeout(() => {
                                        const el = document.getElementById('deposit-section');
                                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }, 100);
                                }}
                                className="w-full h-14 bg-slate-900 border-b-4 border-slate-950 hover:bg-slate-800 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all active:border-b-0 active:translate-y-1 group"
                            >
                                <span>Go to Deposits</span>
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </Button>
                        </div>
                    )}

                    {!checkingEligibility && !eligibilityError && eligibilityData?.status === 'claimed' && (
                        <div className="py-12 flex flex-col items-center text-center space-y-8 animate-in zoom-in duration-500">
                            <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center shadow-sm relative">
                                <CheckCircle className="w-10 h-10 text-green-500" />
                                <div className="absolute -inset-2 bg-green-500/5 rounded-full animate-ping -z-10" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-2xl font-black text-slate-900 tracking-tight">Today's Booster Secured</h3>
                                <p className="text-slate-500 text-sm max-w-[280px] mx-auto font-medium">Your daily reward has been processed. Return tomorrow for another boost!</p>
                            </div>

                            <div className="bg-slate-50 border border-slate-100 rounded-3xl p-8 w-full max-w-[320px] shadow-sm">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4 block">Reset Duration</span>
                                <div className="flex justify-center gap-8 items-center">
                                    <div className="flex flex-col items-center">
                                        <span className="text-3xl font-black text-slate-800">{formatTime(timeLeft.hours)}</span>
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Hours</span>
                                    </div>
                                    <span className="text-2xl font-bold text-slate-200 mb-4">:</span>
                                    <div className="flex flex-col items-center">
                                        <span className="text-3xl font-black text-slate-800">{formatTime(timeLeft.minutes)}</span>
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Minutes</span>
                                    </div>
                                </div>
                            </div>

                            <Button variant="ghost" onClick={handleClose} className="text-slate-400 hover:text-slate-900 font-bold px-8 rounded-xl">
                                Back to Dashboard
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ClaimRewardModal;
