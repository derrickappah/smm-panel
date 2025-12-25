import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export const ConnectionStatus: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <Badge
      variant="outline"
      className={`flex items-center gap-1.5 ${
        isOnline
          ? 'bg-green-100 text-green-700 border-green-200'
          : 'bg-red-100 text-red-700 border-red-200'
      }`}
    >
      {isOnline ? (
        <>
          <Wifi className="w-3 h-3" />
          Online
        </>
      ) : (
        <>
          <WifiOff className="w-3 h-3" />
          Offline
        </>
      )}
    </Badge>
  );
};

