import React, { useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  handleMoolreDeposit,
  moolrePhoneNumber,
  setMoolrePhoneNumber,
  moolreChannel,
  setMoolreChannel,
  moolreOtpCode,
  setMoolreOtpCode,
  moolreRequiresOtp,
  moolreOtpVerifying = false,
  moolreOtpVerified = false,
  moolreOtpError = null,
  moolrePaymentStatus = null, // 'waiting' | 'success' | 'failed' | null
  loading,
  isPollingDeposit = false,
  pendingTransaction = null,
  manualDepositDetails = {
    phone_number: '0559272762',
    account_name: 'MTN - APPIAH MANASSEH ATTAH',
    instructions: 'Make PAYMENT to 0559272762\nMTN - APPIAH MANASSEH ATTAH\nuse your USERNAME as reference\nsend SCREENSHOT of PAYMENT when done'
  }
}) => {
  const enabledMethods = useMemo(() => [
    paymentMethodSettings.paystack_enabled && 'paystack',
    paymentMethodSettings.manual_enabled && 'manual',
    paymentMethodSettings.hubtel_enabled && 'hubtel',
    paymentMethodSettings.korapay_enabled && 'korapay',
    paymentMethodSettings.moolre_enabled && 'moolre'
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
    !paymentMethodSettings.korapay_enabled &&
    !paymentMethodSettings.moolre_enabled,
    [paymentMethodSettings]
  );

  // Helper function to highlight specific words in text
  const highlightWords = useCallback((text, phoneNumber, accountName) => {
    // Keywords to highlight
    const keywords = ['PAYMENT', 'USERNAME', 'SCREENSHOT'];
    
    // Create a regex pattern that matches keywords, phone number, or account name
    const pattern = new RegExp(
      `(${keywords.join('|')}|${phoneNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|${accountName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
      'gi'
    );
    
    // Split text by the pattern, keeping the matches
    const parts = text.split(pattern);
    
    return parts.map((part, index) => {
      const upperPart = part.toUpperCase();
      
      // Check if it's a keyword
      if (keywords.some(keyword => upperPart === keyword)) {
        return (
          <span key={index} className="text-blue-600 font-semibold">
            {part}
          </span>
        );
      }
      
      // Check if it's the phone number
      if (part === phoneNumber) {
        return (
          <span key={index} className="text-blue-600 font-semibold">
            {part}
          </span>
        );
      }
      
      // Check if it's the account name
      if (part === accountName) {
        return (
          <span key={index} className="font-semibold">
            {part}
          </span>
        );
      }
      
      // Regular text
      return <span key={index}>{part}</span>;
    });
  }, []);

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
          {paymentMethodSettings.moolre_enabled && (
            <button
              type="button"
              onClick={() => setDepositMethod('moolre')}
              className={`flex-1 py-2 px-3 sm:px-4 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                depositMethod === 'moolre'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              Moolre
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
            {(() => {
              // Parse instructions - split by \n and format
              const instructionLines = manualDepositDetails.instructions.split('\n').filter(line => line.trim());
              
              return (
                <ol className="list-decimal list-inside space-y-3 text-gray-900 text-base sm:text-lg">
                  {instructionLines.map((line, index) => {
                    // Replace phone number placeholder if exists (any 10-digit number)
                    let processedLine = line.replace(/\d{10}/g, manualDepositDetails.phone_number);
                    
                    // Replace account name if it matches the old format
                    if (line.includes('MTN') && line.includes('APPIAH')) {
                      processedLine = processedLine.replace(/MTN\s*-\s*APPIAH\s*MANASSEH\s*ATTAH/gi, manualDepositDetails.account_name);
                    } else if (line.trim() === manualDepositDetails.account_name || 
                               (index === 1 && !line.includes('PAYMENT') && !line.includes('USERNAME') && !line.includes('SCREENSHOT') && !line.match(/\d{10}/))) {
                      // If it's the account name line (usually second line without keywords)
                      processedLine = manualDepositDetails.account_name;
                    }
                    
                    // Check if this line is just the account name
                    const isAccountNameLine = processedLine.trim() === manualDepositDetails.account_name;
                    
                    return (
                      <li key={index} className={isAccountNameLine ? 'font-semibold' : ''}>
                        {isAccountNameLine ? (
                          <span className="font-semibold">{processedLine}</span>
                        ) : (
                          highlightWords(processedLine, manualDepositDetails.phone_number, manualDepositDetails.account_name)
                        )}
                      </li>
                    );
                  })}
                </ol>
              );
            })()}
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
                href="https://wa.me/233550069661" 
                target="_blank" 
                rel="noopener noreferrer"
                className="font-semibold text-blue-600 hover:text-blue-800 underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              >
                0550069661
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
                href="https://wa.me/233550069661" 
                target="_blank" 
                rel="noopener noreferrer"
                className="font-semibold text-blue-600 hover:text-blue-800 underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              >
                0550069661
              </a>
            </p>
          </div>
        </form>
      ) : depositMethod === 'moolre' && paymentMethodSettings.moolre_enabled ? (
        <form onSubmit={handleMoolreDeposit} className="space-y-4">
          {/* Circle Loader for Payment Approval Status */}
          {moolrePaymentStatus && pendingTransaction?.deposit_method === 'moolre' ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              {moolrePaymentStatus === 'waiting' && (
                <div className="text-center">
                  <div className="relative w-32 h-32 mx-auto mb-6">
                    <div className="absolute inset-0 border-4 border-blue-200 rounded-full"></div>
                    <div className="absolute inset-0 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Complete on your phone</h3>
                  <p className="text-sm text-gray-600 max-w-md">
                    A payment prompt has been sent to your phone. Please approve the payment on your device.
                  </p>
                </div>
              )}
              
              {moolrePaymentStatus === 'success' && (
                <div className="text-center">
                  <div className="relative w-32 h-32 mx-auto mb-6">
                    <div className="absolute inset-0 bg-green-100 rounded-full flex items-center justify-center">
                      <svg className="w-16 h-16 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Payment Successful!</h3>
                  <p className="text-sm text-gray-600 max-w-md">
                    Your payment has been approved and your balance has been updated.
                  </p>
                </div>
              )}
              
              {moolrePaymentStatus === 'failed' && (
                <div className="text-center">
                  <div className="relative w-32 h-32 mx-auto mb-6">
                    <div className="absolute inset-0 bg-red-100 rounded-full flex items-center justify-center">
                      <svg className="w-16 h-16 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Payment Failed</h3>
                  <p className="text-sm text-gray-600 max-w-md mb-4">
                    The payment was not approved. Please try again.
                  </p>
                  <Button
                    type="button"
                    onClick={() => {
                      // Reset form to allow retry
                      window.location.reload();
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg px-6 py-2"
                  >
                    Try Again
                  </Button>
                </div>
              )}
            </div>
          ) : moolreRequiresOtp ? (
            <>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800 font-medium mb-2">
                  OTP Verification Required
                </p>
                <p className="text-xs text-blue-700">
                  An OTP code has been sent to your phone. Please enter it below to continue with the payment.
                </p>
              </div>

              {/* OTP Verification Status Indicators */}
              {moolreOtpVerifying && !moolreOtpVerified && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      <div className="w-5 h-5 border-2 border-yellow-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-yellow-800 font-medium">
                        Verifying OTP...
                      </p>
                      <p className="text-xs text-yellow-700 mt-1">
                        Please wait while we verify your OTP code.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {moolreOtpVerified && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-green-800 font-medium">
                        OTP Verified Successfully!
                      </p>
                      <p className="text-xs text-green-700 mt-1">
                        Initiating payment request...
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {moolreOtpError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-red-800 font-medium">
                        Verification Failed
                      </p>
                      <p className="text-xs text-red-700 mt-1">
                        {moolreOtpError}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <Label htmlFor="moolre-otp" className="text-sm font-medium text-gray-700 mb-2 block">
                  OTP Code <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="moolre-otp"
                  type="text"
                  placeholder="Enter 6-digit OTP"
                  value={moolreOtpCode}
                  onChange={(e) => setMoolreOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className={`w-full h-11 rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-center text-lg tracking-widest ${
                    moolreOtpError ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''
                  }`}
                  maxLength={6}
                  required
                  autoFocus
                  disabled={moolreOtpVerifying}
                />
                <p className="text-xs text-gray-500 mt-1">Enter the 6-digit code sent to your phone</p>
              </div>
              <Button
                type="submit"
                disabled={loading || moolreOtpVerifying || !moolreOtpCode || moolreOtpCode.length !== 6}
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {moolreOtpVerifying ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    {moolreOtpVerified ? 'Initiating Payment...' : 'Verifying OTP...'}
                  </span>
                ) : (
                  'Verify OTP & Continue Payment'
                )}
              </Button>
            </>
          ) : (
            <>
              <div>
                <Label htmlFor="moolre-amount" className="text-sm font-medium text-gray-700 mb-2 block">Amount (GHS)</Label>
                <Input
                  id="moolre-amount"
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="Enter amount"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full h-11 rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>
              <div>
                <Label htmlFor="moolre-phone" className="text-sm font-medium text-gray-700 mb-2 block">
                  Mobile Money Number <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="moolre-phone"
                  type="tel"
                  placeholder="enter your momo number"
                  value={moolrePhoneNumber}
                  onChange={(e) => setMoolrePhoneNumber(e.target.value)}
                  className="w-full h-11 rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Enter your Mobile Money number</p>
              </div>
              <div>
                <Label htmlFor="moolre-channel" className="text-sm font-medium text-gray-700 mb-2 block">
                  Network <span className="text-red-500">*</span>
                </Label>
                <Select value={moolreChannel} onValueChange={setMoolreChannel}>
                  <SelectTrigger id="moolre-channel" className="w-full h-11">
                    <SelectValue placeholder="Select network" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="13">MTN</SelectItem>
                    <SelectItem value="14">Vodafone</SelectItem>
                    <SelectItem value="15">AirtelTigo</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">Select your Mobile Money network</p>
              </div>
              <Button
                type="submit"
                disabled={loading || !depositAmount || !moolrePhoneNumber || !moolreChannel}
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : 'Pay with Moolre'}
              </Button>
            </>
          )}
          <p className="text-xs sm:text-sm text-gray-600 text-center">
            Secure payment via Moolre Mobile Money. A payment prompt will be sent to your phone. Please approve the payment on your device.
          </p>
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs sm:text-sm text-blue-800 text-center">
              <span className="font-semibold">Having issues with deposits?</span>
              <br />
              <span className="mt-1 block">Text us on WhatsApp: </span>
              <a 
                href="https://wa.me/233550069661" 
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
                        src="https://spihsvdchouynfbsotwq.supabase.co/storage/v1/object/public/storage/deposit%20tutorial%20moolre.MOV"
                        type="video/quicktime"
                      />
                      Your browser does not support the video tag.
                    </video>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </form>
      ) : null}
    </div>
  );
});

DashboardDeposit.displayName = 'DashboardDeposit';

export default DashboardDeposit;

