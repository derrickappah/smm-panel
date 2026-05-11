import React, { useState, useEffect } from 'react';
import { useServiceNotifications } from '@/hooks/useServiceNotifications';
import { Button } from '@/components/ui/button';
import { Bell, AlertCircle, CheckCircle2, ShieldCheck, Lightbulb } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const ForcedNotificationPopup = ({ userId }) => {
  const { notifications, acknowledge, isAcknowledging } = useServiceNotifications(userId);
  const [currentNotification, setCurrentNotification] = useState(null);

  useEffect(() => {
    if (notifications.length > 0) {
      setCurrentNotification(notifications[0]);
    } else {
      setCurrentNotification(null);
    }
  }, [notifications]);

  const handleAcknowledge = async () => {
    if (!currentNotification) return;
    
    try {
      await acknowledge({
        notificationId: currentNotification.notification_id,
        orderId: currentNotification.order_id
      });
    } catch (error) {
      console.error('Failed to acknowledge:', error);
    }
  };

  if (!currentNotification) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center">
      {/* Deep blurred backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-500" />
      
      {/* Bottom Sheet Popup */}
      <Card className="relative w-full max-w-2xl bg-white rounded-t-[2.5rem] shadow-[0_-10px_40px_rgba(0,0,0,0.2)] animate-in slide-in-from-bottom-full duration-700 overflow-hidden border-none">
        {/* Handle Bar */}
        <div className="flex justify-center pt-4 pb-2">
          <div className="w-16 h-1.5 bg-indigo-600/20 rounded-full" />
        </div>

        <CardContent className="px-6 sm:px-10 pb-10 pt-2 space-y-6">
          {/* Header Section */}
          <div className="flex items-center gap-4">
            <div className="bg-indigo-50 p-3 rounded-2xl">
              <Bell className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Important Notification</h3>
              <p className="text-xs text-gray-400 font-medium">Just now</p>
            </div>
          </div>

          {/* Info Card */}
          <div className="bg-[#F8F7FF] rounded-3xl p-6 border border-indigo-50">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h4 className="font-bold text-gray-900 text-lg">System Update</h4>
                <p className="text-sm text-gray-500 font-medium">Order ID: {currentNotification.order_id.slice(0, 10).toUpperCase()}</p>
              </div>
              <div className="bg-indigo-50 px-4 py-2 rounded-2xl flex items-center gap-2 border border-indigo-100">
                <AlertCircle className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-indigo-600 uppercase tracking-tight">Attention</span>
              </div>
            </div>

            {/* Notification Content */}
            <div className="space-y-4">
              <div className="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100/50">
                <div className="flex items-center gap-3 mb-4 text-indigo-700">
                  <Lightbulb className="w-5 h-5" />
                  <span className="font-bold">What you need to do:</span>
                </div>
                
                <div className="prose prose-sm text-gray-700 leading-relaxed max-w-none">
                  <div className="whitespace-pre-wrap font-medium">
                    {currentNotification.message}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="space-y-4">
            <Button 
              onClick={handleAcknowledge}
              disabled={isAcknowledging}
              className="w-full h-16 rounded-2xl text-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-200 transition-all active:scale-95 flex items-center justify-center gap-3"
            >
              {isAcknowledging ? (
                <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="w-7 h-7" />
                  I Understand
                </>
              )}
            </Button>

            {/* Footer Notice */}
            <div className="flex items-center justify-center gap-2 text-gray-400 text-sm font-medium">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>This message is important. Please read carefully.</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ForcedNotificationPopup;
