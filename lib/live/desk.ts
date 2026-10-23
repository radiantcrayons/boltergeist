import type { Market } from "../types.ts";
import type { Fill } from "../game/war.ts";

export type Side = "long" | "short";

export type Held = { side: Side; size: number; entry: number; koAt: number; iso: number; upnl: number };

export type Order = { ID: number; Status: string; Filled?: string; Price?: string; EventTimestamp?: number; CloseReason?: string };

export type Dealt = { price: number; size: number; fee: number; maker: boolean; at: number };

export interface Exchange {
  marginMode(symbol: string, mode: "isolated" | "cross"): Promise<unknown>;
  leverage(symbol: string, leverage: number): Promise<unknown>;
  market(symbol: string, side: "buy" | "sell", size: string, clientId: string, reduceOnly: boolean): Promise<unknown>;
  limit(symbol: string, side: "buy" | "sell", size: string, price: string, clientId: string, opts: { postOnly?: boolean; reduceOnly?: boolean }): Promise<unknown>;
  cancel(symbol: string, orderId: number): Promise<unknown>;
  order(symbol: string, clientId: string): Promise<Order | null>;
  fills(symbol: string, orderId: number): Promise<Dealt[]>;
  position(symbol: string): Promise<Held | null>;
}

export class Refused extends Error {}

const decimals = (step: number) => Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const GONE = ["canceled", "rejected", "expired"];
// Why Strike turned an order away, in words: its own reason code, or the status when it gives none.
const REASONS: Record<string, string> = {
  order_would_match_immediately: "Strike's order book already has orders past that price, so it would trade at once: set it further from the price",
  insufficient_balance: "there isn't enough in your Strike account for it",
  order_less_than_min_size: "it's under Strike's smallest order: add power",
};
export const why = (o: Order) => {
  const code = o.CloseReason?.trim();
  if (code) return REASONS[code] ?? code.replace(/_/g, " ");
  return o.Status === "canceled" ? "Strike cancelled it" : `Strike ${o.Status} it`;
};
export const filledOf = (o: Order | null) => Number(o?.Filled) || 0;
// On one of the market's ticks, rounded away from the price, so a trap or flag can't land on the wrong side of where it was set.
const onTick = (price: number, tick: number, up: boolean) => {
  const n = price / tick;
  return Number(((up ? Math.ceil(n - 1e-9) : Math.floor(n + 1e-9)) * tick).toFixed(decimals(tick)));
};

function sized(market: Market, stake: number, power: number, price: number): number {
  const step = market.stepSize;
  const size = Math.floor((stake * power) / price / step + 1e-9) * step;
  const least = Math.max(market.minNotional, 10);
  if (size * price < least) throw new Refused(`That's a $${(size * price).toFixed(2)} order and Strike's smallest is $${least}: add power`);
  return size;
}

export async function filled(ex: Exchange, symbol: string, clientId: string, waitMs = 400): Promise<void> {
  for (let i = 0; i < 25; i++) {
    const order = await ex.order(symbol, clientId);
    if (order?.Status === "filled") return;
    if (order && GONE.includes(order.Status)) throw new Refused(`Strike turned the order away: ${why(order)}`);
    await sleep(waitMs);
  }
  throw new Error("Strike hasn't filled the order yet: check your position on Strike");
}

async function heldNow(ex: Exchange, symbol: string, waitMs: number): Promise<Held | null> {
  for (let i = 0; i < 6; i++) {
    const held = await ex.position(symbol);
    if (held) return held;
    await sleep(waitMs);
  }
  return null;
}

