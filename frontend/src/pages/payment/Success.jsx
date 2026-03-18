import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, Home, List, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

const SuccessPage = ({ onUpdateUser }) => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [verifying, setVerifying] = useState(true);
    const [statusMessage, setStatusMessage] = useState('Verifying your payment...');
    const [isAwaitingBalance, setIsAwaitingBalance] = useState(false);

    // KoraPay uses `reference`; Hubtel uses `clientReference`
    const provider = searchParams.get('provider'); // 'korapay' or undefined (Hubtel)
    const clientReference = searchParams.get('clientReference') || searchParams.get('reference');
    const tokenFromUrl = searchParams.get('token');
    const hasVerified = React.useRef(false);

    const verifyAndRefresh = async () => {
        if (!clientReference) {
            setVerifying(false);
            return;
        }

        setVerifying(true);

        try {
            const { data: authData } = await supabase.auth.getSession();
            const token = authData?.session?.access_token;

            if (!token) {
                console.warn('No auth token available for payment verification');
                setStatusMessage('Auth token missing. Please refresh.');
                setVerifying(false);
                return;
            }

            if (provider === 'korapay') {
                // ── KoraPay Checkout Redirect verify ─────────────────────────────
                setStatusMessage('Checking transaction status with KoraPay...');
                const response = await fetch('/api/payments/korapay/verify', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ reference: clientReference })
                });

                const data = await response.json();

                if (data.success) {
                    if (data.status === 'approved') {
                        setStatusMessage('Payment verified! Updating your balance...');
                        if (onUpdateUser) await onUpdateUser();
                        setIsAwaitingBalance(false);
                        toast.success('Payment verified and balance updated!');
                    } else if (data.korapayStatus === 'failed') {
                        setStatusMessage('Payment failed or was declined.');
                        setIsAwaitingBalance(false);
                    } else {
                        setStatusMessage(`Transaction is still ${data.status}. This can take a few minutes.`);
                        setIsAwaitingBalance(true);
                    }
                } else {
                    setStatusMessage(data.message || data.error || 'Status check completed.');
                    setIsAwaitingBalance(false);
                }
            } else {
                // ── Hubtel status-check (default) ─────────────────────────────────
                setStatusMessage('Checking transaction status with Hubtel...');
                const response = await fetch('/api/payments/hubtel/status-check', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        clientReference,
                        token: tokenFromUrl
                    })
                });

                const data = await response.json();

                if (data.success) {
                    if (data.status === 'approved') {
                        setStatusMessage('Payment verified! Updating your balance...');
                        if (onUpdateUser) await onUpdateUser();
                        setIsAwaitingBalance(false);
                        toast.success('Payment verified and balance updated!');
                    } else {
                        setStatusMessage(`Transaction is still ${data.status}. This can take a few minutes.`);
                        setIsAwaitingBalance(true);
                    }
                } else {
                    const detailMsg = data.details?.bodySnippet ? ` (${data.details.bodySnippet})` : '';
                    setStatusMessage((data.error || data.message || 'Status check completed.') + detailMsg);
                    if (data.error === 'Transaction not found') {
                        setIsAwaitingBalance(false);
                    }
                }
            }

            setVerifying(false);
        } catch (error) {
            console.error('Error verifying payment or refreshing user:', error);
            setStatusMessage('Verification encountered an issue. Please check your balance in the dashboard.');
            setVerifying(false);
        }
    };

    useEffect(() => {
        if (hasVerified.current) return;
        hasVerified.current = true;

        verifyAndRefresh();

        // Show a success toast
        toast.success('Payment completed successfully!', { id: 'payment-success' });

        // Auto-redirect to dashboard after 20 seconds if successfully verified
        const timer = setTimeout(() => {
            // navigate('/dashboard');
        }, 20000);

        return () => clearTimeout(timer);
    }, [onUpdateUser, navigate, clientReference]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
            <div className="bg-white p-8 sm:p-12 rounded-3xl shadow-2xl max-w-lg w-full text-center animate-slideUp">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle className="w-12 h-12 text-green-600" />
                </div>

                <h1 className="text-3xl font-bold text-gray-900 mb-4">Payment Successful!</h1>

                <p className="text-gray-600 mb-6 text-lg">
                    We've received your payment.
                </p>

                <div className="mb-8 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="flex items-center justify-center space-x-2 mb-2">
                        {verifying ? (
                            <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                        ) : isAwaitingBalance ? (
                            <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
                        ) : null}
                        <span className={`text-sm font-medium ${isAwaitingBalance ? 'text-amber-600' : 'text-gray-600'}`}>
                            {statusMessage}
                        </span>
                    </div>

                    {clientReference && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Reference</p>
                            <p className="text-xs font-mono text-indigo-500">{clientReference}</p>
                        </div>
                    )}

                    {isAwaitingBalance && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={verifyAndRefresh}
                            className="mt-2 text-indigo-600 hover:text-indigo-700 h-8 font-semibold"
                            disabled={verifying}
                        >
                            Refresh Status
                        </Button>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Button
                        asChild
                        className="h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-100"
                    >
                        <Link to="/dashboard">
                            <Home className="w-4 h-4 mr-2" />
                            Go to Dashboard
                        </Link>
                    </Button>

                    <Button
                        asChild
                        variant="outline"
                        className="h-12 border-2 border-indigo-50 hover:bg-indigo-50 text-indigo-600 rounded-xl"
                    >
                        <Link to="/orders">
                            <ArrowRight className="w-4 h-4 mr-2" />
                            Place an Order
                        </Link>
                    </Button>
                </div>

                <p className="mt-8 text-sm text-gray-400">
                    Your balance should update within 1-2 minutes. Need help? <Link to="/support" className="text-indigo-500 font-medium hover:underline">Contact Support</Link>
                </p>
            </div>
        </div>
    );
};

export default SuccessPage;
