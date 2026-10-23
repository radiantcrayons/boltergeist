import assert from "node:assert/strict";
import { test } from "node:test";
import type { Market } from "../types.ts";
import { caught, close, hit, lay, lift, open, plant, Refused, type Dealt, type Exchange, type Held, type Order } from "./desk.ts";

const BTC: Market = { symbol: "BTC-USD", base: "BTC", tickSize: 1, stepSize: 0.00001, minNotional: 10, tiers: [] };

type Resting = Order & { side: "buy" | "sell"; size: number; price: number; reduceOnly: boolean };

class FakeStrike implements Exchange {
  price = 100_000;
  sent: string[] = [];
  status = "filled";
  orders = new Map<string, Resting>();
  dealt = new Map<number, Dealt[]>();
  held: Held | null = null;
  ids = 0;

  async marginMode(symbol: string, mode: string) {
    this.sent.push(`marginMode ${symbol} ${mode}`);
  }
  async leverage(symbol: string, leverage: number) {
    this.sent.push(`leverage ${symbol} ${leverage}`);
  }
  async market(symbol: string, side: "buy" | "sell", size: string, clientId: string, reduceOnly: boolean) {
    this.sent.push(`market ${symbol} ${side} ${size}${reduceOnly ? " reduce-only" : ""}`);
    const o = this.add(clientId, side, Number(size), this.price, reduceOnly, this.status);
    if (this.status === "filled") this.fill(o, this.price, false);
  }
  async limit(symbol: string, side: "buy" | "sell", size: string, price: string, clientId: string, opts: { postOnly?: boolean; reduceOnly?: boolean }) {
    this.sent.push(`limit ${symbol} ${side} ${size} at ${price}${opts.postOnly ? " post-only" : ""}${opts.reduceOnly ? " reduce-only" : ""}`);
    const o = this.add(clientId, side, Number(size), Number(price), !!opts.reduceOnly, "open");
    if (side === "buy" ? o.price < this.price : o.price > this.price) return;
    if (opts.postOnly) o.Status = "canceled";
    else this.fill(o, this.price, false);
  }
  async cancel(_symbol: string, orderId: number) {
    this.sent.push(`cancel ${orderId}`);
    for (const o of this.orders.values()) if (o.ID === orderId && o.Status === "open") o.Status = "canceled";
  }
  async order(_symbol: string, clientId: string) {
    const o = this.orders.get(clientId);
    return o ? { ...o } : null;
  }
  async fills(_symbol: string, orderId: number) {
    return this.dealt.get(orderId) ?? [];
  }
  async position() {
    return this.held;
  }

  // The price trading to a level: the resting orders it goes through fill, as makers, all or part of each.
  trade(price: number, part = 1) {
    this.price = price;
    for (const o of this.orders.values()) if (o.Status === "open" && (o.side === "buy" ? price < o.price : price > o.price)) this.fill(o, o.price, true, part);
  }
  private add(clientId: string, side: "buy" | "sell", size: number, price: number, reduceOnly: boolean, Status: string): Resting {
    const o = { ID: ++this.ids, Status, Filled: "0", Price: String(price), side, size, price, reduceOnly };
    this.orders.set(clientId, o);
    return o;
  }
  private fill(o: Resting, at: number, maker: boolean, part = 1) {
    const size = o.size * part;
    Object.assign(o, { Filled: String(size), Status: part < 1 ? "open" : "filled", EventTimestamp: 1234 });
    this.dealt.set(o.ID, [...(this.dealt.get(o.ID) ?? []), { price: at, size, fee: size * at * (maker ? -0.00005 : 0.0005), maker, at: 1234 }]);
    if (!o.reduceOnly) this.held = { side: o.side === "buy" ? "long" : "short", size, entry: at, koAt: at * (o.side === "buy" ? 0.9 : 1.1), iso: 50, upnl: 0 };
    else if (this.held && this.held.size - size > 1e-12) this.held = { ...this.held, size: this.held.size - size };
    else this.held = null;
  }
}

const call = { market: BTC, mark: 100_000, side: "long" as const, stake: 50, power: 10, clientId: "tw-1", feeRate: 0.0005 };

test("a live call goes in isolated, at its power, all of its stake's worth at the market, where Strike says", async () => {
  const strike = new FakeStrike();
  const fill = await open(strike, call, 1);
  assert.deepEqual(strike.sent, ["marginMode BTC-USD isolated", "leverage BTC-USD 10", "market BTC-USD buy 0.00500"]);
  assert.equal(fill.entry, 100_000);
  assert.equal(fill.koAt, 90_000);
  assert.equal(fill.size, 0.005);
  assert.equal(fill.live, "tw-1");
});

test("a live call is refused when it's under Strike's smallest order or the market's already held", async () => {
  const strike = new FakeStrike();
  await assert.rejects(open(strike, { ...call, stake: 5, power: 1 }, 1), Refused);
  strike.held = { side: "long", size: 1, entry: 1, koAt: 0, iso: 1, upnl: 0 };
  await assert.rejects(open(strike, call, 1), /already hold/);
  assert.deepEqual(strike.sent, []);
});

test("an order Strike rejects is reported, not taken for a fill", async () => {
  const strike = new FakeStrike();
  strike.status = "rejected";
  await assert.rejects(open(strike, call, 1), /rejected/);
});

