import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { after, before, test } from "node:test";
import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { KINDS, SEATS, type Arena } from "../game/war.ts";
import { CAP } from "./moves.ts";

// DynamoDB Local in Docker, on a port of its own, with a fresh table each run. Nothing here reaches AWS.
const PORT = 8124;
const IMAGE = "amazon/dynamodb-local:3.3.2@sha256:6ada631ec7aa5fc83446855eb17233e3dad184fec47477e8140c6c569cfe0c86";
const CONTAINER = "boltergeist-dynamodb-local";
process.env.DYNAMODB_ENDPOINT = `http://127.0.0.1:${PORT}`;
process.env.ARENAS_TABLE = "boltergeist-test";

let MARK = 100_000;
let LOW: number | undefined;
let markAsks = 0;
const ACCOUNTS: Record<string, string> = {};
const SYMBOLS = ["BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD"];
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  const u = String(url);
  if (u.includes("exchangeInfo")) return Response.json({ symbols: SYMBOLS.map((symbol) => ({ symbol, status: "trading" })) });
  if (u.includes("markPrice")) {
    markAsks++;
    return Response.json({ p: String(MARK) });
  }
  if (u.includes("klines")) return Response.json(LOW === undefined ? [] : [[clock - 500, String(MARK), String(MARK), String(LOW), String(MARK)]]);
  if (u.endsWith("/v2/account")) {
    const key = (init?.headers as Record<string, string>)["X-API-Wallet-Public-Key"];
    return ACCOUNTS[key] ? Response.json({ account_id: ACCOUNTS[key] }) : new Response(null, { status: 401 });
  }
  return new Response(null, { status: 404 });
}) as typeof fetch;

const realNow = Date.now;
let clock = 0;
const secret = () => randomBytes(32).toString("hex");
const docker = (...args: string[]) => execFileSync("docker", args, { stdio: ["ignore", "pipe", "pipe"] });

const store = await import("./arenas.ts");

