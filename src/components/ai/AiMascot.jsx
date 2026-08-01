import React from 'react';

// "Ember" — a small forge-spark character standing in for the generic
// AI sparkle icon. Same droplet/flame silhouette used at every size so the
// FAB, panel header, and empty-state greeting all read as the same
// character. Personality lives entirely in the CSS animation states in
// AiAssistant.css (nk-mascot-idle / -thinking / -working), driven by the
// `status` prop.
export default function AiMascot({ status = 'idle', size = 28, className = '' }) {
  return (
    <svg
      className={`nk-mascot nk-mascot-${status} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <g className="nk-mascot-spark">
        <path d="M25 6 L26 8.5 L28.5 9.5 L26 10.5 L25 13 L24 10.5 L21.5 9.5 L24 8.5 Z" fill="currentColor" />
      </g>

      <g className="nk-mascot-body">
        <path
          d="M16 3C16 3 7 13.5 7 19.5C7 24.194 11.03 28 16 28C20.97 28 25 24.194 25 19.5C25 13.5 16 3 16 3Z"
          fill="url(#nk-mascot-flame)"
        />
        <path
          className="nk-mascot-flicker"
          d="M16 9C16 9 11.5 15.2 11.5 19.2C11.5 22.4 13.5 24.5 16 24.7"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
        />

        <g className="nk-mascot-eyes">
          <circle className="nk-mascot-eye" cx="13" cy="19.5" r="1.4" fill="#161104" />
          <circle className="nk-mascot-eye" cx="19" cy="19.5" r="1.4" fill="#161104" />
        </g>
        <path
          className="nk-mascot-mouth"
          d="M13 23C14 24.1 18 24.1 19 23"
          stroke="#161104"
          strokeWidth="1.3"
          strokeLinecap="round"
          fill="none"
        />
      </g>

      <defs>
        <linearGradient id="nk-mascot-flame" x1="16" y1="3" x2="16" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffe066" />
          <stop offset="55%" stopColor="#ffcc00" />
          <stop offset="100%" stopColor="#e2960a" />
        </linearGradient>
      </defs>
    </svg>
  );
}
