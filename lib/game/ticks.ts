import type { Candle } from "../types.ts";

export type Tick = { p: number; at: number };

const KEEP = 2_400;

export function candlesFrom(ticks: Tick[], ms: number): Candle[] {
  const out: Candle[] = [];
  for (const { p, at } of ticks) {
    const t = Math.floor(at / ms) * ms;
    const last = out.at(-1);
    if (last && last.t === t) {
      last.h = Math.max(last.h, p);
      last.l = Math.min(last.l, p);
      last.c = p;
    } else if (!last || t > last.t) {
      out.push({ t, o: last ? last.c : p, h: Math.max(p, last ? last.c : p), l: Math.min(p, last ? last.c : p), c: p });
    }
  }
  return out;
}

export const withTick = (ticks: Tick[], tick: Tick): Tick[] => (ticks.at(-1)?.at === tick.at ? ticks : [...ticks.slice(-(KEEP - 1)), tick]);

const key = (symbol: string) => `tradewars.ticks.${symbol}`;

export function loadTicks(symbol: string): Tick[] {
  try {
    const kept: unknown = JSON.parse(sessionStorage.getItem(key(symbol)) ?? "[]");
    return Array.isArray(kept) ? (kept as Tick[]).filter((t) => Number.isFinite(t?.p) && Number.isFinite(t?.at)) : [];
  } catch {
    return [];
  }
}

export function saveTicks(symbol: string, ticks: Tick[]) {
  try {
    sessionStorage.setItem(key(symbol), JSON.stringify(ticks));
  } catch {}
}
