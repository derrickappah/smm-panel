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
            toast.success(data.message || 'Claim successful! 🚀');
            queryClient.invalidateQueries({ queryKey: ['reward-eligibility'] });
            setLink('');
            setTimeout(onClose, 2000);
        },
        onError: (error) => {
            toast.error(error.message || 'Claim failed');
        }
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!link.trim()) {
            toast.error('Required link is missing');
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
            <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden border-none bg-[#fdfcff] shadow-xl rounded-[28px]">
                {/* Material 3 Header Style */}
                <div className="bg-[#f2f3f8] p-6 pb-4">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                <Zap className="w-6 h-6 fill-current" />
                            </div>
                            <DialogTitle className="text-xl font-medium text-[#1a1c1e] tracking-tight">Daily Reward Hub</DialogTitle>
                        </div>
                    </div>

                    {/* Digital Countdown Strip */}
                    {!checkingEligibility && eligibilityData?.status !== 'claimed' && (
                        <div className="bg-[#e2e2e6] rounded-2xl p-4 flex items-center justify-between animate-in fade-in duration-500">
                            <div className="flex items-center gap-2 text-[#44474e]">
                                <Clock className="w-4 h-4" />
                                <span className="text-xs font-medium uppercase tracking-wider">Next reset in</span>
                            </div>
                            <div className="flex gap-1 font-mono text-lg font-bold text-[#1a1c1e]">
                                <span className="bg-[#fdfcff] px-2 py-0.5 rounded-lg shadow-sm">{formatTime(timeLeft.hours)}h</span>
                                <span className="text-[#c6c6d0] animate-pulse">:</span>
                                <span className="bg-[#fdfcff] px-2 py-0.5 rounded-lg shadow-sm">{formatTime(timeLeft.minutes)}m</span>
                                <span className="text-[#c6c6d0] animate-pulse">:</span>
                                <span className="bg-[#fdfcff] px-2 py-0.5 rounded-lg shadow-sm">{formatTime(timeLeft.seconds)}s</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 pt-2">
                    {checkingEligibility && (
                        <div className="flex flex-col items-center justify-center py-20 space-y-4">
                            <Loader2 className="w-10 h-10 animate-spin text-primary" />
                            <p className="text-[#44474e] text-sm font-medium">Updating status...</p>
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
                        <div className="space-y-6">
                            <DialogDescription className="text-[#44474e] text-sm mt-2 px-1">
                                You are eligible for a daily reward. Please select your preferred boost and provide a link.
                            </DialogDescription>

                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="space-y-3">
                                    <Label className="text-xs font-bold text-[#74777f] uppercase ml-1">Selection</Label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <button
                                            type="button"
                                            onClick={() => setRewardType('likes')}
                                            className={cn(
                                                "relative flex flex-col items-start p-5 rounded-2xl border transition-all duration-200",
                                                rewardType === 'likes'
                                                    ? "bg-[#d3e3fd] border-transparent shadow-md"
                                                    : "bg-white border-[#c4c6cf] hover:bg-[#f2f3f8]"
                                            )}
                                        >
                                            <div className={cn("p-2 rounded-xl mb-3", rewardType === 'likes' ? "bg-white text-primary" : "bg-[#f2f3f8] text-[#74777f]")}>
                                                <Heart className={cn("w-5 h-5", rewardType === 'likes' && "fill-current")} />
                                            </div>
                                            <span className="text-2xl font-black text-[#1a1c1e]">{likesAmount.toLocaleString()}</span>
                                            <span className="text-[11px] font-bold text-[#44474e] uppercase">Daily Likes</span>
                                            {rewardType === 'likes' && <CheckCircle className="absolute top-4 right-4 w-5 h-5 text-primary" />}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setRewardType('views')}
                                            className={cn(
                                                "relative flex flex-col items-start p-5 rounded-2xl border transition-all duration-200",
                                                rewardType === 'views'
                                                    ? "bg-[#d3e3fd] border-transparent shadow-md"
                                                    : "bg-white border-[#c4c6cf] hover:bg-[#f2f3f8]"
                                            )}
                                        >
                                            <div className={cn("p-2 rounded-xl mb-3", rewardType === 'views' ? "bg-white text-primary" : "bg-[#f2f3f8] text-[#74777f]")}>
                                                <Eye className="w-5 h-5" />
                                            </div>
                                            <span className="text-2xl font-black text-[#1a1c1e]">{viewsAmount.toLocaleString()}</span>
                                            <span className="text-[11px] font-bold text-[#44474e] uppercase">Daily Views</span>
                                            {rewardType === 'views' && <CheckCircle className="absolute top-4 right-4 w-5 h-5 text-primary" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <Label htmlFor="personal-link" className="text-xs font-bold text-[#74777f] uppercase ml-1">Target Link</Label>
                                    <Input
                                        id="personal-link"
                                        placeholder="https://example.com/post"
                                        value={link}
                                        onChange={(e) => setLink(e.target.value)}
                                        disabled={claimMutation.isPending}
                                        className="h-14 bg-white border-[#c4c6cf] rounded-xl focus:ring-primary/20 text-[#1a1c1e] px-4"
                                    />
                                </div>

                                <Button
                                    type="submit"
                                    disabled={claimMutation.isPending || !link.trim()}
                                    className="w-full h-14 bg-primary hover:shadow-lg text-white font-bold rounded-full transition-all active:scale-[0.98] mt-4"
                                >
                                    {claimMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : "Claim Reward"}
                                </Button>
                            </form>
                        </div>
                    )}

                    {!checkingEligibility && eligibilityData?.status === 'not_eligible' && (
                        <div className="space-y-8 py-4">
                            <div className="text-center space-y-4">
                                <div className="w-20 h-20 rounded-full bg-[#f2f3f8] flex items-center justify-center mx-auto border border-[#e2e2e6] relative">
                                    <Gift className="w-8 h-8 text-[#44474e] opacity-40" />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <ShieldCheck className="w-5 h-5 text-primary opacity-20 translate-x-4 -translate-y-4" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-2xl font-bold text-[#1a1c1e] tracking-tight">Reward Locked</h3>
                                    <p className="text-[#44474e] text-sm px-8 leading-relaxed">
                                        You need to deposit <span className="font-bold text-[#1a1c1e]">GHS {(requiredDeposit - currentDeposit).toFixed(2)}</span> more today to unlock your free social boost.
                                    </p>
                                </div>
                            </div>

                            <div className="bg-[#f2f3f8] rounded-[24px] p-6 space-y-5 shadow-sm border border-[#e2e2e6]">
                                <div className="flex justify-between items-end">
                                    <div className="space-y-1">
                                        <span className="text-[10px] font-bold text-[#74777f] uppercase tracking-widest block">Instruction</span>
                                        <span className="text-sm font-bold text-[#1a1c1e]">Reach the Daily Target</span>
                                    </div>
                                    <span className="text-lg font-black text-primary">{Math.round(progressValue)}%</span>
                                </div>

                                <div className="space-y-2">
                                    <Progress value={progressValue} className="h-3 bg-[#e2e2e6] rounded-full" />
                                    <div className="flex justify-between text-[11px] font-bold text-[#74777f]">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-2 h-2 rounded-full bg-primary/40" />
                                            <span>Current: GHS {currentDeposit.toFixed(2)}</span>
                                        </div>
                                        <span>Target: GHS {requiredDeposit.toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3">
                                <Button
                                    onClick={() => {
                                        handleClose(); setTimeout(() => {
                                            const el = document.getElementById('deposit-section');
                                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                        }, 100);
                                    }}
                                    className="w-full h-14 bg-primary hover:bg-primary/90 text-white font-bold rounded-full flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98] group"
                                >
                                    <span>Deposit Now</span>
                                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </Button>
                                <p className="text-[10px] text-center text-[#74777f] font-medium">Rewards reset daily at 00:00 UTC</p>
                            </div>
                        </div>
                    )}

                    {!checkingEligibility && !eligibilityError && eligibilityData?.status === 'claimed' && (
                        <div className="py-14 flex flex-col items-center text-center space-y-8 animate-in zoom-in duration-500">
                            <div className="w-24 h-24 rounded-full bg-green-50 flex items-center justify-center shadow-inner">
                                <CheckCircle className="w-12 h-12 text-green-500" />
                            </div>
                            <div className="space-y-3">
                                <h3 className="text-2xl font-black text-[#1a1c1e]">Daily Reward Received</h3>
                                <p className="text-[#44474e] text-sm max-w-[280px] mx-auto font-medium">You've successfully secured your boost for today. See you tomorrow!</p>
                            </div>

                            <div className="bg-[#f2f3f8] border border-[#e2e2e6] rounded-[28px] p-8 w-full max-w-[340px] shadow-sm">
                                <Clock className="w-6 h-6 text-primary mx-auto mb-4" />
                                <span className="text-xs font-bold text-[#74777f] uppercase tracking-widest mb-4 block">Reset Duration</span>
                                <div className="flex justify-center gap-6 items-center">
                                    <div className="flex flex-col items-center">
                                        <span className="text-3xl font-black text-[#1a1c1e]">{formatTime(timeLeft.hours)}</span>
                                        <span className="text-[10px] font-bold text-[#74777f] uppercase mt-1">Hours</span>
                                    </div>
                                    <span className="text-2xl font-bold text-[#c6c6d0] mb-6">:</span>
                                    <div className="flex flex-col items-center">
                                        <span className="text-3xl font-black text-[#1a1c1e]">{formatTime(timeLeft.minutes)}</span>
                                        <span className="text-[10px] font-bold text-[#74777f] uppercase mt-1">Mins</span>
                                    </div>
                                    <span className="text-2xl font-bold text-[#c6c6d0] mb-6">:</span>
                                    <div className="flex flex-col items-center">
                                        <span className="text-3xl font-black text-[#1a1c1e]">{formatTime(timeLeft.seconds)}</span>
                                        <span className="text-[10px] font-bold text-[#74777f] uppercase mt-1">Secs</span>
                                    </div>
                                </div>
                            </div>

                            <Button variant="ghost" onClick={handleClose} className="text-[#74777f] hover:text-[#1a1c1e] font-bold rounded-full h-12 px-10">
                                Dismiss
                            </Button>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ClaimRewardModal;
