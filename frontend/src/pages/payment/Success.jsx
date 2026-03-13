import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, Home, List, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const SuccessPage = ({ onUpdateUser }) => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [verifying, setVerifying] = useState(true);
    const clientReference = searchParams.get('reference');
    const hasVerified = React.useRef(false);

    useEffect(() => {
        if (hasVerified.current) return;
        hasVerified.current = true;

        const verifyAndRefresh = async () => {
            try {
                // Proactively verify the transaction status with our backend (which queries Hubtel)
                if (clientReference) {
                    await fetch('/api/payments/hubtel/status-check', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ clientReference })
                    });
                }

                if (onUpdateUser) {
                    await onUpdateUser();
                }
                setVerifying(false);
            } catch (error) {
                console.error('Error verifying payment or refreshing user:', error);
                setVerifying(false);
            }
        };

        verifyAndRefresh();

        // Show a success toast
        toast.success('Payment completed successfully!', { id: 'payment-success' });

        // Auto-redirect to dashboard after 10 seconds if user doesn't click anything
        const timer = setTimeout(() => {
            // navigate('/dashboard');
        }, 10000);

        return () => clearTimeout(timer);
    }, [onUpdateUser, navigate, clientReference]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
            <div className="bg-white p-8 sm:p-12 rounded-3xl shadow-2xl max-w-lg w-full text-center animate-slideUp">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle className="w-12 h-12 text-green-600" />
                </div>

                <h1 className="text-3xl font-bold text-gray-900 mb-4">Payment Successful!</h1>

                <p className="text-gray-600 mb-8 text-lg">
                    Your payment has been processed successfully. Your account balance has been updated and you can now place orders.
                </p>

                {clientReference && (
                    <div className="bg-gray-50 rounded-xl p-4 mb-8 border border-gray-100">
                        <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold mb-1">Reference ID</p>
                        <p className="text-indigo-600 font-mono font-medium">{clientReference}</p>
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Button
                        asChild
                        className="h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl"
                    >
                        <Link to="/dashboard">
                            <Home className="w-4 h-4 mr-2" />
                            Go to Dashboard
                        </Link>
                    </Button>

                    <Button
                        asChild
                        variant="outline"
                        className="h-12 border-2 border-indigo-100 hover:bg-indigo-50 text-indigo-600 rounded-xl"
                    >
                        <Link to="/orders">
                            <ArrowRight className="w-4 h-4 mr-2" />
                            Place an Order
                        </Link>
                    </Button>
                </div>

                <p className="mt-8 text-sm text-gray-400">
                    Need help? <Link to="/support" className="text-indigo-500 hover:underline">Contact Support</Link>
                </p>
            </div>
        </div>
    );
};

export default SuccessPage;
