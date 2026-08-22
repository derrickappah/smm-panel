import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

export default function MetaPixelTracker() {
  const location = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Base snippet in index.html fires initial PageView on page load.
    // Skip firing duplicate on initial render.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (typeof window !== "undefined" && typeof window.fbq === "function") {
      window.fbq("track", "PageView");
    }
  }, [location.pathname, location.search]);

  return null;
}
