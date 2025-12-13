import React, { useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from 'sonner';

const DashboardDeposit = React.memo(({
  depositMethod,
  setDepositMethod,
  depositAmount,
  setDepositAmount,
  paymentMethodSettings,
  manualDepositForm,
  setManualDepositForm,
  uploadingProof,
  handleDeposit,
  handleManualDeposit,
  handleHubtelDeposit,
  handleKorapayDeposit,
  loading,
  isPollingDeposit = false,
  pendingTransaction = null
}) => {
  const enabledMethods = useMemo(() => [
    paymentMethodSettings.paystack_enabled && 'paystack',
    paymentMethodSettings.manual_enabled && 'manual',
    paymentMethodSettings.hubtel_enabled && 'hubtel',
    paymentMethodSettings.korapay_enabled && 'korapay'
  ].filter(Boolean), [paymentMethodSettings]);

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB');
        return;
      }
      if (!file.type.startsWith('image/')) {
        toast.error('Please upload an image file');
        return;
      }
      setManualDepositForm(prev => ({ ...prev, payment_proof_file: file }));
    }
  }, [setManualDepositForm]);

  const allMethodsDisabled = useMemo(() => 
    !paymentMethodSettings.paystack_enabled && 
    !paymentMethodSettings.manual_enabled && 
    !paymentMethodSettings.hubtel_enabled && 
    !paymentMethodSettings.korapay_enabled,
    [paymentMethodSettings]
  );

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 sm:p-8 shadow-sm animate-slideUp">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Add Funds</h2>
        {isPollingDeposit && pendingTransaction && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
            <span className="text-xs sm:text-sm font-medium text-blue-700">
              Confirming payment...
            </span>
          </div>
        )}
      </div>
      
      {enabledMethods.length > 1 && depositMethod !== null && (
        <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-lg">
          {paymentMethodSettings.paystack_enabled && (
            <button
              type="button"
              onClick={() => setDepositMethod('paystack')}
              className={`flex-1 py-2 px-3 sm:px-4 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                depositMethod === 'paystack'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              Paystack
            </button>
          )}
          {paymentMethodSettings.manual_enabled && (
            <button
              type="button"
              onClick={() => setDepositMethod('manual')}
              className={`flex-1 py-2 px-3 sm:px-4 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                depositMethod === 'manual'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              Mobile Money
            </button>
          )}
          {paymentMethodSettings.hubtel_enabled && (
            <button
              type="button"
              onClick={() => setDepositMethod('hubtel')}
              className={`flex-1 py-2 px-3 sm:px-4 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                depositMethod === 'hubtel'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              Hubtel
            </button>
          )}
          {paymentMethodSettings.korapay_enabled && (
            <button
              type="button"
              onClick={() => setDepositMethod('korapay')}
              className={`flex-1 py-2 px-3 sm:px-4 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                depositMethod === 'korapay'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              Korapay
            </button>
          )}
        </div>
      )}

      {depositMethod === null ? (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-sm text-gray-600 text-center">Loading payment methods...</p>
        </div>
      ) : allMethodsDisabled ? (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800 text-center">
            All payment methods are currently disabled. Please contact support.
          </p>
        </div>
      ) : depositMethod === 'paystack' && paymentMethodSettings.paystack_enabled ? (
        <form onSubmit={handleDeposit} className="space-y-4">
          <div>
            <Label htmlFor="amount" className="text-sm font-medium text-gray-700 mb-2 block">Amount (GHS)</Label>
            <Input
              id="amount"
              data-testid="deposit-amount-input"
              type="number"
              step="0.01"
              min="1"
              placeholder="Enter amount"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="w-full h-11 rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <Button
            data-testid="deposit-submit-btn"
            type="submit"
            disabled={loading || isPollingDeposit || !depositAmount}
            className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPollingDeposit ? 'Confirming payment...' : loading ? 'Processing...' : 'Pay with Paystack'}
          </Button>
          <p className="text-xs sm:text-sm text-gray-600 text-center">
            Secure payment via Paystack. Funds are added instantly after successful payment.
          </p>
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs sm:text-sm text-blue-800 text-center">
              <span className="font-semibold">Having issues with deposits?</span>
              <br />
              <span className="mt-1 block">Text us on WhatsApp: </span>
              <a 
                href="https://wa.me/+233550069661" 
                target="_blank" 
                rel="noopener noreferrer"
                className="font-semibold text-blue-600 hover:text-blue-800 underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              >
                0550069661
              </a>
            </p>
          </div>
          <div className="mt-6">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="tutorial" className="border border-gray-200 rounded-lg overflow-hidden">
                <AccordionTrigger className="px-4 py-3 hover:no-underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-lg">
                  <span className="text-sm font-semibold text-gray-900">📹 How to Deposit - Video Tutorial</span>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="rounded-lg overflow-hidden bg-gray-100">
                    <video
                      controls
                      className="w-full h-auto"
                      preload="metadata"
                      style={{ maxHeight: '500px' }}
                    >
                      <source
                        src="https://spihsvdchouynfbsotwq.supabase.co/storage/v1/object/public/storage/tutorial.mp4"
                        type="video/mp4"
                      />
                      Your browser does not support the video tag.
                    </video>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </form>
      ) : depositMethod === 'manual' && paymentMethodSettings.manual_enabled ? (
        <form onSubmit={handleManualDeposit} className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
            <ol className="list-decimal list-inside space-y-3 text-gray-900 text-base sm:text-lg">
              <li>
                Make <span className="text-blue-600 font-semibold">PAYMENT</span> to 0559272762
              </li>
              <li className="font-semibold">MTN - APPIAH MANASSEH ATTAH</li>
              <li>
                use your <span className="text-blue-600 font-semibold">USERNAME</span> as reference
              </li>
              <li>
                send <span className="text-blue-600 font-semibold">SCREENSHOT</span> of <span className="text-blue-600 font-semibold">PAYMENT</span> when done
              </li>
            </ol>
          </div>
          <div>
            <Label htmlFor="payment-proof" className="text-sm font-medium text-gray-700 mb-2 block">
              Payment Proof Screenshot <span className="text-red-500">*</span>
            </Label>
            <Input
              id="payment-proof"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="w-full h-11 rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              required
            />
            {manualDepositForm.payment_proof_file && (
              <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-xs text-green-700">
                  ✓ Selected: {manualDepositForm.payment_proof_file.name}
                </p>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">Upload a screenshot of your payment confirmation (Max 5MB)</p>
          </div>
          <Button
            type="submit"
            disabled={loading || !manualDepositForm.payment_proof_file || uploadingProof}
            className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploadingProof ? 'Uploading...' : loading ? 'Submitting...' : 'Submit Manual Deposit'}
          </Button>
          <p className="text-xs sm:text-sm text-gray-600 text-center">
            Your deposit will be reviewed and approved within 5 minutes.
          </p>
        </form>
      ) : depositMethod === 'hubtel' && paymentMethodSettings.hubtel_enabled ? (
        <form onSubmit={handleHubtelDeposit} className="space-y-4">
          <div>
            <Label htmlFor="hubtel-amount" className="text-sm font-medium text-gray-700 mb-2 block">Amount (GHS)</Label>
            <Input
              id="hubtel-amount"
              type="number"
              step="0.01"
              min="1"
              placeholder="Enter the amount you sent"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="w-full h-11 rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>
          <Button
            type="submit"
            disabled={loading || !depositAmount}
            className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : 'Pay with Hubtel'}
          </Button>
          <p className="text-xs sm:text-sm text-gray-600 text-center">
            Secure payment via Hubtel. Funds are added instantly after successful payment.
          </p>
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs sm:text-sm text-blue-800 text-center">
              <span className="font-semibold">Having issues with deposits?</span>
              <br />
              <span className="mt-1 block">Text us on WhatsApp: </span>
              <a 
                href="https://wa.me/233559272762" 
                target="_blank" 
                rel="noopener noreferrer"
                className="font-semibold text-blue-600 hover:text-blue-800 underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              >
                0559272762
              </a>
            </p>
          </div>
        </form>
      ) : depositMethod === 'korapay' && paymentMethodSettings.korapay_enabled ? (
        <form onSubmit={handleKorapayDeposit} className="space-y-4">
          <div>
            <Label htmlFor="korapay-amount" className="text-sm font-medium text-gray-700 mb-2 block">Amount (GHS)</Label>
            <Input
              id="korapay-amount"
              type="number"
              step="0.01"
              min="1"
              placeholder="Enter the amount you sent"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="w-full h-11 rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>
          <Button
            type="submit"
            disabled={loading || !depositAmount}
            className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : 'Pay with Korapay'}
          </Button>
          <p className="text-xs sm:text-sm text-gray-600 text-center">
            Secure payment via Korapay. Funds are added instantly after successful payment.
          </p>
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs sm:text-sm text-blue-800 text-center">
              <span className="font-semibold">Having issues with deposits?</span>
              <br />
              <span className="mt-1 block">Text us on WhatsApp: </span>
              <a 
                href="https://wa.me/233559272762" 
                target="_blank" 
                rel="noopener noreferrer"
                className="font-semibold text-blue-600 hover:text-blue-800 underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              >
                0559272762
              </a>
            </p>
          </div>
        </form>
      ) : null}
    </div>
  );
});

DashboardDeposit.displayName = 'DashboardDeposit';

export default DashboardDeposit;

