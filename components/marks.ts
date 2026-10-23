// The colours the field and the panels share, and what the field marks, pins and offers at a price.
export const COLORS = { up: "#2bf5b5", down: "#ff4d6d", volt: "#ffe14a", text: "#d6dee6", dim: "#7c8894", bull: "#f8931a" };

export type Mark = { t: number; p: number; glyph: string; color: string };
// Others' traps, by the price axis.
export type Pin = { p: number; glyph: string; color: string };
// What a click at a price would do, if anything, the price it would use, and what it would put on the field there.
export type Pick = { p: number; label: string; color: string; art?: "cloud" | { side: "long" | "short"; count: number } };

// A round step for marking prices: 1, 2 or 5 of a power of ten.
export function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  const f = raw / power;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * power;
}
