import { INK, MINT, SPARKY } from "./types";

export function Lightning({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 40" className={className} aria-hidden="true">
      <path d="M2 22 L34 10 L30 20 L70 6 L64 18 L108 4 L100 16 L158 14 L104 26 L110 16 L66 32 L72 22 L30 36 L36 26 Z" fill={SPARKY} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M20 22 L44 15 L42 20 L80 12 L76 18 L128 15 L84 22 L88 17 L50 26 L52 21 Z" fill="#fff" />
    </svg>
  );
}

export function Strikebolt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 400" className={className} aria-hidden="true" preserveAspectRatio="none">
      <path d="M70 0 L40 120 L72 118 L30 250 L66 246 L20 400 L100 210 L64 214 L104 96 L70 100 L96 0 Z" fill={SPARKY} stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <path d="M78 10 L54 116 L84 114 L46 236 L80 232 L50 340 L88 222 L56 226 L92 108 L62 112 L86 10 Z" fill="#fff" />
    </svg>
  );
}

export function Burst({ className, color = "#fff" }: { className?: string; color?: string }) {
  const points = Array.from({ length: 16 }, (_, i) => {
    const r = i % 2 ? 22 : 48;
    const a = (i / 16) * Math.PI * 2;
    return `${50 + Math.cos(a) * r},${50 + Math.sin(a) * r}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <polygon points={points} fill={color} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <circle cx="50" cy="50" r="14" fill={SPARKY} />
    </svg>
  );
}

export function Slash({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      {[18, 42, 66].map((x) => (
        <path key={x} d={`M${x} 8 Q ${x + 26} 50 ${x + 6} 94`} fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" />
      ))}
      {[18, 42, 66].map((x) => (
        <path key={`i${x}`} d={`M${x} 8 Q ${x + 26} 50 ${x + 6} 94`} fill="none" stroke="#ff4d6d" strokeWidth="3" strokeLinecap="round" />
      ))}
    </svg>
  );
}

export function Coin({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <circle cx="50" cy="50" r="44" fill={MINT.base} stroke={INK} strokeWidth="6" />
      <circle cx="50" cy="50" r="34" fill="none" stroke={MINT.shade} strokeWidth="4" />
      <path d="M58 18 L36 52 L50 52 L42 82 L66 46 L52 46 Z" fill={INK} />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <path d="M50 6 C27 6 14 23 14 46 L14 88 Q20 80 26 88 Q32 96 38 88 Q44 80 50 88 Q56 96 62 88 Q68 80 74 88 Q80 96 86 88 L86 46 C86 23 73 6 50 6 Z" fill={MINT.light} stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <path d="M50 14 C66 14 78 27 78 46 L78 86 Q74 82 70 86 L70 46 C70 30 62 18 50 14 Z" fill={MINT.base} />
      <ellipse cx="38" cy="44" rx="6.5" ry="9" fill={INK} />
      <ellipse cx="62" cy="44" rx="6.5" ry="9" fill={INK} />
      <ellipse cx="50" cy="66" rx="6" ry="7.5" fill={INK} />
      <circle cx="40" cy="40" r="2.2" fill="#fff" />
      <circle cx="64" cy="40" r="2.2" fill="#fff" />
    </svg>
  );
}
