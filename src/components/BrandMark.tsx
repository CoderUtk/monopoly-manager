interface BrandMarkProps {
  size?: number;
}

export function BrandMark({ size = 34 }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className="brand-emblem"
    >
      <rect x="6" y="6" width="31" height="31" rx="2" fill="var(--land-ink)" />
      <rect
        x="3"
        y="3"
        width="31"
        height="31"
        rx="2"
        fill="var(--land-paper)"
        stroke="var(--land-ink)"
        strokeWidth="2"
      />
      <rect x="5" y="5" width="27" height="8" fill="var(--land-accent-2)" />
      <circle cx="10" cy="9" r="1.5" fill="var(--land-paper)" />
      <circle cx="15.5" cy="9" r="1.5" fill="var(--land-paper)" />
      <rect
        x="7.5"
        y="16.5"
        width="22"
        height="13"
        rx="1"
        fill="var(--land-accent)"
        stroke="var(--land-ink)"
        strokeWidth="1.75"
      />
      <line x1="10.5" y1="21" x2="19.5" y2="21" stroke="var(--land-ink)" strokeWidth="2" />
      <line x1="10.5" y1="25" x2="16" y2="25" stroke="var(--land-ink)" strokeWidth="2" />
      <polygon points="22,19.5 27,23 22,26.5" fill="var(--land-accent-2)" />
    </svg>
  );
}
