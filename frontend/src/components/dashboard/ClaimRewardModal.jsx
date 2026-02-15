import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useRewardEligibility } from '@/hooks/useRewardEligibility';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Gift, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

const ClaimRewardModal = ({ isOpen, onClose }) => {
    const [link, setLink] = useState('');
    const queryClient = useQueryClient();

    const { data: eligibilityData, isLoading: checkingEligibility, error: eligibilityError } = useRewardEligibility();

    const claimMutation = useMutation({
        mutationFn: async (personalLink) => {
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
                body: JSON.stringify({ link: personalLink })
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

        claimMutation.mutate(link.trim());
    };

    const handleClose = () => {
        if (!claimMutation.isPending) {
            setLink('');
            onClose();
        }
    };

    // Auto-close for "already claimed" state
    React.useEffect(() => {
        if (eligibilityData?.status === 'claimed' && isOpen) {
            const timer = setTimeout(() => {
                onClose();
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [eligibilityData?.status, isOpen, onClose]);

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-2xl">
                        <Gift className="w-6 h-6 text-primary" />
                        Claim Daily Reward
                    </DialogTitle>
                    <DialogDescription>
                        Deposit GHS {eligibilityData?.data?.required?.toFixed(2) || '15.00'} or more today to claim your reward
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    {/* Loading State */}
                    {checkingEligibility && (
                        <div className="flex flex-col items-center justify-center py-8 space-y-4">
                            <Loader2 className="w-12 h-12 animate-spin text-primary" />
                            <p className="text-muted-foreground">Checking eligibility...</p>
                        </div>
                    )}

                    {/* Error State */}
                    {eligibilityError && (
                        <div className="flex flex-col items-center justify-center py-8 space-y-4">
                            <XCircle className="w-12 h-12 text-destructive" />
                            <p className="text-destructive text-center">
                                {eligibilityError.message || 'Failed to check eligibility'}
                            </p>
                            <Button onClick={() => queryClient.invalidateQueries({ queryKey: ['reward-eligibility'] })}>
                                Try Again
                            </Button>
                        </div>
                    )}

                    {/* Eligible State */}
                    {!checkingEligibility && !eligibilityError && eligibilityData?.status === 'eligible' && (
                        <div className="space-y-6">
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
                                <div className="flex items-center gap-2 text-green-700">
                                    <CheckCircle className="w-5 h-5" />
                                    <p className="font-semibold">You're eligible for today's reward!</p>
                                </div>
                                <p className="text-sm text-green-600">
                                    You've deposited GHS {eligibilityData.data.current.toFixed(2)} today
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="personal-link">Your Personal Link</Label>
                                    <Input
                                        id="personal-link"
                                        type="text"
                                        placeholder="https://instagram.com/yourpage"
                                        value={link}
                                        onChange={(e) => setLink(e.target.value)}
                                        disabled={claimMutation.isPending}
                                        className="w-full"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Enter your social media profile or website link
                                    </p>
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full"
                                    disabled={claimMutation.isPending || !link.trim()}
                                >
                                    {claimMutation.isPending ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Claiming...
                                        </>
                                    ) : (
                                        <>
                                            <Gift className="w-4 h-4 mr-2" />
                                            Claim Reward
                                        </>
                                    )}
                                </Button>
                            </form>
                        </div>
                    )}

                    {/* Not Eligible State */}
                    {!checkingEligibility && !eligibilityError && eligibilityData?.status === 'not_eligible' && (
                        <div className="space-y-6">
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-2">
                                <div className="flex items-center gap-2 text-yellow-700">
                                    <AlertCircle className="w-5 h-5" />
                                    <p className="font-semibold">Deposit required to claim reward</p>
                                </div>
                                <p className="text-sm text-yellow-600">
                                    You need to deposit at least GHS {eligibilityData.data.required.toFixed(2)} today
                                </p>
                                <p className="text-sm text-yellow-600">
                                    Current deposit: GHS {eligibilityData.data.current.toFixed(2)}
                                </p>
                            </div>

                            <Button
                                onClick={() => {
                                    onClose();
                                    // Scroll to deposit section
                                    setTimeout(() => {
                                        const depositSection = document.getElementById('deposit-section');
                                        if (depositSection) {
                                            depositSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                        }
                                    }, 100);
                                }}
                                className="w-full"
                            >
                                Make a Deposit
                            </Button>
                        </div>
                    )}

                    {/* Already Claimed State */}
                    {!checkingEligibility && !eligibilityError && eligibilityData?.status === 'claimed' && (
                        <div className="flex flex-col items-center justify-center py-8 space-y-4">
                            <div className="bg-blue-50 border border-blue-200 rounded-full p-4">
                                <CheckCircle className="w-12 h-12 text-blue-600" />
                            </div>
                            <div className="text-center space-y-2">
                                <p className="font-semibold text-lg">You've already claimed today's reward</p>
                                <p className="text-muted-foreground">Come back tomorrow!</p>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default ClaimRewardModal;
