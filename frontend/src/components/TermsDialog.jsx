import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useTerms } from '@/hooks/useTerms';

const TermsDialog = ({ open, onOpenChange, onAccept }) => {
  const { data: termsData, isLoading } = useTerms();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
          <DialogTitle className="text-2xl font-bold">Terms and Conditions</DialogTitle>
          <DialogDescription>
            Please read our terms and conditions carefully before accepting.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto px-6 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            </div>
          ) : (
            <div className="prose prose-sm max-w-none pb-4">
              {termsData?.updated_at && (
                <p className="text-sm text-gray-500 mb-6">
                  Last Updated: {new Date(termsData.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              )}
              
              {termsData?.content ? (
                <div className="whitespace-pre-wrap text-gray-700 leading-relaxed text-sm">
                  {termsData.content}
                </div>
              ) : (
                <p className="text-gray-500 italic">Terms and conditions content not available.</p>
              )}

              <div className="mt-6 pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  By using BoostUp GH, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions.
                </p>
              </div>
            </div>
          )}
        </div>
        
        <DialogFooter className="px-6 pb-6 pt-4 border-t border-gray-200 flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              onAccept();
              onOpenChange(false);
            }}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            I Accept
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TermsDialog;

