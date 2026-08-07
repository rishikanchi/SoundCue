type AcousticVisualProps = {
  className?: string;
  variant?: "hero" | "quiet" | "compact";
};

const bars = [28, 42, 62, 88, 54, 39, 31, 24, 18];

export function AcousticVisual({
  className = "",
  variant = "hero",
}: AcousticVisualProps) {
  return (
    <div className={`acoustic-visual acoustic-visual--${variant} ${className}`} aria-hidden="true">
      <div className="acoustic-visual__rings">
        <i />
        <i />
        <i />
      </div>
      <svg viewBox="0 0 760 310" role="presentation">
        <path
          className="acoustic-visual__wave"
          d="M0 160c28 0 25-15 50-15 27 0 20 38 48 38 31 0 28-83 59-83 32 0 30 124 64 124 34 0 33-156 68-156 30 0 26 124 58 124 29 0 27-72 55-72"
        />
        <g className="acoustic-visual__bars">
          {bars.map((height, index) => (
            <line
              key={height + index}
              x1={420 + index * 30}
              x2={420 + index * 30}
              y1={155 - height}
              y2={155 + height}
            />
          ))}
        </g>
        <g className="acoustic-visual__dots">
          {Array.from({ length: 12 }, (_, index) => (
            <circle key={index} cx={690 + index * 18} cy="155" r={index < 4 ? 4 : 3} />
          ))}
        </g>
      </svg>
    </div>
  );
}
