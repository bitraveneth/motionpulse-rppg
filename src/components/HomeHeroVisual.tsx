/** Decorative face frame for the marketing hero — not a stock photo. */
export function HomeHeroVisual() {
  return (
    <div className="home-hero-visual" aria-hidden>
      <div className="home-hero-visual-glow" />
      <svg
        className="home-hero-visual-svg"
        viewBox="0 0 360 420"
        role="img"
        aria-label=""
      >
        <defs>
          <linearGradient id="face-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e8f0f4" />
            <stop offset="100%" stopColor="#d5e3ea" />
          </linearGradient>
        </defs>
        <rect
          x="24"
          y="28"
          width="312"
          height="364"
          rx="28"
          fill="url(#face-bg)"
        />
        <ellipse cx="180" cy="200" rx="88" ry="108" fill="#c5d6df" opacity="0.55" />
        <ellipse cx="180" cy="205" rx="62" ry="78" fill="#b8ccd6" opacity="0.45" />
        <circle cx="148" cy="178" r="6" fill="#6b8a96" opacity="0.35" />
        <circle cx="212" cy="178" r="6" fill="#6b8a96" opacity="0.35" />
        <path
          d="M150 248 Q180 268 210 248"
          fill="none"
          stroke="#6b8a96"
          strokeWidth="3"
          opacity="0.25"
          strokeLinecap="round"
        />
        <rect
          x="108"
          y="118"
          width="144"
          height="168"
          rx="8"
          fill="none"
          stroke="#1a7f72"
          strokeWidth="2.5"
          opacity="0.85"
        />
        <text x="116" y="112" fill="#1a7f72" fontSize="11" fontFamily="system-ui">
          Face ROI
        </text>
        <circle cx="180" cy="202" r="118" fill="none" stroke="#1a7f72" opacity="0.12" strokeWidth="2">
          <animate
            attributeName="r"
            values="108;118;108"
            dur="2.4s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.2;0.08;0.2"
            dur="2.4s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
      <p className="home-hero-visual-caption">Sample preview — open a scan to run live</p>
    </div>
  )
}