before(async () => {
  try {
    docker("rm", "-f", CONTAINER);
  } catch {}
  docker("run", "-d", "--rm", "--name", CONTAINER, "-p", `127.0.0.1:${PORT}:8000`, IMAGE);
  const raw = new DynamoDBClient({ endpoint: process.env.DYNAMODB_ENDPOINT, region: "us-east-1", credentials: { accessKeyId: "local", secretAccessKey: "local" } });
  for (let tries = 0; ; tries++) {
    try {
      await raw.send(
        new CreateTableCommand({
          TableName: process.env.ARENAS_TABLE,
          AttributeDefinitions: [
            { AttributeName: "pk", AttributeType: "S" },
            { AttributeName: "sk", AttributeType: "S" },
          ],
          KeySchema: [
            { AttributeName: "pk", KeyType: "HASH" },
            { AttributeName: "sk", KeyType: "RANGE" },
          ],
          BillingMode: "PAY_PER_REQUEST",
        }),
      );
      break;
    } catch (err) {
      if (tries > 40) throw err;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  Date.now = () => clock;
});

after(() => {
  Date.now = realNow;
  docker("rm", "-f", CONTAINER);
});

let next = Math.ceil(realNow() / KINDS.battle.every) * KINDS.battle.every;
// A Haunting of its own for each test, its doors open a minute in.
async function battle(): Promise<Arena> {
  const a = await store.arena(`battle-${(next / 60_000).toString(36)}`);
  next += KINDS.battle.every;
  clock = a.startsAt + 60_000;
  return a;
}

const proof = (key: string) => ({ key, signature: "ab".repeat(64), timestamp: String(Math.floor(clock / 1000)), nonce: "123e4567-e89b-12d3-a456-426614174000" });
// Strike's price moves on, and the game's last look at it runs out.
const markTo = (p: number) => {
  MARK = p;
  clock += 2000;
};

test("a seat is taken once, however often it's asked for", async () => {
  const a = await battle();
  const me = secret();
  const first = await store.join(a, { secret: me, name: "Neon Comet 12", role: "soldier" });
  clock += 5000;
  const again = await store.join(a, { secret: me, name: "Neon Comet 12", role: "soldier" });
  assert.deepEqual(again, first);
  assert.equal(first.arena.id, a.id);
  assert.equal(first.player.joinedAt, a.startsAt + 60_000);
  const log = await store.log(a, { fresh: true });
  assert.deepEqual(log.players, [first.player]);
});

test("no more than ten seats in a game, even all at once: the rest sit in a copy of it beside it", async () => {
  const a = await battle();
  const got = await Promise.all(Array.from({ length: SEATS + 5 }, (_, i) => store.join(a, { secret: secret(), name: `Player ${i}`, role: "commando" })));
  const by = (id: string) => got.filter((g) => g.arena.id === id).length;
  assert.equal(by(a.id), SEATS);
  assert.equal(by(`${a.id}-1`), 5);
  assert.equal((await store.log(a, { fresh: true })).players.length, SEATS);
  const lobby = await store.lobby([a.id]);
  assert.equal(lobby[`${a.id}-1`].length, 5);
  assert.equal(lobby[a.id].length, 5);
  const one = got.find((g) => g.arena.id !== a.id)!;
  assert.equal(one.arena.symbol, a.symbol);
  assert.equal(one.arena.startsAt, a.startsAt);
});

test("two players can't sit under one name: the second gets a number after it", async () => {
  const a = await battle();
  const one = await store.join(a, { secret: secret(), name: "Neon Comet", role: "soldier" });
  const two = await store.join(a, { secret: secret(), name: "neon comet", role: "soldier" });
  const three = await store.join(a, { secret: secret(), name: "Neon Comet", role: "warlord" });
  assert.deepEqual([one.player.name, two.player.name, three.player.name], ["Neon Comet", "neon comet 2", "Neon Comet 3"]);
});

test("shut doors, bad names, made up ghosts and strangers are turned away", async () => {
  const a = await battle();
  await assert.rejects(store.join(a, { secret: secret(), name: "you", role: "soldier" }), /Pick a name/);
  await assert.rejects(store.join(a, { secret: "nope", name: "Neon Comet", role: "soldier" }), /Who are you/);
  for (const role of ["constructor", "__proto__", "toString", 7]) await assert.rejects(store.join(a, { secret: secret(), name: "Neon Comet", role }), /Pick a ghost/);
  await assert.rejects(store.act(a, { secret: secret(), what: "call", side: "long", power: 10 }), /not in that game/);
  clock = a.startsAt + KINDS.battle.doors;
  await assert.rejects(store.join(a, { secret: secret(), name: "Late Otter", role: "warlord" }), /started without you/);
});

test("moves are stamped with the game's time and Strike's price, checked against what the player has on, and read back in order", async () => {
  const a = await battle();
  const me = secret();
  const { player } = await store.join(a, { secret: me, name: "Iron Lynx 40", role: "warlord" });
  clock += 1000;
  await assert.rejects(store.act(a, { secret: me, what: "call", side: "long", power: 500 }), /power/);
  const call = await store.act(a, { secret: me, what: "call", side: "short", power: 20, entry: MARK * 1.009, koAt: 1, live: true });
  assert.equal(call.entry, MARK);
  await assert.rejects(store.act(a, { secret: me, what: "call", side: "long", power: 20 }), /in already/);
  clock += 1000;
  markTo(MARK * 0.99);
  const bank = await store.act(a, { secret: me, what: "bank", price: 1, value: 1e9, live: true });
  assert.equal(bank.price, MARK);
  assert.equal(bank.value, undefined);
  await assert.rejects(store.act(a, { secret: me, what: "bank", price: MARK }), /Nothing to give up/);
  assert.equal(call.at, a.startsAt + 61_000);
  assert.equal(call.who, player.id);
  const log = await store.log(a, { fresh: true });
  assert.deepEqual(log.moves, [call, bank]);
  assert.ok(!("koAt" in log.moves[0]));
});

test("graves fill at their own price, and only once Strike's price has been there", async () => {
  const a = await battle();
  const me = secret();
  await store.join(a, { secret: me, name: "Wild Raven 77", role: "commando" });
  clock += 1000;
  const trap = await store.act(a, { secret: me, what: "trap", side: "long", power: 10, price: MARK * 0.85, flag: MARK * 1.02 });
  assert.equal(trap.flag, MARK * 1.02);
  await assert.rejects(store.act(a, { secret: me, what: "trap", side: "long", power: 10, price: MARK * 0.5 }), /too far/);
  await assert.rejects(store.act(a, { secret: me, what: "fill", price: MARK }), /hasn't reached/);
  clock += 1000;
  const flag = await store.act(a, { secret: me, what: "flag" });
  assert.equal(flag.price, undefined);
  clock += 1000;
  LOW = MARK * 0.84;
  const fill = await store.act(a, { secret: me, what: "fill", price: MARK * 1.001 });
  LOW = undefined;
  assert.equal(fill.price, MARK * 0.85);
  clock += 1000;
  const bank = await store.act(a, { secret: me, what: "bank", price: MARK, flag: MARK });
  assert.equal(bank.flag, undefined);
  const log = await store.log(a, { fresh: true });
  assert.deepEqual(
    log.moves.map((m) => m.what),
    ["trap", "flag", "fill", "bank"],
  );
  assert.deepEqual(log.moves[2], fill);
});

test("two moves from one player at once are taken one after the other, never both past the same check", async () => {
  const a = await battle();
  const me = secret();
  await store.join(a, { secret: me, name: "Solar Shark 3", role: "soldier" });
  clock += 1000;
  const got = await Promise.allSettled(Array.from({ length: 4 }, () => store.act(a, { secret: me, what: "call", side: "long", power: 5 })));
  assert.equal(got.filter((g) => g.status === "fulfilled").length, 1);
  assert.equal((await store.log(a, { fresh: true })).moves.length, 1);
});

test("a player who keeps on moving is stopped at the cap", async () => {
  const a = await battle();
  const me = secret();
  await store.join(a, { secret: me, name: "Turbo Yeti 9", role: "soldier" });
  clock += 1000;
  for (let i = 0; i < CAP.battle / 2; i++) {
    await store.act(a, { secret: me, what: "trap", side: "long", power: 5, price: MARK * 0.99 });
    await store.act(a, { secret: me, what: "pull" });
  }
  await assert.rejects(store.act(a, { secret: me, what: "trap", side: "long", power: 5, price: MARK * 0.99 }), /all the moves/);
});

test("a look from the last one on brings only what's new, with players and a few seconds of overlap", async () => {
  const a = await battle();
  const one = secret();
  const two = secret();
  await store.join(a, { secret: one, name: "Rapid Wolf 1", role: "soldier" });
  await store.join(a, { secret: two, name: "Rapid Wolf 2", role: "soldier" });
  clock += 1000;
  const first = await store.act(a, { secret: one, what: "call", side: "long", power: 5 });
  clock += 30_000;
  const look = await store.log(a);
  assert.equal(look.moves.length, 1);
  const second = await store.act(a, { secret: two, what: "call", side: "short", power: 5 });
  const since = await store.log(a, { after: look.next });
  assert.deepEqual(since.moves, [second]);
  assert.equal(since.players.length, 2);
  assert.ok(first.id && second.id && first.id !== second.id);
  assert.equal((await store.log(a, { after: "p#nonsense" })).moves.length, 2);
});

test("the price at the bell is taken once, by the first look after it, and kept", async () => {
  const a = await battle();
  clock = a.endsAt - 1000;
  assert.equal((await store.log(a)).bell, undefined);
  clock = a.endsAt + 500;
  markTo(MARK);
  const bell = (await store.log(a)).bell;
  assert.equal(bell, MARK);
  markTo(MARK * 2);
  assert.equal((await store.log(a)).bell, bell);
  const late = await battle();
  clock = late.endsAt + 120_000;
  assert.equal((await store.log(late)).bell, undefined);
  MARK = bell!;
});

test("a seat taken signed in to Strike follows the account to another device, and nobody else", async () => {
  const a = await battle();
  ACCOUNTS["a".repeat(64)] = "acct-7";
  ACCOUNTS["b".repeat(64)] = "acct-7";
  const laptop = secret();
  const phone = secret();
  const first = await store.join(a, { secret: laptop, name: "Lucky Otter", role: "warlord", proof: proof("a".repeat(64)) });
  clock += 1000;
  const again = await store.join(a, { secret: phone, name: "Other Name", role: "soldier", proof: proof("b".repeat(64)) });
  assert.deepEqual(again.player, first.player);
  const seat = first.player.id;
  await store.act(a, { secret: phone, seat, what: "call", side: "long", power: 5 });
  clock += 1000;
  await store.act(a, { secret: laptop, seat, what: "bank" });
  await assert.rejects(store.act(a, { secret: secret(), seat, what: "call", side: "long", power: 5 }), /not in that game/);
  await assert.rejects(store.join(a, { secret: secret(), name: "Sneaky", role: "soldier", proof: proof("c".repeat(64)) }), /didn't know/);
  await assert.rejects(store.join(a, { secret: secret(), name: "Sneaky", role: "soldier", proof: { key: "zz" } }), /not a Strike sign-in/);
});

test("a crowd of moves at once asks Strike for its price once", async () => {
  const a = await battle();
  const players = Array.from({ length: 5 }, () => secret());
  await Promise.all(players.map((s, i) => store.join(a, { secret: s, name: `Crowd ${i}`, role: "soldier" })));
  clock += 2000;
  const before = markAsks;
  await Promise.all(players.map((s) => store.act(a, { secret: s, what: "call", side: "long", power: 5 })));
  assert.equal(markAsks - before, 1);
});
