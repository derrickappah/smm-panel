import React from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { XCircle, Home, RefreshCw, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CancelledPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const clientReference = searchParams.get('reference');

    return (
        <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
            <div className="bg-white p-8 sm:p-12 rounded-3xl shadow-2xl max-w-lg w-full text-center animate-slideUp">
                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <XCircle className="w-12 h-12 text-red-600" />
                </div>

                <h1 className="text-3xl font-bold text-gray-900 mb-4">Payment Cancelled</h1>

                <p className="text-gray-600 mb-8 text-lg">
                    It looks like you cancelled the payment process or there was an issue. No funds have been deducted from your account.
                </p>

                <div className="flex flex-col gap-4">
                    <Button
                        asChild
                        className="h-12 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl"
                    >
                        <Link to="/dashboard?scrollToDeposit=true">
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Try Again
                        </Link>
                    </Button>

                    <Button
                        asChild
                        variant="ghost"
                        className="h-12 text-gray-600 hover:bg-gray-100 rounded-xl"
                    >
                        <Link to="/dashboard">
                            <Home className="w-4 h-4 mr-2" />
                            Return to Dashboard
                        </Link>
                    </Button>

                    <Button
                        asChild
                        variant="outline"
                        className="h-12 border-2 border-gray-100 hover:bg-gray-50 text-gray-600 rounded-xl"
                    >
                        <Link to="/support">
                            <MessageCircle className="w-4 h-4 mr-2" />
                            Talk to Support
                        </Link>
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default CancelledPage;
