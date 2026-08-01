import React, { useCallback, useRef, useState } from 'react';

const MAX_PET_TILT_DEG = 16;

// "Ember AI" — a small living-flame character standing in for the generic AI
// sparkle icon: a two-layer flame (outer body + brighter inner core) with a
// subtle face, rising sparks, and a soft glow. Personality lives in the CSS
// animation states in AiAssistant.css (nk-mascot-idle / -thinking /
// -working), driven by the `status` prop — idle flickers gently, thinking
// leans like it's caught a breeze, working roars: taller, faster, brighter.
// When `interactive`, the flame also leans toward the cursor as it crosses
// the flame horizontally — like nudging it back and forth — independent of
// (and layered on top of) the idle/thinking/working flicker.
export default function AiMascot({ status = 'idle', size = 28, className = '', interactive = false }) {
  const [petTilt, setPetTilt] = useState(0);
  const svgRef = useRef(null);

  const handleMouseMove = useCallback((event) => {
    if (!interactive || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (!rect.width) return;
    const relX = (event.clientX - rect.left) / rect.width;
    const normalized = Math.max(-1, Math.min(1, (relX - 0.5) * 2));
    setPetTilt(normalized * MAX_PET_TILT_DEG);
  }, [interactive]);

  const handleMouseLeave = useCallback(() => {
    if (interactive) setPetTilt(0);
  }, [interactive]);

  return (
    <svg
      ref={svgRef}
      className={`nk-mascot nk-mascot-${status} ${interactive ? 'nk-mascot-interactive' : ''} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <g className="nk-mascot-spark nk-mascot-spark-1">
        <path d="M22 6 L22.7 7.9 L24.6 8.6 L22.7 9.3 L22 11.2 L21.3 9.3 L19.4 8.6 L21.3 7.9 Z" fill="currentColor" />
      </g>
      <g className="nk-mascot-spark nk-mascot-spark-2">
        <path d="M8 12.5 L8.5 13.7 L9.7 14.2 L8.5 14.7 L8 15.9 L7.5 14.7 L6.3 14.2 L7.5 13.7 Z" fill="currentColor" opacity="0.85" />
      </g>
      <g className="nk-mascot-spark nk-mascot-spark-3">
        <circle cx="17.5" cy="4" r="0.7" fill="currentColor" opacity="0.8" />
      </g>

      <g className="nk-mascot-pet-wrapper" style={interactive ? { transform: `rotate(${petTilt}deg)` } : undefined}>
        <g className="nk-mascot-outer">
          <path
            d="M16 3.5C12.5 8 9.5 11.5 9.5 17C9.5 22.5 12.2 26.5 16 26.5C19.9 26.5 22.5 22.6 22.5 17.3C22.5 14 20.8 11.7 19.3 9.8C19.6 12 18.2 13.3 16.7 12.6C17.8 9.6 17.4 6.2 16 3.5Z"
            fill="url(#nk-mascot-outer-grad)"
          />
        </g>

        <g className="nk-mascot-inner">
          <path
            d="M16.3 12.5C14.6 15 13.6 17.1 13.6 19.7C13.6 22.5 14.8 24.3 16.3 24.3C17.9 24.3 19 22.6 19 20.1C19 18.5 18.3 17.2 17.6 16.2C17.7 17.4 17 18 16.4 17.6C16.9 16.1 16.8 14.2 16.3 12.5Z"
            fill="url(#nk-mascot-inner-grad)"
          />
        </g>

        <g className="nk-mascot-eyes">
          <circle className="nk-mascot-eye" cx="14.3" cy="18.3" r="1.1" fill="#2b1c05" />
          <circle className="nk-mascot-eye" cx="17.7" cy="18.3" r="1.1" fill="#2b1c05" />
        </g>
      </g>

      <defs>
        <linearGradient id="nk-mascot-outer-grad" x1="16" y1="3.5" x2="16" y2="26.5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffe066" />
          <stop offset="55%" stopColor="#ffcc00" />
          <stop offset="100%" stopColor="#dd8f0a" />
        </linearGradient>
        <linearGradient id="nk-mascot-inner-grad" x1="16" y1="12.5" x2="16" y2="24.3" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fff6d0" />
          <stop offset="100%" stopColor="#ffe066" />
        </linearGradient>
      </defs>
    </svg>
  );
}
