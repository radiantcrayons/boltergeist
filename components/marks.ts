import type { Role, Side } from "@/lib/game/war";

// The colours the field and the panels share, and what the field marks, pins and offers at a price.
export const COLORS = { up: "#2bf5b5", down: "#ff4d6d", volt: "#ffe14a", text: "#d6dee6", dim: "#7c8894", bull: "#f8931a" };

export type Mark = { t: number; p: number; glyph: string; color: string };
// Another player's ghosts on the field: where they wait over their graves or came in on a call, in that player's own hue.
export type Pin = { id: string; p: number; role: Role; side: Side; hue: string; call: boolean };

// Each other player's hue, kept clear of your own mint and the long and short colours.
export const HUES = ["#a77dff", "#5cc8ff", "#ff9f43", "#ff6ad5", "#d4a373", "#b9e35a", "#a0aec0", "#ffc6a5", "#7f8cff"];

const hashOf = (text: string) => [...text].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

// A hue for each player by their id, the same every frame and as far as possible on every screen, no two alike while there are hues left.
export function huesFor(ids: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<number>();
  for (const id of [...ids].sort()) {
    let i = hashOf(id) % HUES.length;
    for (let tries = 0; taken.has(i) && tries < HUES.length; tries++) i = (i + 1) % HUES.length;
    taken.add(i);
    out.set(id, HUES[i]);
  }
  return out;
}
// What a click at a price would do, if anything, the price it would use, and what it would put on the field there.
export type Pick = { p: number; label: string; color: string; art?: "cloud" | { side: "long" | "short"; count: number } };

// A round step for marking prices: 1, 2 or 5 of a power of ten.
export function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  const f = raw / power;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * power;
}
