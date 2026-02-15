import React, { useState } from 'react';
import Navbar from '@/components/Navbar';
import SEO from '@/components/SEO';
import ClaimRewardModal from '@/components/dashboard/ClaimRewardModal';
import { Gift, Wallet, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const RewardPage = ({ user, onLogout }) => {
    const [showModal, setShowModal] = useState(false);
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-gray-50">
            <SEO
                title="Daily Reward"
                description="Claim your daily reward by reaching the deposit threshold"
                canonical="/reward"
                noindex={true}
            />
            <Navbar user={user} onLogout={onLogout} />

            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
                <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 animate-fadeIn">
                    <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-8 sm:p-12 text-center text-white">
                        <div className="inline-flex items-center justify-center w-20 h-20 bg-white/20 backdrop-blur-md rounded-full mb-6">
                            <Gift className="w-10 h-10 text-white" />
                        </div>
                        <h1 className="text-3xl sm:text-4xl font-bold mb-4">Daily Reward Program</h1>
                        <p className="text-lg text-purple-100 max-w-2xl mx-auto">
                            We value our loyal users! Deposit GHS 15.00 or more today and claim a special reward for your account.
                        </p>
                    </div>

                    <div className="p-8 sm:p-12">
                        <div className="grid md:grid-cols-2 gap-8 items-center">
                            <div className="space-y-6">
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0 w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-bold">1</div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 text-lg">Make a Deposit</h3>
                                        <p className="text-gray-600">Ensure your total deposits today reach at least GHS 15.00.</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0 w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-bold">2</div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 text-lg">Click Claim</h3>
                                        <p className="text-gray-600">Once eligible, enter your link and claim your reward instantly.</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-shrink-0 w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-bold">3</div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 text-lg">Enjoy Your Bonus</h3>
                                        <p className="text-gray-600">The reward will be processed and applied to your account.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-gray-50 rounded-xl p-8 border border-gray-200 text-center">
                                <div className="mb-6">
                                    <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Your Current Balance</p>
                                    <div className="flex items-center justify-center gap-2">
                                        <Wallet className="w-5 h-5 text-indigo-600" />
                                        <span className="text-3xl font-bold text-gray-900">₵{user?.balance?.toFixed(2) || '0.00'}</span>
                                    </div>
                                </div>

                                <Button
                                    onClick={() => setShowModal(true)}
                                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 h-12 text-lg font-semibold shadow-md"
                                >
                                    Check Eligibility & Claim
                                    <ArrowRight className="w-5 h-5 ml-2" />
                                </Button>

                                <p className="mt-4 text-xs text-gray-500">
                                    Rewards can be claimed once every 24 hours.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-8 text-center">
                    <Button
                        variant="ghost"
                        onClick={() => navigate('/dashboard')}
                        className="text-gray-600 hover:text-indigo-600"
                    >
                        Back to Dashboard
                    </Button>
                </div>
            </div>

            <ClaimRewardModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
            />
        </div>
    );
};

export default RewardPage;