// A market order Strike is slow to show as filled. Whatever is still resting comes off, and then what Strike holds is what happened: a
// position on the call's side is the call, all of it or the part that filled. Only with nothing held does the call fail.
async function landed(ex: Exchange, symbol: string, clientId: string, side: Side, waitMs: number): Promise<Held | null> {
  try {
    await filled(ex, symbol, clientId, waitMs);
  } catch (err) {
    if (err instanceof Refused) throw err;
    await lift(ex, symbol, clientId, waitMs).catch(() => null);
    const held = await heldNow(ex, symbol, waitMs).catch(() => null);
    if (held?.side === side) return held;
    throw err;
  }
  return heldNow(ex, symbol, waitMs);
}

async function ready(ex: Exchange, market: Market, power: number) {
  if (await ex.position(market.symbol)) throw new Refused(`You already hold a ${market.base} position: close it on Strike first`);
  await ex.marginMode(market.symbol, "isolated").catch(() => {});
  await ex.leverage(market.symbol, power);
}

export async function open(
  ex: Exchange,
  call: { market: Market; mark: number; side: Side; stake: number; power: number; clientId: string; feeRate: number },
  waitMs = 400,
): Promise<{ entry: number; fee: number; koAt: number; live: string; size: number }> {
  const { market, mark, side, stake, power, clientId, feeRate } = call;
  const size = sized(market, stake, power, mark);
  await ready(ex, market, power);
  await ex.market(market.symbol, side === "long" ? "buy" : "sell", size.toFixed(decimals(market.stepSize)), clientId, false);
  const held = await landed(ex, market.symbol, clientId, side, waitMs);
  const entry = held?.entry || mark;
  const got = held?.size || size;
  return { entry, fee: got * entry * feeRate, koAt: held?.koAt || entry * (1 - (side === "long" ? 1 : -1) / power), live: clientId, size: got };
}

export async function close(
  ex: Exchange,
  call: { market: Market; mark: number; live: string; feeRate: number; estimate: number },
  waitMs = 400,
): Promise<{ price: number; value: number; made: number } | "gone"> {
  const { market, mark, live, feeRate, estimate } = call;
  const held = await ex.position(market.symbol);
  if (!held) return "gone";
  const value = held.iso > 0 ? Math.max(0, held.iso + held.upnl - held.size * mark * feeRate) : estimate;
  const clientId = `${live}-x`;
  await ex.market(market.symbol, held.side === "long" ? "sell" : "buy", held.size.toFixed(decimals(market.stepSize)), clientId, true);
  try {
    await filled(ex, market.symbol, clientId, waitMs);
  } catch (err) {
    // Slow to show as filled: banked if Strike no longer holds the position.
    if (err instanceof Refused) throw err;
    await lift(ex, market.symbol, clientId, waitMs).catch(() => null);
    if (await ex.position(market.symbol).catch(() => held)) throw err;
  }
  return { price: mark, value, made: held.upnl - held.size * mark * feeRate };
}

// An order Strike has taken in: resting, filled or turned away.
async function placed(ex: Exchange, symbol: string, clientId: string, waitMs: number): Promise<Order> {
  for (let i = 0; i < 25; i++) {
    const o = await ex.order(symbol, clientId);
    if (o && o.Status !== "pending" && o.Status !== "none") return o;
    await sleep(waitMs);
  }
  throw new Error("Strike hasn't placed the order yet: check your orders on Strike");
}

// Setting a trap: a post-only limit order, isolated at its power, resting below the price for a long and above it for a short.
export async function lay(
  ex: Exchange,
  trap: { market: Market; side: Side; stake: number; power: number; price: number; clientId: string },
  waitMs = 400,
): Promise<{ live: string; price: number; size: number }> {
  const { market, side, stake, power, clientId } = trap;
  const buy = side === "long";
  const price = onTick(trap.price, market.tickSize, !buy);
  const size = sized(market, stake, power, price);
  await ready(ex, market, power);
  await ex.limit(market.symbol, buy ? "buy" : "sell", size.toFixed(decimals(market.stepSize)), price.toFixed(decimals(market.tickSize)), clientId, { postOnly: true });
  const o = await placed(ex, market.symbol, clientId, waitMs);
  if (GONE.includes(o.Status) && !filledOf(o)) throw new Refused(`Strike turned your graves away: ${why(o)}`);
  return { live: clientId, price, size };
}

