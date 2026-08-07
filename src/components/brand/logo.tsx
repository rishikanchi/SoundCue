import Link from "next/link";

type LogoProps = {
  compact?: boolean;
  href?: string;
};

export function SoundCueLogo({ compact = false, href = "/" }: LogoProps) {
  return (
    <Link className="brand-logo" href={href} aria-label="SoundCue home">
      <svg
        className="brand-logo__mark"
        aria-hidden="true"
        viewBox="0 0 48 48"
        width="44"
        height="44"
      >
        <path d="M4 21v6M10 16v16M16 9v30M22 4v40M28 11v26M34 16v16M40 20v8M46 23v2" />
      </svg>
      {compact ? null : <span>SoundCue</span>}
    </Link>
  );
}
