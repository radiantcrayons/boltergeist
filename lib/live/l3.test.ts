import assert from "node:assert/strict";
import { test } from "node:test";
import { ahead, apply, fromSnapshot, join, key, keyOf, levels, pace, record, type Book, type L3Side, type L3Snapshot, type L3Update, type Tape } from "./l3.ts";

const SNAP: L3Snapshot = {
  type: "l3_snapshot",
  symbol: "SOL-USD",
  last_sequence: 100,
  timestamp: 1_000,
  bids: [
    { price: "103.50", orders: [{ order_id: "a", size: "9.66" }, { order_id: "b", size: "28.98" }] },
    { price: "103.49", orders: [{ order_id: "c", size: "5" }] },
  ],
  asks: [
    { price: "103.53", orders: [{ order_id: "d", size: "1.5" }] },
    { price: "103.60", orders: [{ order_id: "e", size: "2" }] },
  ],
};

const ids = (book: Book, side: L3Side, price: string) => (book[side].get(keyOf(price)) ?? []).map((o) => o.id);

let seq = 100;
const fresh = () => {
  seq = 100;
  return fromSnapshot(SNAP);
};
const next = (action: L3Update["action"], order_id: string, side: L3Side, price: string, remaining: number, delta: number): L3Update => ({
  type: "l3_update",
  symbol: "SOL-USD",
  action,
  order_id,
  side,
  price,
  delta_size: String(delta),
  remaining_size: String(remaining),
  sequence: ++seq,
  timestamp: 1_000 + seq,
});

test("a snapshot comes in as each side's levels by price key, orders in queue order, at its sequence", () => {
  const book = fresh();
  assert.equal(book.symbol, "SOL-USD");
  assert.equal(book.seq, 100);
  assert.deepEqual([...book.buy.keys()], ["103.5", "103.49"]);
  assert.deepEqual(book.buy.get("103.5"), [
    { id: "a", size: 9.66 },
    { id: "b", size: 28.98 },
  ]);
  assert.deepEqual(book.sell.get("103.53"), [{ id: "d", size: 1.5 }]);
});

test("a new order joins the back of the queue at its price, or starts a level", () => {
  const book = fresh();
  assert.equal(apply(book, next("open", "f", "buy", "103.50", 3, 3)), "ok");
  assert.deepEqual(ids(book, "buy", "103.50"), ["a", "b", "f"]);
  assert.equal(apply(book, next("open", "g", "sell", "103.52", 4, 4)), "ok");
  assert.deepEqual(book.sell.get("103.52"), [{ id: "g", size: 4 }]);
  assert.equal(book.seq, 102);
  assert.equal(book.at, 1_102);
});

test("a partial fill or a modify cuts an order down where it stands", () => {
  const book = fresh();
  assert.equal(apply(book, next("partial_fill", "a", "buy", "103.50", 4.66, -5)), "ok");
  assert.deepEqual(book.buy.get("103.5"), [
    { id: "a", size: 4.66 },
    { id: "b", size: 28.98 },
  ]);
  assert.equal(apply(book, next("modify", "b", "buy", "103.50", 20, -8.98)), "ok");
  assert.deepEqual(ids(book, "buy", "103.50"), ["a", "b"]);
  assert.equal(book.buy.get("103.5")![1].size, 20);
});

test("a cancel or a full fill takes the order off, and an empty level goes with it", () => {
  const book = fresh();
  assert.equal(apply(book, next("cancel", "a", "buy", "103.50", 0, -9.66)), "ok");
  assert.deepEqual(ids(book, "buy", "103.50"), ["b"]);
  assert.equal(apply(book, next("full_fill", "d", "sell", "103.53", 0, -1.5)), "ok");
  assert.equal(book.sell.has("103.53"), false);
});

test("an update the book already holds is passed over", () => {
  const book = fresh();
  const old = { ...next("cancel", "a", "buy", "103.50", 0, -9.66), sequence: 100 };
  assert.equal(apply(book, old), "stale");
  assert.equal(apply(book, { ...old, sequence: 42 }), "stale");
  assert.deepEqual(ids(book, "buy", "103.50"), ["a", "b"]);
  assert.equal(book.seq, 100);
});

test("a gap, a clear or an order the book doesn't hold means a new snapshot, and nothing changes", () => {
  const book = fresh();
  assert.equal(apply(book, { ...next("cancel", "a", "buy", "103.50", 0, -9.66), sequence: 102 }), "rebuild");
  assert.equal(apply(book, { type: "l3_update", symbol: "SOL-USD", action: "clear", sequence: 101, timestamp: 2_000 }), "rebuild");
  assert.equal(apply(book, { ...next("cancel", "zz", "buy", "103.50", 0, -1), sequence: 101 }), "rebuild");
  assert.equal(apply(book, { ...next("full_fill", "a", "sell", "103.50", 0, -1), sequence: 101 }), "rebuild");
  assert.deepEqual(ids(book, "buy", "103.50"), ["a", "b"]);
  assert.equal(book.seq, 100);
});

