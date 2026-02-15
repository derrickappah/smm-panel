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
import { Gift, Loader2, CheckCircle, XCircle, AlertCircle, Heart, Eye, ArrowRight, Clock, ShieldCheck, Zap, Lock, Unlock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const ClaimRewardModal = ({ isOpen, onClose }) => {
    const [link, setLink] = useState('');
    const [selectedTier, setSelectedTier] = useState(null);
    const [rewardType, setRewardType] = useState('likes');
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const { data: eligibilityResponse, isLoading: checkingEligibility, error: eligibilityError } = useRewardEligibility();
    const eligibilityData = eligibilityResponse?.data;
    const tiers = eligibilityData?.tiers || [];
    const currentDeposit = eligibilityData?.current || 0;

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
        mutationFn: async ({ personalLink, type, tierId }) => {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !session) throw new Error('Not authenticated');

            const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
            const response = await fetch(`${BACKEND_URL}/api/reward/claim-reward`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ link: personalLink, reward_type: type, tier_id: tierId })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to claim reward');
            return data;
        },
        onSuccess: (data) => {
            toast.success(data.message || 'Claim successful! 🚀');
            queryClient.invalidateQueries({ queryKey: ['reward-eligibility'] });
            setLink('');
            setSelectedTier(null);
            // Don't close immediately to allow claiming other tiers if available
        },
        onError: (error) => {
            toast.error(error.message || 'Claim failed');
        }
    });

    const handleClaimClick = (tier) => {
        setSelectedTier(tier);
        setRewardType('likes'); // Default
    };

    const handleSubmitClaim = (e) => {
        e.preventDefault();
        if (!link.trim()) {
            toast.error('Required link is missing');
            return;
        }
        if (!selectedTier) return;

        claimMutation.mutate({
            personalLink: link.trim(),
            type: rewardType,
            tierId: selectedTier.id
        });
    };

    const handleClose = () => {
        if (!claimMutation.isPending) {
            setLink('');
            setSelectedTier(null);
            onClose();
        }
    };

    // Calculate overall progress to next unlocked tier
    const nextLockedTier = tiers.find(t => !t.isUnlocked);
    const progressToNext = nextLockedTier
        ? Math.min((currentDeposit / parseFloat(nextLockedTier.required_amount)) * 100, 100)
        : 100;

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[550px] p-0 overflow-hidden border-none bg-[#fdfcff] shadow-xl rounded-[28px] max-h-[85vh] flex flex-col">
                {/* Material 3 Header Style */}
                <div className="bg-[#f2f3f8] p-6 pb-4 flex-shrink-0">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                <Zap className="w-6 h-6 fill-current" />
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-medium text-[#1a1c1e] tracking-tight">Daily Reward Tiers</DialogTitle>
                                <DialogDescription className="text-xs text-muted-foreground">Unlock higher rewards with more deposits</DialogDescription>
                            </div>
                        </div>
                        {/* Digital Countdown Strip */}
                        <div className="flex items-center gap-2 bg-white/50 px-3 py-1.5 rounded-full border border-white/60 shadow-sm">
                            <Clock className="w-3.5 h-3.5 text-primary" />
                            <div className="flex gap-0.5 font-mono text-xs font-bold text-[#1a1c1e]">
                                <span>{formatTime(timeLeft.hours)}</span>
                                <span className="text-[#c6c6d0] animate-pulse">:</span>
                                <span>{formatTime(timeLeft.minutes)}</span>
                                <span className="text-[#c6c6d0] animate-pulse">:</span>
                                <span>{formatTime(timeLeft.seconds)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Overall Progress */}
                    {!checkingEligibility && (
                        <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-bold text-gray-500 uppercase">Today's Deposit</span>
                                <span className="text-sm font-black text-primary">GHS {currentDeposit.toFixed(2)}</span>
                            </div>
                            <Progress value={progressToNext} className="h-2 bg-gray-100" indicatorClassName="bg-gradient-to-r from-blue-500 to-indigo-600" />
                            {nextLockedTier && (
                                <p className="text-[10px] text-gray-400 mt-1.5 text-right">
                                    GHS {(parseFloat(nextLockedTier.required_amount) - currentDeposit).toFixed(2)} more to unlock {nextLockedTier.name}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <div className="overflow-y-auto p-6 space-y-4 flex-grow">
                    {checkingEligibility ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                            <Loader2 className="w-10 h-10 animate-spin text-primary" />
                            <p className="text-[#44474e] text-sm font-medium">Loading tiers...</p>
                        </div>
                    ) : eligibilityError ? (
                        <div className="flex flex-col items-center text-center py-8 space-y-4">
                            <AlertCircle className="w-10 h-10 text-destructive/50" />
                            <p className="text-sm text-muted-foreground">Unable to load rewards.</p>
                            <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['reward-eligibility'] })} variant="outline" size="sm">Retry</Button>
                        </div>
                    ) : (
                        tiers.map((tier) => (
                            <div
                                key={tier.id}
                                className={cn(
                                    "relative border rounded-2xl p-4 transition-all duration-200",
                                    tier.isClaimed
                                        ? "bg-green-50 border-green-200 opacity-80"
                                        : tier.isUnlocked
                                            ? "bg-white border-primary/20 shadow-md ring-1 ring-primary/5"
                                            : "bg-gray-50 border-gray-200 opacity-70 grayscale-[0.5]"
                                )}
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "w-10 h-10 rounded-full flex items-center justify-center border",
                                            tier.isClaimed ? "bg-green-100 border-green-200 text-green-600" :
                                                tier.isUnlocked ? "bg-blue-100 border-blue-200 text-blue-600" :
                                                    "bg-gray-200 border-gray-300 text-gray-500"
                                        )}>
                                            {tier.isClaimed ? <CheckCircle className="w-5 h-5" /> :
                                                tier.isUnlocked ? <Unlock className="w-5 h-5" /> :
                                                    <Lock className="w-5 h-5" />}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-gray-900">{tier.name}</h4>
                                            <p className="text-xs text-gray-500 font-medium">Requires GHS {parseFloat(tier.required_amount).toFixed(2)}</p>
                                        </div>
                                    </div>

                                    {tier.isClaimed ? (
                                        <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded-full">Claimed</span>
                                    ) : tier.isUnlocked ? (
                                        <Button
                                            size="sm"
                                            className="h-8 rounded-full px-4 font-bold bg-primary hover:bg-primary/90"
                                            onClick={() => handleClaimClick(tier)}
                                        >
                                            Claim
                                        </Button>
                                    ) : (
                                        <span className="text-xs font-bold text-gray-400 bg-gray-200 px-2 py-1 rounded-full">Locked</span>
                                    )}
                                </div>

                                {/* Reward Info */}
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    <div className="bg-white/60 rounded-lg p-2 flex items-center gap-2 border border-black/5">
                                        <Heart className="w-3.5 h-3.5 text-pink-500 fill-current" />
                                        <span className="text-sm font-bold text-gray-700">{parseInt(tier.reward_likes).toLocaleString()} Likes</span>
                                    </div>
                                    <div className="bg-white/60 rounded-lg p-2 flex items-center gap-2 border border-black/5">
                                        <Eye className="w-3.5 h-3.5 text-indigo-500" />
                                        <span className="text-sm font-bold text-gray-700">{parseInt(tier.reward_views).toLocaleString()} Views</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Claim Form Overlay */}
                {selectedTier && (
                    <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-sm p-6 flex flex-col animate-in fade-in slide-in-from-bottom-5">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-gray-900">Claim {selectedTier.name}</h3>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedTier(null)} className="h-8 w-8 p-0 rounded-full">
                                <XCircle className="w-6 h-6 text-gray-400 hover:text-gray-600" />
                            </Button>
                        </div>

                        <form onSubmit={handleSubmitClaim} className="flex-grow flex flex-col space-y-6">
                            <div className="space-y-3">
                                <Label className="text-xs font-bold text-gray-500 uppercase">Select Reward</Label>
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        type="button"
                                        onClick={() => setRewardType('likes')}
                                        className={cn(
                                            "flex flex-col items-center p-4 rounded-xl border transition-all",
                                            rewardType === 'likes' ? "bg-blue-50 border-blue-200 shadow-sm ring-1 ring-blue-200" : "bg-white border-gray-200 hover:bg-gray-50"
                                        )}
                                    >
                                        <Heart className={cn("w-6 h-6 mb-2", rewardType === 'likes' ? "text-pink-500 fill-current" : "text-gray-400")} />
                                        <span className="text-lg font-bold text-gray-900">{parseInt(selectedTier.reward_likes).toLocaleString()}</span>
                                        <span className="text-[10px] font-bold text-gray-500 uppercase">Likes</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setRewardType('views')}
                                        className={cn(
                                            "flex flex-col items-center p-4 rounded-xl border transition-all",
                                            rewardType === 'views' ? "bg-indigo-50 border-indigo-200 shadow-sm ring-1 ring-indigo-200" : "bg-white border-gray-200 hover:bg-gray-50"
                                        )}
                                    >
                                        <Eye className={cn("w-6 h-6 mb-2", rewardType === 'views' ? "text-indigo-500" : "text-gray-400")} />
                                        <span className="text-lg font-bold text-gray-900">{parseInt(selectedTier.reward_views).toLocaleString()}</span>
                                        <span className="text-[10px] font-bold text-gray-500 uppercase">Views</span>
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <Label htmlFor="link" className="text-xs font-bold text-gray-500 uppercase">Link to boost</Label>
                                <Input
                                    id="link"
                                    placeholder="https://instagram.com/p/..."
                                    className="h-12"
                                    value={link}
                                    onChange={(e) => setLink(e.target.value)}
                                />
                            </div>

                            <div className="mt-auto pt-4">
                                <Button
                                    type="submit"
                                    className="w-full h-12 text-base font-bold rounded-full shadow-lg shadow-primary/20"
                                    disabled={claimMutation.isPending || !link}
                                >
                                    {claimMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Gift className="w-5 h-5 mr-2" />}
                                    Confirm Claim
                                </Button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Sticky Deposit Button if next tier exists and not checking */}
                {!checkingEligibility && nextLockedTier && !selectedTier && (
                    <div className="p-4 bg-white border-t">
                        <Button
                            onClick={() => {
                                handleClose();
                                const isDashboard = window.location.pathname === '/dashboard';
                                if (isDashboard) {
                                    setTimeout(() => {
                                        const el = document.getElementById('deposit-section');
                                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }, 100);
                                } else {
                                    navigate('/dashboard', { state: { scrollToDeposit: true } });
                                }
                            }}
                            className="w-full h-12 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl flex items-center justify-between px-6 transition-all"
                        >
                            <span>Deposit to Unlock Next Tier</span>
                            <ArrowRight className="w-5 h-5" />
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default ClaimRewardModal;
