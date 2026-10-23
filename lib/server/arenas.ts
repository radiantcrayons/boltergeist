import { createHash } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { arenaOf, doorsOpen, ROLES, ROSTER, SEATS, SHARDS, shardOf, type Arena, type Log, type Move, type Player, type Role } from "../game/war.ts";
import { NETWORK, REST } from "../strike.ts";
import { Refused, rule, TOL, type Prices, type State } from "./moves.ts";

export { Refused };

// On Vercel, functions assume AWS_ROLE_ARN with the deployment's OIDC token, so no AWS keys are kept there.
// Locally it's the SDK's own chain (AWS_PROFILE), or DynamoDB Local at DYNAMODB_ENDPOINT.
let client: DynamoDBDocumentClient | undefined;
function db(): DynamoDBDocumentClient {
  const roleArn = process.env.AWS_ROLE_ARN;
  const endpoint = process.env.DYNAMODB_ENDPOINT;
  client ??= DynamoDBDocumentClient.from(
    new DynamoDBClient({
      // Vercel keeps AWS_REGION for itself.
      region: process.env.DYNAMODB_REGION ?? "us-east-1",
      ...(roleArn && { credentials: awsCredentialsProvider({ roleArn }) }),
      ...(endpoint && { endpoint, credentials: { accessKeyId: "local", secretAccessKey: "local" } }),
    }),
    { marshallOptions: { removeUndefinedValues: true } },
  );
  return client;
}
const table = () => process.env.ARENAS_TABLE!;

// A game's seat count, players, names and moves share its partition, and go a day after it ends. Moves sort first,
// then names (n#), players (p#), the seat count and the bell (x#), so a look from a move on picks up everything else too.
const pk = (a: Arena) => `${NETWORK}#${a.id}`;
const until = (a: Arena) => Math.ceil(a.endsAt / 1000) + 86_400;
const NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]{1,19}$/;
const BELL = "x#bell";
// How far back each look reaches past the last, so a move that took a moment to land isn't missed.
const LAG = 5000;
// The bell is only taken by a look within this of the end, so a late look can't set it from a price long after.
const BELL_WINDOW = 60_000;

let markets: { at: number; symbols: string[] } | null = null;
async function symbols(): Promise<string[]> {
  if (markets && Date.now() - markets.at < 600_000) return markets.symbols;
  const res = await fetch(`${REST}/price/v2/exchangeInfo`, { cache: "no-store" });
  if (!res.ok) throw new Refused("Can't reach Strike", 502);
  const info = (await res.json()) as { symbols: { symbol: string; status: string }[] };
  markets = { at: Date.now(), symbols: info.symbols.filter((s) => s.status === "trading").map((s) => s.symbol) };
  return markets.symbols;
}

