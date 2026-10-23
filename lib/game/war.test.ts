import assert from "node:assert/strict";
import { test } from "node:test";
import { candlesFrom, withTick } from "./ticks.ts";
import {
  advance,
  arenaAt,
  arenaOf,
  bank,
  breakEven,
  call,
  canCall,
  canFlag,
  canTrap,
  catchUp,
  doorsOpen,
  enter,
  flagHit,
  foughtIn,
  gain,
  GRACE,
  heed,
  hurdle,
  KINDS,
  knockedOut,
  leastPower,
  lineup,
  moveOf,
  opening,
  plantFlag,
  pullTrap,
  roundEnds,
  rulesFor,
  sameGame,
  setTrap,
  settle,
  SHARDS,
  shardOf,
  standingCount,
  STRIKE,
  standings,
  trapped,
  valueOf,
  worth,
  YOU,
  type Arena,
  type Game,
  type Kind,
  type Log,
} from "./war.ts";

const now = 1_000_000_000_000;
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} is not ${b}`);
const arena = (kind: Kind = "battle", startsAt = now): Arena => ({ id: `${kind}-test`, kind, symbol: "BTC-USD", opensAt: startsAt - KINDS[kind].every, startsAt, endsAt: startsAt + KINDS[kind].ms });
const quiet = (): Game => {
  const g = enter(arena(), "commando", 100, now);
  return { ...g, fighters: g.fighters.map((f) => (f.nerve ? { ...f, nerve: { ...f.nerve, nextAt: Infinity } } : f)) };
};
const me = (g: Game) => g.fighters.find((f) => f.id === YOU)!;
const at = (p: number) => ({ h: p, l: p, c: p });

test("a call pays the taker fee each way and is knocked out where its margin runs out", () => {
  const c = opening("long", 10, 100, 50, now);
  near(c.fee, 0.25);
  near(c.koAt, 90.05 / 0.995);
  near(valueOf(c, 105), 50 - 0.25 + 25 - 5 * 105 * 0.0005);
  assert.equal(valueOf(c, 80), 0);
  const s = opening("short", 4, 100, 50, now);
  near(s.koAt, (100 + 49.9 / 2) / 1.005);
});

test("a call goes all in at no less than the round's floor, and giving up takes what it made", () => {
  let g = quiet();
  assert.equal(leastPower(g, me(g), now), 2);
  assert.equal(canCall(g, 1, now + 1000), false);
  assert.equal(call(g, "long", 1, now + 1000), g);
  g = call(g, "long", 10, now + 1000);
  assert.equal(me(g).cash, 0);
  assert.equal(me(g).call?.stake, 50);
  assert.equal(me(g).fought, 1);
  assert.equal(call(g, "short", 5, now + 2000), g);
  g = advance(g, at(102), now + 3000);
  g = bank(g, now + 4000);
  near(me(g).cash, 50 - 0.25 + 10 - 5 * 102 * 0.0005);
  assert.equal(me(g).call, null);
  assert.equal(g.feed[0].what, "bank");
});

test("giving up near the best price a call saw, for a good profit, is a critical hit", () => {
  let g = call(quiet(), "long", 20, now + 1000);
  g = advance(g, { h: 101.5, l: 100.5, c: 101 }, now + 2000);
  g = advance(g, at(101.4), now + 3000);
  g = bank(g, now + 4000);
  assert.equal(g.feed[0].crit, true);
  assert.equal(me(g).crits, 1);
  let h = call(quiet(), "long", 20, now + 1000);
  h = advance(h, { h: 102, l: 100.5, c: 101 }, now + 2000);
  h = bank(advance(h, at(100.6), now + 3000), now + 4000);
  assert.equal(h.feed[0].crit, false);
});

test("a call the price reaches the KO level of is knocked out there", () => {
  let g = call(quiet(), "short", 20, now + 1000);
  const ko = me(g).call!.koAt;
  g = advance(g, { h: ko + 0.1, l: 100, c: 100 }, now + 2000);
  assert.deepEqual(me(g).out, { at: now + 2000, price: ko, by: "ko" });
  assert.equal(worth(me(g), g.price), 0);
  assert.equal(call(g, "long", 2, now + 3000), g);
});

test("a round's end puts nobody out: whoever waited and whoever fell behind play on to the bell", () => {
  const g = advance(call(quiet(), "long", 5, now + 1000), at(100), roundEnds(quiet(), 2) + 5000);
  assert.equal(standingCount(g), 10);
  assert.ok(!g.feed.some((e) => e.what === "zap"));
  const behind: Game = { ...quiet(), fighters: quiet().fighters.map((f, i) => ({ ...f, cash: f.stake * (1 - i / 100) })) };
  assert.equal(standingCount(advance(behind, at(100), roundEnds(behind, 1) + 5000)), 10);
});

test("at the end what's in a call comes out at the price, and nothing more can be called", () => {
  let g = call(quiet(), "long", 5, now + 1000);
  const c = me(g).call!;
  g = { ...g, fighters: g.fighters.map((f) => ({ ...f, fought: 99 })) };
  g = advance(g, at(110), g.endsAt + 500);
  assert.ok(g.over);
  assert.equal(g.at, g.endsAt);
  near(me(g).cash, valueOf(c, 110));
  assert.equal(call(g, "long", 5, g.endsAt + 1000), g);
});

test("rivals play a whole Haunting caught up over candles, and nobody ends below zero", () => {
  const g = enter(arena(), "soldier", 100, now);
  const candles = Array.from({ length: 61 }, (_, i) => {
    const p = 100 * (1 + 0.03 * Math.sin(i / 5));
    return { t: now + i * 60_000, h: p * 1.004, l: p * 0.996, c: p };
  });
  const done = catchUp(g, candles, 60_000, now + 2 * 3_600_000);
  assert.ok(done.over);
  const whats = new Set(done.feed.map((e) => e.what));
  assert.ok(whats.has("long") || whats.has("short"));
  assert.ok(!whats.has("zap"));
  assert.ok(whats.has("end"));
  for (const f of done.fighters) {
    assert.ok(worth(f, done.price) >= 0);
    assert.equal(f.call, null);
  }
});

test("standings: those standing by how far their stake has come, then those out, the last to go first", () => {
  const g = quiet();
  const [a, b, c] = g.fighters.slice(1, 4);
  const game: Game = {
    ...g,
    fighters: [
      { ...me(g), cash: 90, out: { at: now + 5000, price: 1, by: "zap" } },
      { ...a, cash: 0, out: { at: now + 9000, price: 1, by: "ko" } },
      { ...b, role: "soldier", stake: 10, cash: 30 },
      { ...c, role: "warlord", stake: 250, cash: 375 },
    ],
  };
  near(gain(game.fighters[2], 100), 2);
  near(gain(game.fighters[3], 100), 0.5);
  assert.deepEqual(standings(game).map((f) => f.id), [b.id, c.id, a.id, YOU]);
});

test("short candles are built from prices, each opening where the last closed", () => {
  const s = (n: number) => 1_000_000 * 15 + n * 1000;
  let ticks = [100, 101, 99, 102].map((p, i) => ({ p, at: s(i * 3) }));
  ticks = withTick(ticks, { p: 104, at: s(40) });
  assert.deepEqual(candlesFrom(ticks, 15_000), [
    { t: s(0), o: 100, h: 102, l: 99, c: 102 },
    { t: s(30), o: 102, h: 104, l: 102, c: 104 },
  ]);
  assert.equal(withTick(ticks, ticks.at(-1)!), ticks);
});

const TIERS = [
  { maxNotional: 10_000, maxPower: 75, mmr: 0.005, amount: 0 },
  { maxNotional: 50_000, maxPower: 50, mmr: 0.01, amount: 50 },
  { maxNotional: 200_000, maxPower: 40, mmr: 0.015, amount: 300 },
];

test("a stake's most power is the highest leverage its position's margin tier allows", () => {
  assert.equal(rulesFor(TIERS, 50).maxPower, 75);
  assert.equal(rulesFor(TIERS, 500).maxPower, 50);
  assert.equal(rulesFor([], 500).maxPower, 100);
});

test("a call is knocked out by its tier's maintenance margin and amount", () => {
  const c = opening("long", 50, 100, 500, now, TIERS);
  const size = 250;
  near(c.koAt, (100 - (500 - 12.5 + 50) / size) / (1 - 0.01));
});

test("power is capped at the market's most, and the round's floor with it", () => {
  const g = { ...quiet(), rules: { maxPower: 5, tiers: TIERS } };
  assert.equal(canCall(g, 6, now + 1000), false);
  assert.equal(canCall(g, 5, now + 1000), true);
  const late = roundEnds(g, 3) + 1000;
  assert.equal(leastPower(g, me(g), late), 5);
});

test("a live call goes by Strike: its entry and K.O. level, no K.O. until Strike says, and what it really came out with", () => {
  let g = call(quiet(), "long", 10, now + 1000, { entry: 101, fee: 0.3, koAt: 91.2, live: "tw-1", size: 4.95 });
  assert.equal(me(g).call?.entry, 101);
  assert.equal(me(g).call?.koAt, 91.2);
  g = advance(g, { h: 101, l: 80, c: 85 }, now + 2000);
  assert.equal(me(g).out, null);
  const banked = bank(g, now + 3000, { price: 104, value: 64.2 });
  assert.equal(me(banked).cash, 64.2);
  near(banked.feed[0].made ?? 0, 14.2);
  const ko = knockedOut(g, now + 3000, 91.2);
  assert.deepEqual(me(ko).out, { at: now + 3000, price: 91.2, by: "ko" });
  assert.equal(ko.feed[0].what, "ko");
  assert.equal(me(settle(ko, 12)).cash, 12);
});

test("one game per kind to join: the running one while its doors are open, then the next, each on the market whose turn it is", () => {
  const symbols = ["BTC-USD", "ETH-USD", "SOL-USD", "ADA-USD"];
  const { every, doors, ms } = KINDS.war;
  const s = Math.ceil(now / every) * every;
  const running = arenaAt("war", s + doors - 1, symbols);
  assert.equal(running.startsAt, s);
  assert.equal(running.endsAt - running.startsAt, ms);
  const next = arenaAt("war", s + doors, symbols);
  assert.equal(next.startsAt, s + every);
  assert.equal(next.opensAt, s + doors);
  assert.deepEqual(arenaAt("war", s + every - 1, symbols), next);
  assert.deepEqual(arenaAt("war", s + every + doors - 1, symbols), next);
  assert.notEqual(next.id, running.id);
  assert.notEqual(next.symbol, running.symbol);
  const skirmish = KINDS.skirmish;
  const markets = new Set(Array.from({ length: 8 }, (_, i) => arenaAt("skirmish", now + i * skirmish.every, ["ADA-USD", "BTC-USD", "NVDA-USD", "SOL-USD"]).symbol));
  assert.deepEqual([...markets].sort(), ["ADA-USD", "SOL-USD"]);
});

test("walking in while the doors are open: every seat's taken, the rivals are caught up, and there's still time to call", () => {
  const a = arena("war");
  const late = a.startsAt + 2 * 3_600_000;
  const g = enter(a, "warlord", 100, late);
  assert.equal(g.at, a.startsAt);
  assert.equal(g.fighters.length, 10);
  assert.equal(g.feed[0].what, "join");
  const bars = Array.from({ length: 9 }, (_, i) => ({ t: a.startsAt + i * 900_000, h: 101 + i / 10, l: 99, c: 100 + i / 10 }));
  const caught = catchUp(g, bars, 900_000, late);
  assert.equal(caught.at, late);
  assert.ok(caught.feed.some((e) => e.what === "long" || e.what === "short"));
  assert.equal(me(caught).out, null);
  assert.equal(canCall(caught, 2, late + 1000), true);
});

test("a game's rivals are the same for everyone: names, ghosts, and when they walk in", () => {
  const a = arena("skirmish");
  const one = lineup(a);
  assert.deepEqual(lineup({ ...a }), one);
  assert.equal(one.length, 9);
  assert.equal(new Set(one.map((b) => b.fighter.id)).size, 9);
  for (const b of one) {
    assert.ok(b.joinsAt > a.opensAt && b.joinsAt < a.startsAt);
    assert.equal(b.fighter.cash, b.fighter.stake);
  }
  assert.notDeepEqual(lineup({ ...a, id: "skirmish-other" }).map((b) => b.fighter.id), one.map((b) => b.fighter.id));
  const heroes = new Set(Array.from({ length: 6 }, (_, i) => lineup({ ...a, id: `skirmish-${i}` }).map((b) => b.fighter.role)).flat());
  assert.equal(heroes.size, 3);
});

test("before the start: rivals walk in, nobody can call, then the haunt starts with every seat full", () => {
  const a = arena("skirmish");
  const early = a.opensAt + 1000;
  let g = enter(a, "soldier", 100, early);
  assert.equal(me(g).stake, 10);
  assert.equal(g.feed[0].what, "join");
  assert.equal(canCall(g, 5, early + 1000), false);
  assert.equal(call(g, "long", 5, early + 1000), g);
  const seated = g.fighters.length;
  g = advance(g, at(100), a.startsAt - 1);
  assert.equal(g.fighters.length, 10);
  assert.ok(g.fighters.length > seated);
  assert.ok(g.feed.filter((e) => e.what === "join").length >= 9);
  g = advance(g, at(101), a.startsAt + 500);
  assert.equal(g.feed[0].what, "start");
  assert.equal(canCall(g, 5, a.startsAt + 1000), true);
});

test("rivals do the same thing for everyone watching the same prices", () => {
  const a = arena("skirmish");
  const bars = Array.from({ length: 60 }, (_, i) => ({ t: a.startsAt + i * 5000, h: 100 + Math.sin(i / 3), l: 99 + Math.sin(i / 3), c: 99.5 + Math.sin(i / 3) }));
  const play = () => catchUp(enter(a, "commando", 100, a.startsAt - 1000), bars, 5000, a.startsAt + 300_000);
  const one = play();
  assert.deepEqual(play(), one);
  assert.ok(one.feed.some((e) => e.what === "long" || e.what === "short"));
});

const p = (id: string, joinedAt: number, role: "soldier" | "commando" | "warlord" = "soldier") => ({ id, name: id, role, joinedAt });

test("players take the seats: bots only fill what's left, and someone in after the start takes the last bot's seat", () => {
  const a = arena("skirmish");
  const players = [p("ann", a.opensAt + 1000), p("bo", a.opensAt + 2000, "warlord")];
  let g = enter(a, "commando", 100, a.opensAt + 3000, { me: "me", players: [...players, { ...p("me", a.opensAt + 3000), role: "commando" }] });
  assert.equal(g.fighters.filter((f) => !f.nerve).length, 3);
  assert.equal(g.fighters.find((f) => f.id === "bo")?.stake, 250);
  g = advance(g, at(100), a.startsAt + GRACE + 1);
  assert.equal(g.fighters.length, 10);
  const bots = g.fighters.filter((f) => f.nerve).map((f) => f.id);
  assert.equal(bots.length, 7);
  const late: Log = { players: [...players, p("cy", a.startsAt + 5000)], moves: [] };
  g = heed(g, late, a.startsAt + 6000);
  assert.equal(g.fighters.length, 10);
  assert.deepEqual(
    g.fighters.filter((f) => f.nerve).map((f) => f.id),
    bots.slice(0, 6),
  );
  assert.ok(g.feed.some((e) => e.what === "join" && e.who === "cy"));
  const walkedIn = enter(a, "soldier", 100, a.startsAt + 9000, { me: "me", players: late.players });
  assert.equal(walkedIn.fighters.length, 10);
});

test("a player with a ghost nobody knows is left out rather than breaking the game", () => {
  const a = arena("battle");
  const odd = { id: "odd", name: "odd", role: "constructor" as never, joinedAt: now - 1000 };
  const g = enter(a, "commando", 100, now, { me: "me", players: [odd, p("ann", now - 2000)] });
  assert.ok(!g.fighters.some((f) => f.id === "odd"));
  assert.ok(g.fighters.every((f) => Number.isFinite(f.stake)));
  assert.equal(heed(g, { players: [odd], moves: [] }, now + 1000).fighters.length, g.fighters.length);
});

test("other players' live calls and banks land at the game's prices, not at what they say Strike gave them", () => {
  const a = arena("battle");
  const log: Log = {
    players: [p("ann", now - 5000)],
    moves: [
      { at: now + 1000, who: "ann", what: "call", side: "long", power: 10, entry: 100, koAt: 0.0001, fee: 0, live: true },
      { at: now + 2000, who: "ann", what: "bank", price: 101, value: 1_000_000, live: true },
    ],
  };
  const quietBots = (g: Game): Game => ({ ...g, fighters: g.fighters.map((f) => (f.nerve ? { ...f, nerve: { ...f.nerve, nextAt: Infinity } } : f)) });
  let g = quietBots(enter(a, "commando", 100, now, { me: "me", players: log.players }));
  g = heed(g, { ...log, moves: log.moves.slice(0, 1) }, now + 1500);
  const ann = () => g.fighters.find((f) => f.id === "ann")!;
  near(ann().call!.koAt, opening("long", 10, 100, 10, now + 1000).koAt);
  g = heed(g, log, now + 2500);
  near(ann().cash, valueOf(opening("long", 10, 100, 10, now + 1000), 101));
});

test("at the bell everyone settles on the game's price when it has one", () => {
  const a = arena("skirmish");
  let g = advance(enter(a, "commando", 100, a.startsAt - 1000), at(100), a.startsAt + 1000);
  g = call(g, "long", 5, a.startsAt + 1000);
  g = heed({ ...g, me: "me", seen: 0 }, { players: [], moves: [], bell: 102 }, a.endsAt - 10);
  g = advance(g, at(101), a.endsAt);
  assert.ok(g.over);
  assert.equal(g.price, 102);
  near(me(g).cash, valueOf(opening("long", 5, 100, 50, a.startsAt + 1000), 102));
});

test("a full game runs again side by side: the same market and times under an id of its own", () => {
  const symbols = ["BTC-USD", "ETH-USD"];
  const a = arenaAt("battle", now, symbols);
  const two = shardOf(a, 2, symbols);
  assert.equal(two.id, `${a.id}-2`);
  assert.deepEqual({ ...two, id: a.id, shard: undefined }, { ...a, shard: undefined });
  assert.deepEqual(arenaOf(two.id, symbols), two);
  assert.equal(arenaOf(`${a.id}-0`, symbols), null);
  assert.equal(arenaOf(`${a.id}-${SHARDS}`, symbols), null);
  assert.equal(arenaOf("constructor-1", symbols), null);
  assert.equal(arenaOf("toString-1", symbols), null);
  assert.ok(sameGame(two.id, a.id));
  assert.notDeepEqual(
    lineup(two).map((b) => b.fighter.id),
    lineup(a).map((b) => b.fighter.id),
  );
});

test("another player's call, bank and K.O. land as they made them, and their own moves aren't taken twice", () => {
  const a = arena("battle");
  const log: Log = {
    players: [p("ann", now - 5000), p("me", now - 4000)],
    moves: [
      { at: now + 1000, who: "ann", what: "call", side: "long", power: 10, entry: 100 },
      { at: now + 2000, who: "me", what: "call", side: "short", power: 5, entry: 100 },
      { at: now + 3000, who: "ann", what: "bank", price: 102 },
      { at: now + 4000, who: "ann", what: "call", side: "short", power: 20, entry: 102 },
      { at: now + 5000, who: "ann", what: "ko", price: 106 },
    ],
  };
  const quietBots = (g: Game): Game => ({ ...g, fighters: g.fighters.map((f) => (f.nerve ? { ...f, nerve: { ...f.nerve, nextAt: Infinity } } : f)) });
  let g = quietBots(enter(a, "commando", 100, now, { me: "me", players: log.players }));
  g = heed(g, log, now + 3500);
  const ann = () => g.fighters.find((f) => f.id === "ann")!;
  assert.equal(g.seen, 3);
  assert.equal(ann().call, null);
  near(ann().cash, valueOf(opening("long", 10, 100, 10, now + 1000), 102));
  assert.equal(me(g).call, null);
  g = heed(g, log, now + 9000);
  assert.equal(ann().out?.by, "ko");
  assert.equal(g.seen, 5);
  assert.equal(heed(g, log, now + 9000), g);
});

test("a call that comes in before a round ends counts for that round, one made after it doesn't", () => {
  const a = arena("skirmish");
  const end = a.startsAt + KINDS.skirmish.ms / KINDS.skirmish.floors.length;
  const log: Log = {
    players: [p("ann", a.startsAt - 5000), p("bo", a.startsAt - 4000)],
    moves: [
      { at: end - 500, who: "ann", what: "call", side: "long", power: 5, entry: 100 },
      { at: end + 500, who: "bo", what: "call", side: "long", power: 5, entry: 100 },
    ],
  };
  let g = enter(a, "commando", 100, a.startsAt - 1000, { me: "me", players: log.players });
  g = call(advance(g, at(100), a.startsAt + 1000), "long", 5, a.startsAt + 1000);
  g = advance(g, at(100), end - 1000);
  g = advance(g, at(101), end + 1000);
  g = heed(g, log, end + 1000);
  g = advance(g, at(101), end + GRACE + 100);
  const fighter = (id: string) => g.fighters.find((f) => f.id === id)!;
  assert.ok(foughtIn(g, fighter("ann"), 0));
  assert.ok(!foughtIn(g, fighter("bo"), 0));
  assert.ok(foughtIn(g, fighter("bo"), 1));
});

test("a game's id says when it starts, and its doors are only open until the first round is well under way", () => {
  const symbols = ["BTC-USD", "ETH-USD"];
  const a = arenaAt("battle", now, symbols);
  assert.deepEqual(arenaOf(a.id, symbols), a);
  assert.equal(arenaOf("battle-zz", symbols), null);
  assert.equal(arenaOf("nope-1", symbols), null);
  assert.ok(doorsOpen(a, a.opensAt));
  assert.ok(doorsOpen(a, a.startsAt + KINDS.battle.doors - 1));
  assert.ok(!doorsOpen(a, a.startsAt + KINDS.battle.doors));
  assert.ok(!doorsOpen(a, a.opensAt - 1));
});

const started = (): Game => advance(quiet(), at(100), now + 1000);
const bar = (h: number, l: number, c = (h + l) / 2) => ({ h, l, c });

test("a trap springs when the price trades through it, in at exactly its price with Strike's maker rebate, and counts as up by it", () => {
  let g = setTrap(started(), "long", 10, 99, now + 2000);
  assert.equal(me(g).trap?.price, 99);
  assert.equal(g.feed[0].what, "trap");
  g = advance(g, at(99), now + 3000);
  assert.ok(me(g).trap, "a touch doesn't spring it");
  g = advance(g, bar(99.5, 98.9), now + 4000);
  const c = me(g).call!;
  assert.equal(me(g).trap, null);
  assert.equal(c.entry, 99);
  assert.equal(c.maker, true);
  near(c.fee, 50 * 10 * STRIKE.maker);
  assert.ok(c.fee < 0);
  assert.equal(me(g).liquidity, 500);
  assert.equal(g.feed[0].maker, true);
  assert.equal(me(g).fought & 1, 1);
  near(worth(me(g), 99), 50 + 50 * 10 * -STRIKE.maker);
  assert.ok(valueOf(c, 99) < 50, "giving up at the market there pays the taker fee");
});

test("a long trap goes below the price and a short one above, and setting another moves it", () => {
  const g = started();
  assert.equal(canTrap(g, "long", 10, 101, now + 2000), false);
  assert.equal(canTrap(g, "short", 10, 99, now + 2000), false);
  assert.equal(canTrap(g, "short", 10, 101, now + 2000), true);
  assert.equal(canTrap(quiet(), "long", 10, 99, now - 1000), false, "not before the start");
  const moved = setTrap(setTrap(g, "long", 10, 99, now + 2000), "long", 10, 99.5, now + 3000);
  assert.equal(me(moved).trap?.price, 99.5);
  assert.equal(moved.feed.filter((e) => e.what === "trap").length, 1);
  assert.equal(me(pullTrap(moved)).trap, null);
});

test("a thundercloud cashes in at its price as a maker, so graves and thundercloud make money on the smallest move", () => {
  assert.ok(hurdle(STRIKE.maker, STRIKE.maker) < 0);
  near(hurdle(STRIKE.taker, STRIKE.taker), 0.001 / 0.9995);
  let g = setTrap(started(), "long", 20, 99, now + 2000);
  assert.equal(canFlag(g, 98.5, now + 2000), false);
  g = plantFlag(g, 99.02, now + 2000);
  g = advance(g, bar(99.2, 98.95), now + 3000);
  assert.equal(me(g).call?.flag, 99.02);
  g = advance(g, bar(99.03, 99), now + 4000);
  assert.equal(me(g).call, null);
  assert.ok(me(g).cash > 50, `${me(g).cash} should be more than the stake`);
  assert.equal(g.feed[0].what, "bank");
  assert.equal(g.feed[0].maker, true);
  const charged = advance(bank(advance(call(started(), "long", 20, now + 2000), at(100.02), now + 3000), now + 3000), at(100.02), now + 4000);
  assert.ok(me(charged).cash < 50, "swooping in and giving up on the same move loses the fees");
});

test("giving up at the break-even price comes out at the stake, in by swooping or by graves, either way", () => {
  for (const side of ["long", "short"] as const) {
    const charged = me(call(started(), side, 20, now + 2000)).call!;
    near(valueOf(charged, breakEven(charged)), charged.stake);
    assert.ok(side === "long" ? breakEven(charged) > charged.entry : breakEven(charged) < charged.entry);
    const ambushed = me(advance(setTrap(started(), side, 20, side === "long" ? 99.9 : 100.1, now + 2000), side === "long" ? bar(100, 99.8) : bar(100.2, 100), now + 3000)).call!;
    assert.ok(ambushed.maker);
    near(valueOf(ambushed, breakEven(ambushed)), ambushed.stake);
    assert.ok(Math.abs(breakEven(ambushed) - ambushed.entry) < Math.abs(breakEven(charged) - charged.entry), "graves have less to cover");
  }
});

test("a call's move is before fees, and giving up says what the fees took", () => {
  let g = advance(call(started(), "long", 20, now + 2000), at(100.02), now + 3000);
  const c = me(g).call!;
  near(moveOf(c, 100.02), (50 * 20 * (100.02 - c.entry)) / c.entry);
  assert.ok(moveOf(c, 100.02) > 0);
  g = bank(g, now + 3000);
  near(g.feed[0].move!, moveOf(c, 100.02));
  assert.ok(g.feed[0].made! < 0, "a swoop given up on a small move loses the fees");
});

test("graves can wait unsprung through a round's end and still be there", () => {
  const g = advance(setTrap(started(), "long", 10, 90, now + 2000), at(100), roundEnds(quiet(), 0) + 5000);
  assert.equal(me(g).out, null);
  assert.equal(me(g).trap?.price, 90);
});

test("another player's trap springs here by the price, and what they say filled only lands if it hasn't", () => {
  const a = arena("battle");
  const players = [p("ann", now - 5000), p("bo", now - 4000), p("me", now - 3000)];
  const log: Log = {
    players,
    moves: [
      { at: now + 1000, who: "ann", what: "trap", side: "long", power: 10, price: 99, flag: 101 },
      { at: now + 1000, who: "bo", what: "trap", side: "short", power: 5, price: 101 },
      { at: now + 3000, who: "bo", what: "fill", price: 101 },
      { at: now + 3500, who: "ann", what: "fill", price: 99 },
    ],
  };
  const quietBots = (g: Game): Game => ({ ...g, fighters: g.fighters.map((f) => (f.nerve ? { ...f, nerve: { ...f.nerve, nextAt: Infinity } } : f)) });
  let g = quietBots(enter(a, "commando", 100, now, { me: "me", players }));
  g = advance(heed(g, log, now + 1500), at(100), now + 1500);
  const who = (id: string) => g.fighters.find((f) => f.id === id)!;
  assert.equal(who("ann").trap?.price, 99);
  g = advance(g, bar(99.5, 98.5), now + 2000);
  assert.equal(who("ann").call?.entry, 99);
  assert.equal(who("ann").call?.flag, 101);
  g = heed(g, log, now + 4000);
  assert.equal(who("bo").call?.entry, 101);
  assert.equal(who("bo").call?.maker, true);
  assert.ok(who("ann").call!.at <= now + 2000, "ann's fill was already in before she said so");
  g = advance(g, bar(101.5, 100.5), now + 5000);
  assert.equal(who("ann").call, null);
  assert.ok(who("ann").cash > who("ann").stake);
});

test("rivals set traps that spring, and none are left waiting at the final bell", () => {
  const g = enter(arena(), "soldier", 100, now);
  const candles = Array.from({ length: 61 }, (_, i) => {
    const p = 100 * (1 + 0.01 * Math.sin(i / 3));
    return { t: now + i * 60_000, h: p * 1.003, l: p * 0.997, c: p };
  });
  const done = catchUp(g, candles, 60_000, now + 2 * 3_600_000);
  const sides = done.feed.filter((e) => e.what === "long" || e.what === "short");
  assert.ok(sides.some((e) => e.maker));
  assert.ok(done.fighters.some((f) => (f.liquidity ?? 0) > 0));
  assert.ok(done.fighters.every((f) => !f.trap));
});

test("a call held through a round counts for it, even closed at the bell", () => {
  let g = advance(call(started(), "long", 5, now + 2000), at(100), roundEnds(quiet(), 0) - 1000);
  g = advance(g, at(100), roundEnds(g, 1) - 1000);
  g = bank(g, roundEnds(g, 1) + 500);
  g = advance(g, at(100), roundEnds(g, 1) + GRACE + 100);
  assert.equal(me(g).out, null);
  assert.equal(me(g).fought & 0b11, 0b11);
});

test("live graves and thundercloud go by Strike: not sprung or struck by the price here, but when Strike fills them", () => {
  let g = setTrap(started(), "long", 10, 99, now + 2000, { live: "tw-t", size: 5.05 });
  g = plantFlag(g, 99.5, now + 2000);
  g = advance(g, bar(99.2, 98), now + 3000);
  assert.equal(me(g).trap?.live, "tw-t", "the price going through doesn't spring it");
  assert.equal(trapped(g, { entry: 99, fee: -0.02, koAt: 90.1, live: "tw-other", size: 5.05 }, now + 3500), g);
  g = trapped(g, { entry: 99, fee: -0.02, koAt: 90.1, live: "tw-t", size: 5.05 }, now + 3500);
  const c = me(g).call!;
  assert.deepEqual([c.entry, c.fee, c.koAt, c.live, c.size, c.maker, c.flag], [99, -0.02, 90.1, "tw-t", 5.05, true, 99.5]);
  assert.equal(me(g).fought & 1, 1);
  assert.equal(g.feed[0].maker, true);
  assert.equal(flagHit(g, now + 4000, 99.5), g, "no thundercloud on Strike yet");
  g = plantFlag(g, 99.6, now + 4000, "tw-f");
  assert.equal(me(g).call?.flagOrder, "tw-f");
  g = advance(g, bar(100, 99.4), now + 5000);
  assert.ok(me(g).call, "the price going through doesn't strike it");
  near(me(flagHit(g, now + 5500, 99.61, 0.25)).cash, valueOf(c, 99.61, 0) - 0.25);
  g = flagHit(g, now + 5500, 99.61);
  assert.equal(me(g).call, null);
  near(me(g).cash, valueOf(c, 99.61, STRIKE.maker));
  assert.deepEqual([g.feed[0].what, g.feed[0].price, g.feed[0].maker], ["bank", 99.61, true]);
  assert.equal(me(plantFlag(trapped(setTrap(started(), "long", 10, 99, now + 2000, { live: "tw-t", size: 5 }), { entry: 99, fee: 0, koAt: 90, live: "tw-t", size: 5 }, now + 3000), undefined, now + 3000)).call?.flagOrder, undefined);
});
