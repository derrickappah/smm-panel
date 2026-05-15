import React, { useState, useEffect } from 'react';
import { useServiceNotifications } from '@/hooks/useServiceNotifications';
import { Button } from '@/components/ui/button';
import { Bell, AlertCircle, CheckCircle2, ShieldCheck, Lightbulb, PlayCircle, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const PremiumNotificationPopup = ({ user }) => {
  const { notifications, acknowledge, isAcknowledging } = useServiceNotifications(user?.id);
  const [currentNotification, setCurrentNotification] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
 
  useEffect(() => {
    if (notifications.length > 0) {
      setCurrentNotification(notifications[0]);
      // Small delay for entrance animation
      const timer = setTimeout(() => setIsVisible(true), 100);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
      // Wait for exit animation before clearing data
      const timer = setTimeout(() => setCurrentNotification(null), 500);
      return () => clearTimeout(timer);
    }
  }, [notifications]);
 
  const handleAcknowledge = async () => {
    if (!currentNotification) return;
    
    try {
      await acknowledge({
        notificationId: currentNotification.notification_id,
        orderId: currentNotification.order_id
      });
      setShowVideoModal(false); // Close video if open
    } catch (error) {
      console.error('Failed to acknowledge:', error);
    }
  };
 
  const getEmbedUrl = (url) => {
    if (!url) return '';
    
    // YouTube
    const ytMatch = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    
    // Vimeo
    const vimeoMatch = url.match(/(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(.+)/);
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    
    return url; // Fallback
  };

  if (!currentNotification) return null;

  // Get initials for the avatar

  return (
    <div className={cn(
      "fixed inset-0 z-[9999] flex items-end justify-center transition-all duration-700",
      isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
    )}>
      {/* luxury glassmorphism backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-xl" />
      
      {/* Popup Modal */}
      <Card className={cn(
        "relative w-full max-w-[440px] bg-white rounded-t-[2.5rem] rounded-b-none shadow-[0_-20px_50px_rgba(0,0,0,0.2)] border-none overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-[100%] opacity-0"
      )}>

        <CardContent className="px-5 py-4 space-y-3 max-h-[75vh] overflow-y-auto scrollbar-hide">
          {/* Main Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-50 p-2.5 rounded-2xl">
                <Bell className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 leading-tight">
                  {currentNotification.title || "Important Notification"}
                </h3>
                <p className="text-[9px] text-gray-400 font-bold tracking-wide uppercase">
                  {currentNotification.subtitle || "Just now"}
                </p>
              </div>
            </div>
            <button 
              onClick={() => setIsVisible(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* User & Order Profile Section */}
          <div className="bg-[#F9F9FF] rounded-xl p-3 flex items-center justify-between border border-indigo-50/50">
            <div className="flex items-center gap-3">
              <div>
                <h4 className="font-bold text-gray-900 text-sm">{user?.name || 'User'}</h4>
                {currentNotification.show_order_id && (
                  <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider">
                    Order ID: {currentNotification.provider_order_id}
                  </p>
                )}
              </div>
            </div>
            <div className="bg-white px-3 py-1.5 rounded-xl flex items-center gap-1.5 border border-indigo-100 shadow-sm">
              <AlertCircle className="w-3.5 h-3.5 text-indigo-600" />
              <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-tight">Attention</span>
            </div>
          </div>

          {/* Main Message Section */}
          <div className="space-y-2">
            <div 
              className="text-base font-bold text-gray-900 leading-tight whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ 
                __html: currentNotification.message.replace(/\*\*(.*?)\*\*/g, '<span class="text-indigo-600">$1</span>') 
              }}
            />
          </div>

          {/* "What You Need To Do" Section (Conditional) */}
          {currentNotification.show_instructions && (
            <div className="bg-indigo-50/40 rounded-xl p-3 border border-indigo-100/50 space-y-2">
              <div className="flex items-center gap-2 text-indigo-700">
                <Lightbulb className="w-3.5 h-3.5" />
                <span className="font-bold text-xs tracking-tight">
                  {currentNotification.instructions_title || "What you need to do:"}
                </span>
              </div>
              
              <ul className="space-y-1.5">
                {(currentNotification.instructions_steps || []).map((step, idx) => (
                  <li key={idx} className="flex gap-2 text-[12px] text-gray-700 font-medium leading-snug">
                    <span className="text-indigo-400 font-bold">{idx + 1}.</span>
                    <span dangerouslySetInnerHTML={{ 
                      __html: step.replace(/\[(.*?)\]/g, '<span class="text-indigo-600 font-bold">$1</span>') 
                    }} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Video Section (Conditional) */}
          {currentNotification.show_video && currentNotification.video_url && (
            <button 
              onClick={() => setShowVideoModal(true)}
              className="w-full flex items-center justify-between p-3 bg-white border border-indigo-100 rounded-xl hover:bg-indigo-50 transition-colors group"
            >
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-indigo-50 rounded-lg group-hover:bg-white transition-colors">
                  <PlayCircle className="w-4 h-4 text-indigo-600" />
                </div>
                <span className="text-xs font-bold text-gray-900">Watch Video Tutorial</span>
              </div>
              <PlayCircle className="w-4 h-4 text-indigo-400 opacity-50" />
            </button>
          )}

          {/* Action Button */}
          <div className="space-y-3 pt-1">
            <Button 
              onClick={handleAcknowledge}
              disabled={isAcknowledging}
              className="w-full h-11 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-100 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              {isAcknowledging ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                    <CheckCircle2 className="w-3 h-3" />
                  </div>
                  I Understand
                </>
              )}
            </Button>

            {/* Footer Notice */}
            <div className="flex items-center justify-center gap-2 text-gray-400 text-[11px] font-bold tracking-tight">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400/70" />
              <span className="uppercase">This message is important. Please read carefully.</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Video Modal Popup */}
      <div className={cn(
        "fixed inset-0 z-[10000] flex items-center justify-center p-4 transition-all duration-500",
        showVideoModal ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowVideoModal(false)} />
        <div className={cn(
          "relative w-full max-w-4xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl transition-all duration-500",
          showVideoModal ? "scale-100 translate-y-0" : "scale-95 translate-y-8"
        )}>
          <button 
            onClick={() => setShowVideoModal(false)}
            className="absolute top-4 right-4 z-10 p-2 bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          {showVideoModal && (
            <iframe
              src={getEmbedUrl(currentNotification.video_url)}
              className="w-full h-full border-none"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default PremiumNotificationPopup;
