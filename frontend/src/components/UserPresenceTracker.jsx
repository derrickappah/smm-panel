import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase, isConfigured } from '@/lib/supabase';

// Geolocation helper with browser timezone fallback
const getUserLocation = async () => {
  const cacheKey = 'boostup_presence_geo';
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }

  try {
    const res = await fetch('https://ipapi.co/json/');
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
    console.warn('[Presence Tracker] Geolocation API lookup failed, using browser defaults:', err.message);
  }

  // Fallback to local browser details
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

// Unique Guest session generator
const getGuestId = () => {
  const storageKey = 'boostup_guest_id';
  let guestId = localStorage.getItem(storageKey);
  if (!guestId) {
    guestId = 'guest_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem(storageKey, guestId);
  }
  return guestId;
};

// Device metadata extractor
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

  useEffect(() => {
    if (!isConfigured) return;

    let active = true;
    let channel = null;

    const setupPresence = async () => {
      // 1. Fetch user location and details
      const geo = await getUserLocation();
      if (!active) return;

      const device = getDeviceDetails();

      // 2. Fetch auth user
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;

      let trackerKey = '';
      let trackerPayload = {};

      if (session?.user) {
        // Logged in user
        const userId = session.user.id;
        const email = session.user.email;
        
        // Try to fetch profile name
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
          current_page: location.pathname,
          city: geo.city,
          country: geo.country,
          country_code: geo.country_code,
          device: device.device,
          browser: device.browser,
          last_active: new Date().toISOString()
        };
      } else {
        // Guest user
        const guestId = getGuestId();
        trackerKey = guestId;
        trackerPayload = {
          user_id: guestId,
          email: 'Anonymous Guest',
          name: 'Guest',
          role: 'guest',
          is_guest: true,
          current_page: location.pathname,
          city: geo.city,
          country: geo.country,
          country_code: geo.country_code,
          device: device.device,
          browser: device.browser,
          last_active: new Date().toISOString()
        };
      }

      // 3. Connect to Presence Channel
      // We clean up any existing subscription first
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }

      channel = supabase.channel('online-users', {
        config: {
          presence: {
            key: trackerKey,
          },
        },
      });

      channelRef.current = channel;

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track(trackerPayload);
        }
      });
    };

    setupPresence();

    return () => {
      active = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [location.pathname]); // Re-track whenever path changes

  return null; // Pure functional component, does not render anything
}
