import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { after, before, test } from "node:test";
import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { KINDS, SEATS, type Arena } from "../game/war.ts";

// DynamoDB Local in Docker, on a port of its own, with a fresh table each run. Nothing here reaches AWS.
const PORT = 8124;
const IMAGE = "amazon/dynamodb-local:3.3.2@sha256:6ada631ec7aa5fc83446855eb17233e3dad184fec47477e8140c6c569cfe0c86";
const CONTAINER = "boltergeist-dynamodb-local";
process.env.DYNAMODB_ENDPOINT = `http://127.0.0.1:${PORT}`;
process.env.ARENAS_TABLE = "boltergeist-test";

const MARK = 100_000;
const SYMBOLS = ["BTC-USD", "ETH-USD", "SOL-USD", "XRP-USD"];
globalThis.fetch = (async (url: string | URL) => {
  if (String(url).includes("exchangeInfo")) return Response.json({ symbols: SYMBOLS.map((symbol) => ({ symbol, status: "trading" })) });
  if (String(url).includes("markPrice")) return Response.json({ p: String(MARK) });
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
// A battle of its own for each test, its doors open a minute in.
async function battle(): Promise<Arena> {
  const a = await store.arena(`battle-${(next / 60_000).toString(36)}`);
  next += KINDS.battle.every;
  clock = a.startsAt + 60_000;
  return a;
}

test("a seat is taken once, however often it's asked for", async () => {
  const a = await battle();
  const me = secret();
  const first = await store.join(a, { secret: me, name: "Neon Comet 12", role: "soldier" });
  clock += 5000;
  const again = await store.join(a, { secret: me, name: "Neon Comet 12", role: "soldier" });
  assert.deepEqual(again, first);
  assert.equal(first.joinedAt, a.startsAt + 60_000);
  const log = await store.log(a, true);
  assert.deepEqual(log.players, [first]);
});

test("no more than ten seats, even all at once", async () => {
  const a = await battle();
  const got = await Promise.allSettled(Array.from({ length: SEATS + 5 }, (_, i) => store.join(a, { secret: secret(), name: `Player ${i}`, role: "commando" })));
  const seated = got.filter((g) => g.status === "fulfilled");
  const full = got.filter((g) => g.status === "rejected" && g.reason instanceof store.Refused && g.reason.status === 409);
  assert.equal(seated.length, SEATS);
  assert.equal(full.length, 5);
  assert.equal((await store.log(a, true)).players.length, SEATS);
  assert.equal((await store.lobby([a.id]))[a.id].length, SEATS);
});

test("shut doors, bad names and strangers are turned away", async () => {
  const a = await battle();
  await assert.rejects(store.join(a, { secret: secret(), name: "you", role: "soldier" }), /Pick a name/);
  await assert.rejects(store.join(a, { secret: "nope", name: "Neon Comet", role: "soldier" }), /Who are you/);
  await assert.rejects(store.act(a, { secret: secret(), what: "call", side: "long", power: 10, entry: MARK }), /not in that game/);
  clock = a.startsAt + KINDS.battle.doors;
  await assert.rejects(store.join(a, { secret: secret(), name: "Late Otter", role: "warlord" }), /started without you/);
});

test("moves are stamped with the arena's time, checked against Strike's price and read back in order", async () => {
  const a = await battle();
  const me = secret();
  const player = await store.join(a, { secret: me, name: "Iron Lynx 40", role: "warlord" });
  clock += 1000;
  const call = await store.act(a, { secret: me, what: "call", side: "short", power: 20, entry: MARK * 1.002, at: 1 });
  await assert.rejects(store.act(a, { secret: me, what: "call", side: "long", power: 20, entry: MARK * 1.05 }), /Strike's price/);
  await assert.rejects(store.act(a, { secret: me, what: "call", side: "long", power: 500, entry: MARK }), /power/);
  clock += 1000;
  const bank = await store.act(a, { secret: me, what: "bank", price: MARK });
  assert.equal(call.at, a.startsAt + 61_000);
  assert.equal(call.who, player.id);
  const log = await store.log(a, true);
  assert.deepEqual(log.moves, [call, bank]);
  assert.ok(!("koAt" in log.moves[0]));
});

test("traps, flags and pulls are taken within reach of Strike's price, and fills at it", async () => {
  const a = await battle();
  const me = secret();
  await store.join(a, { secret: me, name: "Wild Raven 77", role: "commando" });
  clock += 1000;
  const trap = await store.act(a, { secret: me, what: "trap", side: "long", power: 10, price: MARK * 0.95, flag: MARK * 1.02 });
  assert.equal(trap.flag, MARK * 1.02);
  await assert.rejects(store.act(a, { secret: me, what: "trap", side: "long", power: 10, price: MARK * 0.5 }), /Strike's price/);
  await assert.rejects(store.act(a, { secret: me, what: "fill", price: MARK * 0.95 }), /Strike's price/);
  clock += 1000;
  const flag = await store.act(a, { secret: me, what: "flag" });
  assert.equal(flag.price, undefined);
  clock += 1000;
  const fill = await store.act(a, { secret: me, what: "fill", price: MARK * 1.001 });
  clock += 1000;
  const bank = await store.act(a, { secret: me, what: "bank", price: MARK, flag: MARK });
  assert.equal(bank.flag, MARK);
  const log = await store.log(a, true);
  assert.deepEqual(
    log.moves.map((m) => m.what),
    ["trap", "flag", "fill", "bank"],
  );
  assert.deepEqual(log.moves[2], fill);
});
