"use client";

import { useEffect, useRef } from "react";

export default function AutoScrollToTop() {
  const timerRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      // Clear any previous timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      const scrollY = window.scrollY; // Current scroll from top
      const docHeight = document.documentElement.scrollHeight; // Full page height
      const winHeight = window.innerHeight; // Visible height
      const scrollPosition = scrollY + winHeight; // Where user is currently
      const halfwayPoint = docHeight / 2;

      // If user scrolled past halfway, do nothing
      if (scrollPosition >= halfwayPoint) return;

      // If user stays here for 7 seconds, scroll back to top
      timerRef.current = setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 7000);
    };

    window.addEventListener("scroll", handleScroll);
    

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return null; // No UI element
}
