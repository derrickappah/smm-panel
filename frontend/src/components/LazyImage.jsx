import React, { useState, useRef, useEffect } from 'react';

/**
 * LazyImage component that loads images only when they enter the viewport
 * Supports WebP with fallback and responsive images
 */
const LazyImage = ({
  src,
  srcSet,
  webpSrc,
  webpSrcSet,
  alt,
  className = '',
  placeholder = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"%3E%3C/svg%3E',
  onLoad,
  onError,
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef(null);
  const observerRef = useRef(null);

  useEffect(() => {
    // Check if IntersectionObserver is supported
    if (!('IntersectionObserver' in window)) {
      // Fallback: load immediately if IntersectionObserver is not supported
      setIsInView(true);
      return;
    }

    // Create IntersectionObserver
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            // Disconnect observer once image is in view
            if (observerRef.current && imgRef.current) {
              observerRef.current.unobserve(imgRef.current);
            }
          }
        });
      },
      {
        rootMargin: '50px', // Start loading 50px before image enters viewport
        threshold: 0.01,
      }
    );

    // Observe the image element
    if (imgRef.current) {
      observerRef.current.observe(imgRef.current);
    }

    // Cleanup
    return () => {
      if (observerRef.current && imgRef.current) {
        observerRef.current.unobserve(imgRef.current);
      }
    };
  }, []);

  const handleLoad = (e) => {
    setIsLoaded(true);
    if (onLoad) {
      onLoad(e);
    }
  };

  const handleError = (e) => {
    setHasError(true);
    if (onError) {
      onError(e);
    }
  };

  // Determine which image source to use
  const getImageSource = () => {
    if (hasError) {
      return placeholder;
    }
    
    // Check if browser supports WebP
    if (webpSrc && isInView) {
      // Use a simple check - modern browsers will handle WebP
      // For production, you might want to use a more sophisticated detection
      const supportsWebP = document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') === 0;
      if (supportsWebP) {
        return webpSrc;
      }
    }
    
    return src || placeholder;
  };

  const getImageSrcSet = () => {
    if (hasError) {
      return undefined;
    }
    
    // Check WebP support
    if (webpSrcSet && isInView) {
      const supportsWebP = document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') === 0;
      if (supportsWebP) {
        return webpSrcSet;
      }
    }
    
    return srcSet;
  };

  return (
    <div className={`lazy-image-wrapper ${className}`} ref={imgRef} style={{ position: 'relative' }}>
      {/* Placeholder/loading state */}
      {!isLoaded && !hasError && (
        <div
          className="lazy-image-placeholder"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: '#f3f4f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div className="animate-pulse bg-gray-200 w-full h-full" />
        </div>
      )}

      {/* Actual image */}
      {(isInView || isLoaded) && (
        <picture>
          {/* WebP source if available */}
          {webpSrc && !hasError && (
            <source
              srcSet={webpSrcSet || webpSrc}
              type="image/webp"
            />
          )}
          {/* Fallback image */}
          <img
            src={getImageSource()}
            srcSet={getImageSrcSet()}
            alt={alt || ''}
            className={`lazy-image ${isLoaded ? 'loaded' : 'loading'} ${className}`}
            onLoad={handleLoad}
            onError={handleError}
            loading="lazy"
            style={{
              opacity: isLoaded ? 1 : 0,
              transition: 'opacity 0.3s ease-in-out',
              width: '100%',
              height: 'auto',
            }}
            {...props}
          />
        </picture>
      )}

      {/* Error state */}
      {hasError && (
        <div
          className="lazy-image-error"
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: '#f3f4f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9ca3af',
            fontSize: '0.875rem',
          }}
        >
          Failed to load image
        </div>
      )}
    </div>
  );
};

export default LazyImage;