test("banking closes reduce-only and comes out with Strike's margin and profit, less the fee", async () => {
  const strike = new FakeStrike();
  const fill = await open(strike, call, 1);
  strike.held = { ...strike.held!, upnl: 10 };
  const out = await close(strike, { market: BTC, mark: 102_000, live: fill.live, feeRate: 0.0005, estimate: 0 }, 1);
  assert.notEqual(out, "gone");
  if (out === "gone") return;
  assert.equal(out.price, 102_000);
  assert.ok(Math.abs(out.value - (50 + 10 - 0.005 * 102_000 * 0.0005)) < 1e-9);
  assert.equal(strike.sent.at(-1), "market BTC-USD sell 0.00500 reduce-only");
  assert.equal(strike.held, null);
});

test("a position that's gone when banking was liquidated", async () => {
  const strike = new FakeStrike();
  const fill = await open(strike, call, 1);
  strike.held = null;
  assert.equal(await close(strike, { market: BTC, mark: 89_000, live: fill.live, feeRate: 0.0005, estimate: 0 }, 1), "gone");
});

const trap = { market: BTC, side: "long" as const, stake: 50, power: 10, price: 99_123.4, clientId: "tw-trap" };

test("a trap rests on Strike as a post-only limit order, on a tick away from the price, isolated at its power", async () => {
  const strike = new FakeStrike();
  const long = await lay(strike, trap, 1);
  assert.deepEqual(strike.sent, ["marginMode BTC-USD isolated", "leverage BTC-USD 10", "limit BTC-USD buy 0.00504 at 99123 post-only"]);
  assert.deepEqual(long, { live: "tw-trap", price: 99_123, size: 0.00504 });
  const short = await lay(new FakeStrike(), { ...trap, side: "short", price: 100_876.2 }, 1);
  assert.equal(short.price, 100_877);
  assert.equal(strike.held, null);
});

test("a trap the price is already through is turned away rather than filled as a taker", async () => {
  const strike = new FakeStrike();
  await assert.rejects(lay(strike, { ...trap, price: 100_500 }, 1), /turned the ambush away/);
  assert.equal(strike.held, null);
  strike.held = { side: "long", size: 1, entry: 1, koAt: 0, iso: 1, upnl: 0 };
  await assert.rejects(lay(strike, trap, 1), /already hold/);
});

test("a trap springs when the price trades through it: in at its price as a maker, with Strike's rebate", async () => {
  const strike = new FakeStrike();
  await lay(strike, trap, 1);
  assert.equal(await caught(strike, BTC, "tw-trap", -0.00005, 1), null);
  strike.trade(99_500);
  assert.equal(await caught(strike, BTC, "tw-trap", -0.00005, 1), null);
  strike.trade(99_000);
  const fill = await caught(strike, BTC, "tw-trap", -0.00005, 1);
  assert.ok(fill && fill !== "gone");
  assert.equal(fill.entry, 99_123);
  assert.equal(fill.size, 0.00504);
  assert.ok(fill.fee < 0);
  assert.equal(fill.koAt, 99_123 * 0.9);
  assert.equal(fill.at, 1234);
});

test("a trap that partly fills has the rest taken off, and the call is what filled", async () => {
  const strike = new FakeStrike();
  await lay(strike, trap, 1);
  strike.trade(99_000, 0.5);
  const fill = await caught(strike, BTC, "tw-trap", -0.00005, 1);
  assert.ok(fill && fill !== "gone");
  assert.equal(fill.size, 0.00252);
  assert.equal(strike.sent.at(-1), "cancel 1");
  assert.equal(strike.orders.get("tw-trap")!.Status, "canceled");
});

test("pulling a trap takes it off Strike, unless it filled first, and one Strike took off itself is gone", async () => {
  const strike = new FakeStrike();
  await lay(strike, trap, 1);
  const pulled = await lift(strike, "BTC-USD", "tw-trap", 1);
  assert.equal(pulled?.Status, "canceled");
  assert.equal(await caught(strike, BTC, "tw-trap", -0.00005, 1), "gone");
  await lay(strike, { ...trap, clientId: "tw-trap-2" }, 1);
  strike.trade(99_000);
  const late = await lift(strike, "BTC-USD", "tw-trap-2", 1);
  assert.equal(late?.Status, "filled");
  assert.equal(strike.sent.filter((x) => x.startsWith("cancel")).length, 1);
});

test("a flag rests reduce-only past the price and banks the whole position when the price trades through it", async () => {
  const strike = new FakeStrike();
  await open(strike, call, 1);
  const flag = await plant(strike, { market: BTC, price: 101_000.4, clientId: "tw-flag" }, 1);
  assert.equal(flag.price, 101_001);
  assert.equal(strike.sent.at(-1), "limit BTC-USD sell 0.00500 at 101001 reduce-only");
  assert.equal(await hit(strike, "BTC-USD", "tw-flag"), null);
  strike.trade(101_200);
  const out = await hit(strike, "BTC-USD", "tw-flag");
  assert.ok(out && out !== "gone");
  assert.equal(out.price, 101_001);
  assert.equal(out.at, 1234);
  assert.ok(out.fee! < 0);
  assert.equal(strike.held, null);
});

test("a flag the price is already past banks at once, at that price or better, and there's no flag without a position", async () => {
  const strike = new FakeStrike();
  await assert.rejects(plant(strike, { market: BTC, price: 101_000, clientId: "tw-flag" }, 1), /no position/);
  await open(strike, call, 1);
  strike.price = 102_000;
  await plant(strike, { market: BTC, price: 101_000, clientId: "tw-flag" }, 1);
  const out = await hit(strike, "BTC-USD", "tw-flag");
  assert.ok(out && out !== "gone");
  assert.equal(out.price, 102_000);
  assert.ok(out.fee! > 0);
  assert.equal(strike.held, null);
});
