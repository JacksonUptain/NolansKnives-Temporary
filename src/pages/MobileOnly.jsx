import { useEffect, useState } from "react";

function useIsMobile(breakpoint = 850) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint}px)`);

    const update = () => setIsMobile(mediaQuery.matches);

    update();

    mediaQuery.addEventListener("change", update);

    return () => mediaQuery.removeEventListener("change", update);
  }, [breakpoint]);

  return isMobile;
}


export function MobileOnly({ children, breakpoint = 850 }) {
  const isMobile = useIsMobile(breakpoint);

  if (!isMobile) return null;

  return <>{children}</>;
}


export function NonMobileOnly({ children, breakpoint = 850 }) {
  const isMobile = useIsMobile(breakpoint);

  if (isMobile) return null;

  return <>{children}</>;
}