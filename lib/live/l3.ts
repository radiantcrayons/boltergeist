import { decimalsOf } from "../format.ts";

export type L3Side = "buy" | "sell";

export type L3Order = { id: string; size: number };

// Each side's levels by price key, with the orders at each in their queue order.
export type Book = { symbol: string; seq: number; at: number; buy: Map<string, L3Order[]>; sell: Map<string, L3Order[]> };

export type Level = { key: string; price: number; size: number; orders: L3Order[] };

type RawLevel = { price: string; orders: { order_id: string; size: string }[] };

export type L3Snapshot = { type: "l3_snapshot"; symbol: string; last_sequence: number; timestamp: number; bids: RawLevel[]; asks: RawLevel[] };

export type L3Update = {
  type: "l3_update";
  symbol: string;
  action: "open" | "modify" | "cancel" | "partial_fill" | "full_fill" | "clear";
  sequence: number;
  timestamp: number;
  order_id?: string;
  taker_order_id?: string;
  side?: L3Side;
  price?: string;
  delta_size?: string;
  remaining_size?: string;
  trade_id?: number;
};

// Strike writes one price as "104.20" in a snapshot and "104.2" in an update, so levels are keyed by the number's shortest form.
export const keyOf = (price: string | number) => String(Number(price));

// The key for a price on a market with that tick, rounded to the nearest tick.
export const key = (price: number, tick: number) => keyOf((Math.round(price / tick) * tick).toFixed(decimalsOf(tick)));

const sideOf = (levels: RawLevel[]) => new Map(levels.map((l) => [keyOf(l.price), l.orders.map((o) => ({ id: o.order_id, size: Number(o.size) }))]));

export function fromSnapshot(snap: L3Snapshot): Book {
  return { symbol: snap.symbol, seq: snap.last_sequence, at: snap.timestamp, buy: sideOf(snap.bids), sell: sideOf(snap.asks) };
}

// One update, in place. An old one is passed over; a gap, a clear or an order the book doesn't hold means a new snapshot.
export function apply(book: Book, u: L3Update): "ok" | "stale" | "rebuild" {
  if (u.sequence <= book.seq) return "stale";
  if (u.sequence !== book.seq + 1 || u.action === "clear" || !u.order_id || !u.price || (u.side !== "buy" && u.side !== "sell")) return "rebuild";
  const levels = book[u.side];
  const at = keyOf(u.price);
  const queue = levels.get(at);
  const size = Number(u.remaining_size);
  if (u.action === "open") {
    if (!(size > 0)) return "rebuild";
    if (queue) queue.push({ id: u.order_id, size });
    else levels.set(at, [{ id: u.order_id, size }]);
  } else {
    const i = queue ? queue.findIndex((o) => o.id === u.order_id) : -1;
    if (!queue || i < 0) return "rebuild";
    const gone = u.action === "cancel" || u.action === "full_fill";
    if (!gone && u.action !== "partial_fill" && u.action !== "modify") return "rebuild";
    if (gone || !(size > 0)) {
      queue.splice(i, 1);
      if (!queue.length) levels.delete(at);
    } else queue[i].size = size;
  }
  book.seq = u.sequence;
  book.at = u.timestamp;
  return "ok";
}

// Best first: bids high to low, asks low to high.
export function levels(book: Book, side: L3Side, limit = Infinity): Level[] {
  return [...book[side]]
    .sort(([a], [b]) => (side === "buy" ? Number(b) - Number(a) : Number(a) - Number(b)))
    .slice(0, limit)
    .map(([at, orders]) => ({ key: at, price: Number(at), size: orders.reduce((sum, o) => sum + o.size, 0), orders }));
}

// A place in the queue at a price, taken as an order goes in: everything already resting there is ahead of it.
export type Place = { side: L3Side; price: string; ahead: Set<string>; size: number };

export function join(book: Book, side: L3Side, price: string): Place {
  const at = keyOf(price);
  const queue = book[side].get(at) ?? [];
  return { side, price: at, ahead: new Set(queue.map((o) => o.id)), size: queue.reduce((sum, o) => sum + o.size, 0) };
}

// What's still in front: only orders that were there on joining, at what's left of them. Later ones queue behind.
export function ahead(book: Book, place: Place): { orders: number; size: number } {
  let orders = 0;
  let size = 0;
  for (const o of book[place.side].get(place.price) ?? []) {
    if (!place.ahead.has(o.id)) continue;
    orders++;
    size += o.size;
  }
  return { orders, size };
}

export type L3Fill = { side: L3Side; price: string; size: number; at: number };

export type Tape = { fills: L3Fill[] };

const KEEP = 120_000;

export function record(tape: Tape, u: L3Update, now: number) {
  if ((u.action === "partial_fill" || u.action === "full_fill") && u.side && u.price) tape.fills.push({ side: u.side, price: keyOf(u.price), size: Math.abs(Number(u.delta_size)) || 0, at: now });
  const kept = tape.fills.findIndex((f) => f.at >= now - KEEP);
  if (kept < 0) tape.fills.length = 0;
  else if (kept > 0) tape.fills.splice(0, kept);
}

// How fast resting orders at a price are being filled, in the base asset per second.
export function pace(tape: Tape, side: L3Side, price: string, now: number, windowMs = 30_000): number {
  const at = keyOf(price);
  let size = 0;
  for (const f of tape.fills) if (f.side === side && f.price === at && f.at > now - windowMs) size += f.size;
  return size / (windowMs / 1000);
}