// Strike publishes its mark every few seconds, so one asked for within a moment is as good as a new one, and a crowd
// of moves at once asks Strike once.
const MARK_MS = 1500;
const marks = new Map<string, { at: number; p: Promise<number> }>();
function mark(symbol: string): Promise<number> {
  const kept = marks.get(symbol);
  if (kept && Date.now() - kept.at < MARK_MS) return kept.p;
  const p = fetch(`${REST}/price/v2/markPrice?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" })
    .then(async (res) => (res.ok ? Number(((await res.json()) as { p?: string }).p) : NaN))
    .catch(() => NaN)
    .then((n) => {
      if (!Number.isFinite(n) || n <= 0) throw new Refused("Can't reach Strike's price", 502);
      return n;
    });
  const entry = { at: Date.now(), p };
  marks.set(symbol, entry);
  p.catch(() => marks.get(symbol) === entry && marks.delete(symbol));
  return p;
}

// Whether Strike's mark has been down to (or up to) a price since a time: now, or in a candle that started after it.
async function reached(symbol: string, way: "down" | "up", price: number, since: number): Promise<boolean> {
  const hit = (p: number) => (way === "down" ? p <= price * (1 + TOL) : p >= price * (1 - TOL));
  if (hit(await mark(symbol))) return true;
  const span = Math.max(0, Date.now() - since);
  const interval = span > 480 * 60_000 ? "15m" : "1m";
  const ms = interval === "1m" ? 60_000 : 900_000;
  const query = new URLSearchParams({ symbol, interval, limit: String(Math.min(500, Math.ceil(span / ms) + 1)), priceType: "mark" });
  const res = await fetch(`${REST}/price/v2/klines?${query}`, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) throw new Refused("Can't reach Strike's price", 502);
  const rows = (await res.json()) as [number, string, string, string, string][];
  return rows.some(([t, , h, l]) => t >= since && hit(Number(way === "down" ? l : h)));
}

const pricesOf = (a: Arena): Prices => ({ mark: () => mark(a.symbol), reached: (way, price, since) => reached(a.symbol, way, price, since) });

export const online = () => !!process.env.ARENAS_TABLE;

export async function arena(id: string): Promise<Arena> {
  const a = arenaOf(id, await symbols());
  if (!a) throw new Refused("No such game", 404);
  return a;
}

const short = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);
export const playerOf = (secret: unknown) => (typeof secret === "string" && /^[0-9a-f]{64}$/.test(secret) ? short(secret) : null);
// A player signed in to Strike sits as their Strike account, so the seat follows them to any device signed in to it.
const accountSeat = (account: string) => short(`strike:${NETWORK}:${account}`);

export function nameOf(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const clean = name.trim().replace(/\s+/g, " ");
  const lower = clean.toLowerCase();
  return NAME.test(clean) && lower !== "you" && !ROSTER.some((r) => r.toLowerCase() === lower) ? clean : null;
}

// A second player with a name already taken in the game gets a number after it.
const nameFor = (name: string, tries: number) => (tries ? `${name.slice(0, 20 - String(tries + 1).length - 1)} ${tries + 1}` : name);

type Item = { pk: string; sk: string; player?: Player; move?: Move; state?: State; devices?: Set<string>; bell?: number; taken?: number };

async function items(a: Arena, opts: { prefix?: string; after?: string; fresh?: boolean } = {}): Promise<Item[]> {
  const out: Item[] = [];
  let from: Record<string, unknown> | undefined;
  const key = opts.prefix ? "pk = :pk AND begins_with(sk, :prefix)" : opts.after ? "pk = :pk AND sk > :after" : "pk = :pk";
  do {
    const got = await db().send(
      new QueryCommand({
        TableName: table(),
        KeyConditionExpression: key,
        ExpressionAttributeValues: { ":pk": pk(a), ...(opts.prefix && { ":prefix": opts.prefix }), ...(!opts.prefix && opts.after && { ":after": opts.after }) },
        ExclusiveStartKey: from,
        ConsistentRead: !!opts.fresh,
      }),
    );
    out.push(...((got.Items ?? []) as Item[]));
    from = got.LastEvaluatedKey;
  } while (from);
  return out;
}

const moveSk = (at: number, who: string, n: number) => `m#${String(at).padStart(13, "0")}#${who}#${String(n).padStart(5, "0")}`;
const CURSOR = /^m#\d{13}$/;

// A game's players and moves. With `after` (from the last look's `next`), only the moves since, give or take a few seconds,
// each with an id to tell them apart by. Within a minute of the end, the first look takes the price it ends at.
export async function log(a: Arena, opts: { fresh?: boolean; after?: string } = {}): Promise<Log & { next: string }> {
  const after = opts.after && CURSOR.test(opts.after) ? opts.after : undefined;
  const all = await items(a, { fresh: opts.fresh, after });
  const now = Date.now();
  let bell = all.find((i) => i.sk === BELL)?.bell;
  if (bell === undefined && now >= a.endsAt && now <= a.endsAt + BELL_WINDOW) bell = await ring(a);
  return {
    players: all.flatMap((i) => (i.player ? [i.player] : [])).sort((x, y) => x.joinedAt - y.joinedAt),
    moves: all.flatMap((i) => (i.move ? [{ ...i.move, id: i.sk.slice(2) }] : [])),
    ...(bell !== undefined && { bell }),
    next: `m#${String(Math.max(0, Math.floor((now - LAG) / LAG) * LAG)).padStart(13, "0")}`,
  };
}

async function ring(a: Arena): Promise<number | undefined> {
  const price = await mark(a.symbol).catch(() => undefined);
  if (price === undefined) return undefined;
  try {
    await db().send(new PutCommand({ TableName: table(), Item: { pk: pk(a), sk: BELL, bell: price, expiresAt: until(a) }, ConditionExpression: "attribute_not_exists(sk)" }));
    return price;
  } catch (err) {
    if ((err as { name?: string }).name !== "ConditionalCheckFailedException") throw err;
    const kept = await db().send(new GetCommand({ TableName: table(), Key: { pk: pk(a), sk: BELL }, ConsistentRead: true }));
    return (kept.Item as Item | undefined)?.bell;
  }
}

// Who's in each game asked about, and in every copy of it run beside it once it filled: under each copy's own id, and
// under the game's id, the copy a new player would sit in.
export async function lobby(ids: string[]): Promise<Record<string, Player[]>> {
  const all = await symbols();
  const arenas = ids.map((id) => arenaOf(id, all)).filter((a): a is Arena => !!a);
  const out: Record<string, Player[]> = {};
  await Promise.all(
    arenas.map(async (a) => {
      for (let n = a.shard ?? 0; n < SHARDS; n++) {
        const s = shardOf(a, n, all);
        const players = (await items(s, { prefix: "p#" })).flatMap((x) => (x.player ? [x.player] : []));
        out[s.id] = players;
        if (players.length < SEATS) {
          out[a.id] = players;
          break;
        }
      }
    }),
  );
  return out;
}

const seatAt = async (a: Arena, id: string) => (await db().send(new GetCommand({ TableName: table(), Key: { pk: pk(a), sk: `p#${id}` }, ConsistentRead: true }))).Item as Item | undefined;

// The Strike account a signed GET /v2/account belongs to, by asking Strike with it while its timestamp still holds.
export type Proof = { key: string; signature: string; timestamp: string; nonce: string };
async function accountOf(proof: unknown): Promise<string> {
  const p = proof as Partial<Proof> | null;
  const ok = (v: unknown, re: RegExp) => typeof v === "string" && re.test(v);
  if (!p || !ok(p.key, /^[0-9a-f]{64}$/) || !ok(p.signature, /^[0-9a-f]{128}$/) || !ok(p.timestamp, /^\d{9,11}$/) || !ok(p.nonce, /^[0-9a-f-]{36}$/)) throw new Refused("That's not a Strike sign-in", 401);
  const res = await fetch(`${REST}/v2/account`, {
    headers: { "X-API-Wallet-Public-Key": p.key!, "X-API-Wallet-Signature": p.signature!, "X-API-Wallet-Timestamp": p.timestamp!, "X-API-Wallet-Nonce": p.nonce! },
    cache: "no-store",
  }).catch(() => null);
  if (!res) throw new Refused("Can't reach Strike", 502);
  if (!res.ok) throw new Refused("Strike didn't know that sign-in", 401);
  const account = ((await res.json().catch(() => ({}))) as { account_id?: unknown }).account_id;
  if (typeof account !== "string" && typeof account !== "number") throw new Refused("Strike didn't say whose account that is", 502);
  return String(account);
}

// Taking a seat: in the game asked for, or the next copy of it with room. A player signed in to Strike (with `proof`) sits as
// their account, and any device of theirs that proves it takes the same seat back; anyone else sits as their browser's secret.
export async function join(a: Arena, body: Record<string, unknown>): Promise<{ player: Player; arena: Arena }> {
  const device = playerOf(body.secret);
  const name = nameOf(body.name);
  const role = body.role as Role;
  if (!device) throw new Refused("Who are you?", 401);
  if (!name) throw new Refused("Pick a name of 2 to 20 letters and numbers");
  if (typeof role !== "string" || !Object.hasOwn(ROLES, role)) throw new Refused("Pick a ghost");
  const id = body.proof ? accountSeat(await accountOf(body.proof)) : device;
  const all = await symbols();
  for (let n = a.shard ?? 0; n < SHARDS; n++) {
    const s = shardOf(a, n, all);
    const kept = await seatAt(s, id);
    if (kept?.player) {
      if (id !== device) await db().send(new UpdateCommand({ TableName: table(), Key: { pk: pk(s), sk: `p#${id}` }, UpdateExpression: "ADD devices :d", ExpressionAttributeValues: { ":d": new Set([device]) } }));
      return { player: kept.player, arena: s };
    }
    if (!doorsOpen(s, Date.now())) throw new Refused("That game has started without you", 409);
    const player = await sit(s, id, device, name, role, body.live === true);
    if (player) return { player, arena: s };
  }
  throw new Refused("Every game of that kind is full: try the next one", 409);
}

// A seat in one copy of a game, or null when it's full. A name already taken there gets a number after it.
async function sit(a: Arena, id: string, device: string, name: string, role: Role, live: boolean): Promise<Player | null> {
  for (let tries = 1, taken = 0; ; tries++) {
    const player: Player = { id, name: nameFor(name, taken), role, joinedAt: Date.now(), ...(live && { live: true }) };
    try {
      await db().send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: table(),
                Key: { pk: pk(a), sk: "seats" },
                UpdateExpression: "SET expiresAt = :until ADD taken :one",
                ConditionExpression: "attribute_not_exists(taken) OR taken < :seats",
                ExpressionAttributeValues: { ":one": 1, ":seats": SEATS, ":until": until(a) },
              },
            },
            {
              Put: {
                TableName: table(),
                Item: { pk: pk(a), sk: `p#${id}`, player, ...(id !== device && { devices: new Set([device]) }), expiresAt: until(a) },
                ConditionExpression: "attribute_not_exists(sk)",
              },
            },
            { Put: { TableName: table(), Item: { pk: pk(a), sk: `n#${player.name.toLowerCase()}`, expiresAt: until(a) }, ConditionExpression: "attribute_not_exists(sk)" } },
          ],
        }),
      );
      return player;
    } catch (err) {
      const codes = (err as { CancellationReasons?: { Code?: string }[] }).CancellationReasons?.map((r) => r.Code) ?? [];
      // In already, from another tab or device at the same moment.
      if (codes[1] === "ConditionalCheckFailed") return (await seatAt(a, id))!.player!;
      if (codes[0] === "ConditionalCheckFailed") return null;
      if (codes[2] === "ConditionalCheckFailed" && taken < 20) {
        taken++;
        continue;
      }
      // Others taking a seat at the same moment.
      if (codes.includes("TransactionConflict") && tries < 6) await new Promise((r) => setTimeout(r, Math.random() * 100 * tries));
      else throw err;
    }
  }
}

