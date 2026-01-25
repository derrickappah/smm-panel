import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

const OrderErrorModal = ({ isOpen, onClose, errorDetails, orderId }) => {
    const [copied, setCopied] = React.useState(false);

    const handleCopy = () => {
        if (!errorDetails) return;
        navigator.clipboard.writeText(JSON.stringify(errorDetails, null, 2));
        setCopied(true);
        toast.success("Error details copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
    };

    if (!errorDetails) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <div className="flex items-center gap-2 text-red-600 mb-1">
                        <AlertCircle className="w-5 h-5" />
                        <DialogTitle>Provider Error Details</DialogTitle>
                    </div>
                    <DialogDescription>
                        Raw response from SMM provider for order: <span className="font-mono text-xs bg-gray-100 px-1 rounded">{orderId}</span>
                    </DialogDescription>
                </DialogHeader>

                <div className="relative flex-1 min-h-0 mt-4 rounded-md border border-gray-200 bg-gray-50 overflow-hidden">
                    <Button
                        size="icon"
                        variant="ghost"
                        className="absolute right-4 top-4 z-10 h-8 w-8 hover:bg-gray-200"
                        onClick={handleCopy}
                        title="Copy to clipboard"
                    >
                        {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                    </Button>

                    <ScrollArea className="h-full w-full p-4">
                        <pre className="font-mono text-sm leading-relaxed whitespace-pre-wrap break-all">
                            {JSON.stringify(errorDetails, null, 2)}
                        </pre>
                    </ScrollArea>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <Button variant="outline" onClick={onClose}>Close</Button>
                    <Button
                        onClick={handleCopy}
                        className="flex items-center gap-2"
                    >
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        Copy Details
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default OrderErrorModal;
