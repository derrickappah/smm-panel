import React from 'react';

const ICON_MAP = {
  instagram: '/icons/instagram.png',
  tiktok: '/icons/tiktok.png',
  youtube: '/icons/youtube.png',
  facebook: '/icons/facebook.png',
  twitter: '/icons/twitter.png',
  x: '/icons/twitter.png',
  whatsapp: '/icons/whatsapp.png',
  telegram: '/icons/telegram.png',
  spotify: '/icons/spotify.png',
  snapchat: '/icons/snapchat.png',
};

export const getPlatformIconPath = (platformOrName, fallbackPath = null) => {
  if (!platformOrName) return fallbackPath;
  const str = String(platformOrName).toLowerCase();
  
  for (const [key, iconPath] of Object.entries(ICON_MAP)) {
    if (str.includes(key)) {
      return iconPath;
    }
  }
  
  if (str.includes('insta')) return ICON_MAP.instagram;
  if (str.includes('yt')) return ICON_MAP.youtube;
  if (str.includes('fb')) return ICON_MAP.facebook;
  if (str.includes('wa')) return ICON_MAP.whatsapp;
  if (str.includes('tg')) return ICON_MAP.telegram;
  if (str.includes('snap')) return ICON_MAP.snapchat;

  return fallbackPath;
};

const PlatformIcon = ({
  platform,
  serviceName,
  className = "w-5 h-5 object-contain inline-block shrink-0",
  alt = "",
  fallback = null
}) => {
  const iconPath = getPlatformIconPath(platform) || getPlatformIconPath(serviceName);

  if (!iconPath) {
    return fallback;
  }

  return (
    <img
      src={iconPath}
      alt={alt || platform || serviceName || "platform icon"}
      className={className}
      loading="lazy"
    />
  );
};

export default PlatformIcon;
