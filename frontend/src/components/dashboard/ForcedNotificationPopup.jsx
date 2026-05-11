import React, { useState, useEffect } from 'react';
import { useServiceNotifications } from '@/hooks/useServiceNotifications';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

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
        order_id: currentNotification.order_id
      });
      // useServiceNotifications will invalidate query and update notifications list
    } catch (error) {
      console.error('Failed to acknowledge:', error);
    }
  };

  if (!currentNotification) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4">
      {/* Darkened/Blurred Backdrop - Enhanced for premium feel */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-xl animate-in fade-in duration-700" />
      
      {/* Popup Content */}
      <Card className="relative w-full max-w-lg shadow-[0_20px_50px_rgba(0,0,0,0.3)] animate-in slide-in-from-bottom-full duration-700 bg-white border-none overflow-hidden rounded-2xl">
        <CardHeader className="bg-gradient-to-r from-red-50 to-orange-50 border-b border-red-100 flex flex-row items-center gap-4 py-6">
          <div className="bg-red-500 p-2.5 rounded-xl shadow-lg shadow-red-200">
            <AlertTriangle className="w-7 h-7 text-white" />
          </div>
          <div>
            <CardTitle className="text-red-950 text-xl font-extrabold tracking-tight">ATTENTION REQUIRED</CardTitle>
            <p className="text-[10px] text-red-600 font-black uppercase tracking-[0.2em]">Urgent Service Update</p>
          </div>
        </CardHeader>
        
        <CardContent className="pt-6 space-y-4">
          {currentNotification.image_url && (
            <div className="rounded-lg overflow-hidden border border-gray-100 mb-4">
              <img 
                src={currentNotification.image_url} 
                alt="Notification" 
                className="w-full h-auto object-cover max-h-60"
              />
            </div>
          )}
          
          <div className="prose prose-sm text-gray-700 leading-relaxed">
            <p className="font-medium text-base whitespace-pre-wrap">
              {currentNotification.message}
            </p>
          </div>

          <div className="bg-gray-50 p-3 rounded-md border border-gray-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase">Related Order ID</span>
            <span className="text-sm font-mono font-bold text-gray-900 bg-white px-2 py-1 rounded shadow-sm border border-gray-200">
              {currentNotification.order_id.slice(0, 8).toUpperCase()}
            </span>
          </div>
        </CardContent>

        <CardFooter className="bg-gray-50/50 border-t border-gray-100 pt-4 pb-4">
          <Button 
            onClick={handleAcknowledge}
            disabled={isAcknowledging}
            className="w-full h-12 text-lg font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            {isAcknowledging ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                I Understand
              </span>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default ForcedNotificationPopup;