// Taking a trap or a flag off Strike. What filled of it first stands, so it comes back as it ended.
export async function lift(ex: Exchange, symbol: string, clientId: string, waitMs = 400): Promise<Order | null> {
  let o = await ex.order(symbol, clientId);
  let asked = false;
  for (let i = 0; o && !GONE.includes(o.Status) && o.Status !== "filled"; i++) {
    if (i >= 25) throw new Error("Strike hasn't taken the order off yet: check your orders on Strike");
    if (!asked && o.Status !== "pending") {
      asked = true;
      await ex.cancel(symbol, o.ID).catch(() => {});
    }
    await sleep(waitMs);
    o = await ex.order(symbol, clientId);
  }
  return o;
}

// Whether a trap has sprung on Strike. Once any of it fills the rest comes off, and the call is what Strike holds.
export async function caught(ex: Exchange, market: Market, clientId: string, makerRate: number, waitMs = 400): Promise<(Fill & { at: number }) | "gone" | null> {
  let o = await ex.order(market.symbol, clientId);
  if (!o || !filledOf(o)) return o && GONE.includes(o.Status) ? "gone" : null;
  if (o.Status !== "filled") o = (await lift(ex, market.symbol, clientId, waitMs)) ?? o;
  const held = await heldNow(ex, market.symbol, waitMs);
  const dealt = await ex.fills(market.symbol, o.ID).catch(() => [] as Dealt[]);
  const size = held?.size ?? filledOf(o);
  const entry = held?.entry || Number(o.Price);
  return {
    entry,
    size,
    live: clientId,
    fee: dealt.length ? dealt.reduce((sum, d) => sum + d.fee, 0) : size * entry * makerRate,
    koAt: held?.koAt ?? 0,
    at: Math.max(0, ...dealt.map((d) => d.at)) || o.EventTimestamp || Date.now(),
  };
}

// Planting a flag: a reduce-only limit order to bank all of the position at that price, or better if it's already past it.
export async function plant(ex: Exchange, flag: { market: Market; price: number; clientId: string }, waitMs = 400): Promise<{ live: string; price: number }> {
  const { market, clientId } = flag;
  const held = await ex.position(market.symbol);
  if (!held) throw new Refused("There's no position on Strike to plant a flag on");
  const sell = held.side === "long";
  const price = onTick(flag.price, market.tickSize, sell);
  await ex.limit(market.symbol, sell ? "sell" : "buy", held.size.toFixed(decimals(market.stepSize)), price.toFixed(decimals(market.tickSize)), clientId, { reduceOnly: true });
  const o = await placed(ex, market.symbol, clientId, waitMs);
  if (GONE.includes(o.Status) && !filledOf(o)) throw new Refused(`Strike turned your thundercloud away: ${why(o)}`);
  return { live: clientId, price };
}

// Whether a flag has banked on Strike: all of it filled, at what price on average, and for what fee.
export async function hit(ex: Exchange, symbol: string, clientId: string): Promise<{ price: number; at: number; fee?: number } | "gone" | null> {
  const o = await ex.order(symbol, clientId);
  if (!o || o.Status !== "filled") return o && GONE.includes(o.Status) ? "gone" : null;
  const dealt = await ex.fills(symbol, o.ID).catch(() => [] as Dealt[]);
  const size = dealt.reduce((sum, d) => sum + d.size, 0);
  return {
    price: size ? dealt.reduce((sum, d) => sum + d.price * d.size, 0) / size : Number(o.Price),
    at: Math.max(0, ...dealt.map((d) => d.at)) || o.EventTimestamp || Date.now(),
    ...(size > 0 && { fee: dealt.reduce((sum, d) => sum + d.fee, 0) }),
  };
}
