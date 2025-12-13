import React, { useState, useEffect, memo } from 'react';

const AnimatedNumber = memo(({ value, previousValue, duration = 1000, formatter = (v) => v.toLocaleString() }) => {
  const [displayValue, setDisplayValue] = useState(previousValue || 0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (value !== previousValue && previousValue !== undefined) {
      setIsAnimating(true);
      const startValue = previousValue || 0;
      const endValue = value || 0;
      const startTime = Date.now();

      const animate = () => {
        const now = Date.now();
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function for smooth animation
        const easeOutCubic = 1 - Math.pow(1 - progress, 3);
        const currentValue = Math.floor(startValue + (endValue - startValue) * easeOutCubic);
        
        setDisplayValue(currentValue);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setDisplayValue(endValue);
          setIsAnimating(false);
        }
      };

      requestAnimationFrame(animate);
    } else {
      setDisplayValue(value || 0);
    }
  }, [value, previousValue, duration]);

  return (
    <span className={`transition-all duration-300 ${isAnimating ? 'scale-110 text-indigo-600' : ''}`}>
      {formatter(displayValue)}
    </span>
  );
});

AnimatedNumber.displayName = 'AnimatedNumber';

export default AnimatedNumber;