// A move, checked against what the player has on (lib/server/moves.ts) and written with what it leaves them with, both at once:
// a second move racing it from the same player waits its turn rather than slipping past the checks.
export async function act(a: Arena, body: Record<string, unknown>): Promise<Move> {
  const device = playerOf(body.secret);
  if (!device) throw new Refused("Who are you?", 401);
  if (Date.now() < a.startsAt || Date.now() > a.endsAt + 5000) throw new Refused("That game isn't on");
  const id = typeof body.seat === "string" && /^[0-9a-f]{16}$/.test(body.seat) ? body.seat : device;
  for (let tries = 1; ; tries++) {
    const seat = await seatAt(a, id);
    if (!seat?.player || (id !== device && !seat.devices?.has(device))) throw new Refused("You're not in that game", 403);
    const was: State = seat.state ?? { n: 0, lastAt: 0 };
    const now = Math.max(Date.now(), was.lastAt + 1);
    const { move: asked, state } = await rule(a.kind, was, body, now, pricesOf(a));
    const sk = moveSk(now, id, state.n);
    const move: Move = { at: now, who: id, ...asked };
    try {
      await db().send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: table(),
                Key: { pk: pk(a), sk: `p#${id}` },
                UpdateExpression: "SET #state = :state",
                ConditionExpression: was.n ? "#state.n = :n" : "attribute_not_exists(#state)",
                ExpressionAttributeNames: { "#state": "state" },
                ExpressionAttributeValues: { ":state": state, ...(was.n && { ":n": was.n }) },
              },
            },
            { Put: { TableName: table(), Item: { pk: pk(a), sk, move, expiresAt: until(a) } } },
          ],
        }),
      );
      return { ...move, id: sk.slice(2) };
    } catch (err) {
      const codes = (err as { CancellationReasons?: { Code?: string }[] }).CancellationReasons?.map((r) => r.Code) ?? [];
      if ((codes[0] === "ConditionalCheckFailed" || codes.includes("TransactionConflict")) && tries < 5) await new Promise((r) => setTimeout(r, Math.random() * 50 * tries));
      else throw err;
    }
  }
}
