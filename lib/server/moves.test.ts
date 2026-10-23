import assert from "node:assert/strict";
import { test } from "node:test";
import { CAP, rule, type Prices, type State } from "./moves.ts";

const MARK = 100;
// Strike's price, the lows and highs it's seen since, its price step and the most power the market allows, as the game would ask.
const prices = (mark = MARK, seen: { low?: number; high?: number } = {}, most = 100): Prices => ({
  mark: async () => mark,
  tick: async () => 0.01,
  most: async () => most,
  edge: async () => undefined,
  reached: async (way, price) => (way === "down" ? Math.min(mark, seen.low ?? mark) <= price : Math.max(mark, seen.high ?? mark) >= price),
});
const fresh: State = { n: 0, lastAt: 0 };
const go = (was: State, body: Record<string, unknown>, p = prices(), now = 1000) => rule("battle", was, body, now, p);

test("a call goes in at Strike's price, whatever the player says it was, and nothing they say about Strike is kept", async () => {
  const { move, state } = await go(fresh, { what: "call", side: "long", power: 50, entry: 99, koAt: 0.001, fee: 0, live: true });
  assert.deepEqual(move, { what: "call", side: "long", power: 50, entry: MARK, live: true });
  assert.deepEqual(state.call, { side: "long", power: 50, price: MARK, at: 1000 });
  assert.equal(state.n, 1);
  await assert.rejects(go(state, { what: "call", side: "short", power: 5 }), /in already/);
  await assert.rejects(go(fresh, { what: "call", side: "long", power: 500 }), /power/);
  await assert.rejects(go(fresh, { what: "call", side: "up", power: 5 }), /Long or short/);
});

test("a bank needs a call, goes out at Strike's price, and takes no value from the player", async () => {
  await assert.rejects(go(fresh, { what: "bank", price: 150 }), /Nothing to give up/);
  const { state } = await go(fresh, { what: "call", side: "long", power: 10 });
  const { move, state: after } = await go(state, { what: "bank", price: 150, value: 1e6, live: true }, prices(101));
  assert.deepEqual(move, { what: "bank", price: 101 });
  assert.equal(after.call, undefined);
});

test("graves go on the right side of the price and within reach, and a fill is at their own price once the price has been there", async () => {
  await assert.rejects(go(fresh, { what: "trap", side: "long", power: 10, price: 105 }), /below the price/);
  await assert.rejects(go(fresh, { what: "trap", side: "short", power: 10, price: 95 }), /above the price/);
  await assert.rejects(go(fresh, { what: "trap", side: "long", power: 10, price: 70 }), /too far/);
  await assert.rejects(go(fresh, { what: "trap", side: "long", power: 10, price: 95, flag: 90 }), /past the graves/);
  const { move, state } = await go(fresh, { what: "trap", side: "long", power: 10, price: 81, flag: 102 });
  assert.deepEqual(move, { what: "trap", side: "long", power: 10, price: 81, flag: 102 });
  // Dug far below the price and claimed at once: the price never went there.
  await assert.rejects(go(state, { what: "fill", price: 100 }), /hasn't reached/);
  const filled = await go(state, { what: "fill", price: 100 }, prices(100, { low: 80.99 }), 2000);
  assert.deepEqual(filled.move, { what: "fill", price: 81 });
  assert.deepEqual(filled.state.call, { side: "long", power: 10, price: 81, at: 2000, flag: 102, flagAt: 1000 });
  assert.equal(filled.state.trap, undefined);
  await assert.rejects(go(fresh, { what: "fill", price: 100 }), /No graves/);
});

test("a bank at the thundercloud takes its price only when the price got there, and Strike's price when not", async () => {
  let s = (await go(fresh, { what: "call", side: "short", power: 10 })).state;
  s = (await go(s, { what: "flag", price: 95 })).state;
  const early = await go(s, { what: "bank", price: 95, flag: 95 }, prices(99));
  assert.deepEqual(early.move, { what: "bank", price: 99 });
  const hit = await go(s, { what: "bank", price: 95, flag: 95 }, prices(97, { low: 94.9 }));
  assert.deepEqual(hit.move, { what: "bank", price: 95, flag: 95 });
  const other = await go(s, { what: "bank", price: 90, flag: 90 }, prices(89));
  assert.deepEqual(other.move, { what: "bank", price: 89 });
});

test("a thundercloud goes past the price for a call and past the graves for a trap, and clears with no price", async () => {
  await assert.rejects(go(fresh, { what: "flag", price: 105 }), /Nothing to summon/);
  const called = (await go(fresh, { what: "call", side: "long", power: 10 })).state;
  await assert.rejects(go(called, { what: "flag", price: 98 }), /past the price/);
  const flagged = await go(called, { what: "flag", price: 104 }, prices(), 3000);
  assert.deepEqual(flagged.state.call, { side: "long", power: 10, price: MARK, at: 1000, flag: 104, flagAt: 3000 });
  const cleared = await go(flagged.state, { what: "flag" });
  assert.equal(cleared.state.call!.flag, undefined);
  const trapped = (await go(fresh, { what: "trap", side: "short", power: 10, price: 103 })).state;
  await assert.rejects(go(trapped, { what: "flag", price: 104 }), /past the price/);
  assert.equal((await go(trapped, { what: "flag", price: 101 })).state.trap!.flag, 101);
});

test("pulls need graves, a K.O. puts a player out for good, and every move counts to a cap", async () => {
  await assert.rejects(go(fresh, { what: "pull" }), /No graves/);
  const called = (await go(fresh, { what: "call", side: "long", power: 10 })).state;
  const out = (await go(called, { what: "ko", price: 90 })).state;
  assert.ok(out.out);
  await assert.rejects(go(out, { what: "call", side: "long", power: 10 }), /out of this game/);
  await assert.rejects(go({ n: CAP.battle, lastAt: 0 }, { what: "call", side: "long", power: 10 }), /all the moves/);
  await assert.rejects(go(fresh, { what: "dance" }), /Call, graves/);
});

test("graves and thunderclouds go a tick or more past the price, and only fill or strike once the price really gets there", async () => {
  // At a price that never moves, a hair either side of it earns nothing.
  await assert.rejects(go(fresh, { what: "trap", side: "long", power: 100, price: 99.995 }), /below the price/);
  await assert.rejects(go(fresh, { what: "trap", side: "short", power: 100, price: 100.005 }), /above the price/);
  const trap = await go(fresh, { what: "trap", side: "long", power: 100, price: 99.9501 });
  await assert.rejects(go(trap.state, { what: "fill", price: 99.9501 }), /hasn't reached/);
  const called = (await go(fresh, { what: "call", side: "long", power: 100 })).state;
  await assert.rejects(go(called, { what: "flag", price: 100.005 }), /past the price/);
  const clouded = (await go(called, { what: "flag", price: 100.0499 })).state;
  const out = await go(clouded, { what: "bank", flag: 100.0499 });
  assert.deepEqual(out.move, { what: "bank", price: MARK });
});

test("power stays within what the market allows", async () => {
  await assert.rejects(go(fresh, { what: "call", side: "long", power: 50 }, prices(MARK, {}, 25)), /25x/);
  await assert.rejects(go(fresh, { what: "trap", side: "long", power: 26, price: 99 }, prices(MARK, {}, 25)), /25x/);
  assert.equal((await go(fresh, { what: "call", side: "long", power: 25 }, prices(MARK, {}, 25))).move.power, 25);
});