test("levels come best first with their sizes, bids high to low and asks low to high", () => {
  const book = fresh();
  apply(book, next("open", "f", "buy", "103.51", 1, 1));
  apply(book, next("open", "g", "sell", "103.55", 1, 1));
  assert.deepEqual(
    levels(book, "buy").map((l) => l.key),
    ["103.51", "103.5", "103.49"],
  );
  assert.deepEqual(
    levels(book, "sell").map((l) => l.price),
    [103.53, 103.55, 103.6],
  );
  const [top] = levels(book, "buy", 1);
  assert.equal(levels(book, "buy", 2).length, 2);
  assert.deepEqual(top, { key: "103.51", price: 103.51, size: 1, orders: [{ id: "f", size: 1 }] });
  assert.ok(Math.abs(levels(book, "buy")[1].size - 38.64) < 1e-9);
});

test("a place in the queue has what was resting there ahead of it, shrinking as those fill or cancel, never what joins later", () => {
  const book = fresh();
  const place = join(book, "buy", "103.50");
  assert.deepEqual([...place.ahead], ["a", "b"]);
  assert.ok(Math.abs(place.size - 38.64) < 1e-9);
  apply(book, next("open", "late", "buy", "103.50", 50, 50));
  assert.deepEqual(ahead(book, place), { orders: 2, size: 9.66 + 28.98 });
  apply(book, next("partial_fill", "a", "buy", "103.50", 1.66, -8));
  assert.deepEqual(ahead(book, place), { orders: 2, size: 1.66 + 28.98 });
  apply(book, next("full_fill", "a", "buy", "103.50", 0, -1.66));
  apply(book, next("cancel", "b", "buy", "103.50", 0, -28.98));
  assert.deepEqual(ahead(book, place), { orders: 0, size: 0 });
  assert.deepEqual(ids(book, "buy", "103.50"), ["late"]);
  assert.deepEqual(ahead(book, join(book, "sell", "104.00")), { orders: 0, size: 0 });
});

test("pace is what's been filled at a price on a side, per second, over the window, and the tape keeps two minutes", () => {
  const book = fresh();
  const tape: Tape = { fills: [] };
  const take = (u: L3Update, now: number) => {
    apply(book, u);
    record(tape, u, now);
  };
  take(next("partial_fill", "a", "buy", "103.50", 6.66, -3), 1_000);
  take(next("open", "f", "buy", "103.50", 1, 1), 10_000);
  take(next("full_fill", "d", "sell", "103.53", 0, -1.5), 20_000);
  take(next("partial_fill", "b", "buy", "103.50", 22.98, -6), 25_000);
  assert.equal(tape.fills.length, 3);
  assert.equal(pace(tape, "buy", "103.50", 30_000, 30_000), 9 / 30);
  assert.equal(pace(tape, "buy", "103.50", 30_000, 10_000), 6 / 10);
  assert.equal(pace(tape, "sell", "103.53", 30_000, 30_000), 1.5 / 30);
  assert.equal(pace(tape, "sell", "103.50", 30_000), 0);
  record(tape, next("cancel", "c", "buy", "103.49", 0, -5), 122_000);
  assert.deepEqual(
    tape.fills.map((f) => f.at),
    [20_000, 25_000],
  );
  record(tape, next("cancel", "f", "buy", "103.50", 0, -1), 500_000);
  assert.equal(tape.fills.length, 0);
});

test("a price Strike writes two ways, padded in a snapshot and trimmed in an update, is one level", () => {
  const book = fresh();
  assert.equal(apply(book, next("cancel", "a", "buy", "103.5", 0, -9.66)), "ok");
  assert.equal(apply(book, next("open", "f", "sell", "103.6", 1, 1)), "ok");
  assert.deepEqual(ids(book, "sell", "103.60"), ["e", "f"]);
  assert.deepEqual(join(book, "buy", "103.50"), join(book, "buy", "103.5"));
  assert.equal(levels(book, "sell").length, 2);
});

test("a price's key is the same whichever way it's written, and a number lands on its market's nearest tick", () => {
  assert.equal(keyOf("104.20"), keyOf("104.2"));
  assert.equal(keyOf("2394.0"), "2394");
  assert.equal(keyOf("77.280"), "77.28");
  assert.equal(key(103.49, 0.01), "103.49");
  assert.equal(key(103.5, 0.01), keyOf("103.50"));
  assert.equal(key(2384, 0.1), keyOf("2384.0"));
  assert.equal(key(1.3066, 0.0001), "1.3066");
  assert.equal(key(81283.4, 1), "81283");
  assert.equal(key(77.2804, 0.001), keyOf("77.280"));
  assert.equal(key(0.1 + 0.2, 0.1), "0.3");
});
