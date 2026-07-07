import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase, isConfigured } from '@/lib/supabase';

// Geolocation helper with browser defaults & 2-second fetch timeout
const getUserLocation = async () => {
  const cacheKey = 'boostup_presence_geo';
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);

  try {
    const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      const locationData = {
        country: data.country_name || 'Unknown',
        country_code: data.country_code || 'UN',
        city: data.city || 'Unknown',
        region: data.region || 'Unknown',
        timezone: data.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
      };
      sessionStorage.setItem(cacheKey, JSON.stringify(locationData));
      return locationData;
    }
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('[Presence Tracker] Geolocation API lookup failed or timed out. Falling back to timezone:', err.message);
  }

  // Fallback using system timezone
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const parts = tz.split('/');
  const country = parts[0] || 'Unknown';
  const city = parts[1] ? parts[1].replace('_', ' ') : 'Unknown';

  return {
    country: country,
    country_code: 'UN',
    city: city,
    region: '',
    timezone: tz
  };
};

const getGuestId = () => {
  const storageKey = 'boostup_guest_id';
  let guestId = localStorage.getItem(storageKey);
  if (!guestId) {
    guestId = 'guest_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem(storageKey, guestId);
  }
  return guestId;
};

const getDeviceDetails = () => {
  const ua = navigator.userAgent;
  let device = 'Desktop';
  if (/mobile/i.test(ua)) device = 'Mobile';
  else if (/tablet|ipad|playbook|silk/i.test(ua)) device = 'Tablet';

  let browser = 'Unknown Browser';
  if (ua.indexOf('Chrome') > -1) browser = 'Chrome';
  else if (ua.indexOf('Safari') > -1) browser = 'Safari';
  else if (ua.indexOf('Firefox') > -1) browser = 'Firefox';
  else if (ua.indexOf('MSIE') > -1 || !!document.documentMode === true) browser = 'IE';

  return { device, browser };
};

export default function UserPresenceTracker() {
  const location = useLocation();
  const channelRef = useRef(null);
  const isSubscribedRef = useRef(false);
  const payloadRef = useRef(null);

  // 1. Initialize channel subscription ONCE on mount
  useEffect(() => {
    if (!isConfigured) return;

    let active = true;
    let channel = null;

    const initTracker = async () => {
      const geo = await getUserLocation();
      if (!active) return;

      const device = getDeviceDetails();
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;

      let trackerKey = '';
      let trackerPayload = {};

      if (session?.user) {
        const userId = session.user.id;
        const email = session.user.email;
        
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, role')
          .eq('id', userId)
          .single();

        trackerKey = userId;
        trackerPayload = {
          user_id: userId,
          email: email,
          name: profile?.name || email.split('@')[0],
          role: profile?.role || 'user',
          is_guest: false,
          current_page: window.location.pathname,
          city: geo.city,
          country: geo.country,
          country_code: geo.country_code,
          device: device.device,
          browser: device.browser,
          last_active: new Date().toISOString()
        };
      } else {
        const guestId = getGuestId();
        trackerKey = guestId;
        trackerPayload = {
          user_id: guestId,
          email: 'Anonymous Guest',
          name: 'Guest',
          role: 'guest',
          is_guest: true,
          current_page: window.location.pathname,
          city: geo.city,
          country: geo.country,
          country_code: geo.country_code,
          device: device.device,
          browser: device.browser,
          last_active: new Date().toISOString()
        };
      }

      payloadRef.current = trackerPayload;

      // Create subscription channel
      channel = supabase.channel('online-users', {
        config: {
          presence: {
            key: trackerKey,
          },
        },
      });

      channelRef.current = channel;

      channel.subscribe(async (status) => {
        console.log('[Presence Tracker] Channel Subscription status:', status);
        if (status === 'SUBSCRIBED' && active) {
          isSubscribedRef.current = true;
          try {
            await channel.track(payloadRef.current);
            console.log('[Presence Tracker] Tracked initial presence:', payloadRef.current.current_page);
          } catch (e) {
            console.error('[Presence Tracker] Failed to track presence:', e);
          }
        }
      });
    };

    initTracker();

    return () => {
      active = false;
      isSubscribedRef.current = false;
      if (channel) {
        supabase.removeChannel(channel);
        console.log('[Presence Tracker] Unsubscribed from channel');
      }
    };
  }, []);

  // 2. Track path updates dynamically without reconnecting
  useEffect(() => {
    if (!channelRef.current || !isSubscribedRef.current || !payloadRef.current) return;

    payloadRef.current.current_page = location.pathname;
    payloadRef.current.last_active = new Date().toISOString();

    console.log('[Presence Tracker] Path changed, updating payload:', location.pathname);
    channelRef.current.track(payloadRef.current).catch(err => {
      console.warn('[Presence Tracker] Failed to track path update:', err);
    });
  }, [location.pathname]);

  return null;
}
