import { createHash } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { arenaOf, doorsOpen, POWER, ROLES, ROSTER, rulesFor, SEATS, SHARDS, shardOf, TOP_STAKE, type Arena, type Log, type Move, type Player, type Role, type Tier } from "../game/war.ts";
import { BUILT, restOf, type Network } from "../strike.ts";
import { backoff, busy, patient } from "./dynamo.ts";
import { GAME, problem } from "./inputs.ts";
import { Refused, rule, type Edge, type Prices, type State } from "./moves.ts";

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
      retryStrategy: patient(),
      ...(roleArn && { credentials: awsCredentialsProvider({ roleArn }) }),
      ...(endpoint && { endpoint, credentials: { accessKeyId: "local", secretAccessKey: "local" } }),
    }),
    { marshallOptions: { removeUndefinedValues: true } },
  );
  return client;
}
const table = () => process.env.ARENAS_TABLE!;

// A game on one of Strike's networks: the same games run on each, with their own players and prices.
export type Game = Arena & { net?: Network };
const netIn = (a: Game): Network => a.net ?? BUILT;
const copyOf = (a: Game, n: number, all: string[]): Game => ({ ...shardOf(a, n, all), net: netIn(a) });

// A game's seat count, players, names and moves share its partition, and go a day after it ends. Moves sort first,
// then names (n#), players (p#), the seat count and the bell (x#), so a look from a move on picks up everything else too.
const pk = (a: Game) => `${netIn(a)}#${a.id}`;
const until = (a: Arena) => Math.ceil(a.endsAt / 1000) + 86_400;
const NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]{1,19}$/;
const BELL = "x#bell";
// How far back each look reaches past the last, so a move that took a moment to land isn't missed.
const LAG = 5000;
// The bell is only taken by a look within this of the end, so a late look can't set it from a price long after.
const BELL_WINDOW = 60_000;

// Every ask of Strike gives up after a few seconds, so a move never hangs on it.
const ask = (url: string, init: RequestInit = {}) => fetch(url, { cache: "no-store", ...init, signal: AbortSignal.timeout(4000) });

type Info = { at: number; symbols: string[]; ticks: Map<string, number> };
const markets = new Map<Network, Info>();
async function info(net: Network): Promise<Info> {
  const kept = markets.get(net);
  if (kept && Date.now() - kept.at < 600_000) return kept;
  const res = await ask(`${restOf(net)}/price/v2/exchangeInfo`).catch(() => null);
  if (!res?.ok) throw new Refused("Can't reach Strike", 502);
  const got = (await res.json()) as { symbols: { symbol: string; status: string; filters?: { filterType: string; tickSize?: string }[] }[] };
  const trading = got.symbols.filter((s) => s.status === "trading");
  const ticks = new Map(trading.map((s) => [s.symbol, Number(s.filters?.find((f) => f.filterType === "PRICE_FILTER")?.tickSize) || 0]));
  const now = { at: Date.now(), symbols: trading.map((s) => s.symbol), ticks };
  markets.set(net, now);
  return now;
}
const symbols = async (net: Network) => (await info(net)).symbols;

// The most power each market lets the game's stakes carry, from Strike's margin tiers, as the players' own screens work it out.
const powers = new Map<Network, { at: number; most: Map<string, number> }>();
async function mostPower(net: Network, symbol: string): Promise<number> {
  let kept = powers.get(net);
  if (!kept || Date.now() - kept.at > 600_000) {
    type Raw = { max_notional: string; max_leverage: number; maintenance_margin_rate: string; maintenance_amount: string };
    const res = await ask(`${restOf(net)}/v2/markets`).catch(() => null);
    const got = res?.ok ? ((await res.json().catch(() => null)) as { markets?: Record<string, { margin_tiers?: Raw[] }> } | null) : null;
    if (got?.markets) {
      const most = new Map<string, number>();
      for (const [sym, m] of Object.entries(got.markets)) {
        const tiers: Tier[] = (m.margin_tiers ?? []).map((t) => ({ maxNotional: Number(t.max_notional), maxPower: t.max_leverage, mmr: Number(t.maintenance_margin_rate), amount: Number(t.maintenance_amount) }));
        most.set(sym, rulesFor(tiers, TOP_STAKE).maxPower);
      }
      kept = { at: Date.now(), most };
      powers.set(net, kept);
    }
  }
  return kept?.most.get(symbol) ?? POWER.max;
}

// Strike publishes its mark every few seconds, so one asked for within a moment is as good as a new one, and a crowd
// of moves at once asks Strike once.
const MARK_MS = 1500;
const marks = new Map<string, { at: number; p: Promise<number> }>();
function mark(net: Network, symbol: string, fresh = false): Promise<number> {
  const key = `${net}|${symbol}`;
  const kept = marks.get(key);
  if (kept && !fresh && Date.now() - kept.at < MARK_MS) return kept.p;
  const p = ask(`${restOf(net)}/price/v2/markPrice?symbol=${encodeURIComponent(symbol)}`)
    .then(async (res) => (res.ok ? Number(((await res.json()) as { p?: string }).p) : NaN))
    .catch(() => NaN)
    .then((n) => {
      if (!Number.isFinite(n) || n <= 0) throw new Refused("Can't reach Strike's price", 502);
      return n;
    });
  const entry = { at: Date.now(), p };
  marks.set(key, entry);
  p.catch(() => marks.get(key) === entry && marks.delete(key));
  return p;
}

type Row = [number, string, string, string, string];
async function candles(net: Network, symbol: string, interval: "1m" | "15m", limit: number): Promise<Row[]> {
  const query = new URLSearchParams({ symbol, interval, limit: String(limit), priceType: "mark" });
  const res = await ask(`${restOf(net)}/price/v2/klines?${query}`).catch(() => null);
  if (!res?.ok) throw new Refused("Can't reach Strike's price", 502);
  return (await res.json()) as Row[];
}

// The minute's candle so far: its low going down, its high going up. Taken as graves or a thundercloud go down.
async function edge(net: Network, symbol: string, way: "down" | "up"): Promise<Edge | undefined> {
  const [row] = (await candles(net, symbol, "1m", 1).catch(() => [])).slice(-1);
  return row && { t: row[0], x: Number(way === "down" ? row[3] : row[2]) };
}

// Whether Strike's mark has been down to (or up to) a price since a time: right now, in a candle that started after it, or
// in the candle it was in, if that candle went past where it had got to by then. Only candles allow half a tick, for rounding.
async function reached(net: Network, symbol: string, tick: number, way: "down" | "up", price: number, since: number, at?: Edge): Promise<boolean> {
  const now = await mark(net, symbol, true);
  if (way === "down" ? now <= price : now >= price) return true;
  const slack = tick / 2;
  const hit = (p: number) => (way === "down" ? p <= price + slack : p >= price - slack);
  const beyond = (p: number, x: number) => (way === "down" ? p < x : p > x);
  const span = Math.max(0, Date.now() - since);
  const interval = span > 480 * 60_000 ? "15m" : "1m";
  const ms = interval === "1m" ? 60_000 : 900_000;
  const rows = await candles(net, symbol, interval, Math.min(500, Math.ceil(span / ms) + 2));
  return rows.some(([t, , h, l]) => {
    const p = Number(way === "down" ? l : h);
    if (t >= since) return hit(p);
    return interval === "1m" && t + ms > since && !!at && at.t === t && beyond(p, at.x) && hit(p);
  });
}

const pricesOf = (a: Game): Prices => {
  const net = netIn(a);
  const tick = async () => (await info(net)).ticks.get(a.symbol) || 0;
  return {
    mark: () => mark(net, a.symbol),
    tick,
    most: () => mostPower(net, a.symbol),
    edge: (way) => edge(net, a.symbol, way),
    reached: async (way, price, since, at) => reached(net, a.symbol, await tick(), way, price, since, at),
  };
};

export const online = () => !!process.env.ARENAS_TABLE;

// Settings that are there but wrong, said once in the logs and to every caller, rather than the game quietly going offline.
let said = false;
export function misconfigured(): string | null {
  const wrong = problem();
  if (wrong && !said) {
    said = true;
    console.error(`game server misconfigured: ${wrong}`);
  }
  return wrong;
}

export async function arena(id: string, net: Network = BUILT): Promise<Game> {
  if (!GAME.test(id)) throw new Refused("No such game", 404);
  const a = arenaOf(id, await symbols(net));
  if (!a) throw new Refused("No such game", 404);
  return { ...a, net };
}

const short = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);
export const playerOf = (secret: unknown) => (typeof secret === "string" && /^[0-9a-f]{64}$/.test(secret) ? short(secret) : null);
// A player signed in to Strike sits as their Strike account, so the seat follows them to any device signed in to it.
const accountSeat = (net: Network, account: string) => short(`strike:${net}:${account}`);

export function nameOf(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const clean = name.trim().replace(/\s+/g, " ");
  const lower = clean.toLowerCase();
  return NAME.test(clean) && lower !== "you" && !ROSTER.some((r) => r.toLowerCase() === lower) ? clean : null;
}

// A second player with a name already taken in the game gets a number after it.
const nameFor = (name: string, tries: number) => (tries ? `${name.slice(0, 20 - String(tries + 1).length - 1)} ${tries + 1}` : name);

type Item = { pk: string; sk: string; player?: Player; move?: Move; state?: State; devices?: Set<string>; bell?: number; taken?: number };

async function items(a: Game, opts: { prefix?: string; after?: string; fresh?: boolean } = {}): Promise<Item[]> {
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
export async function log(a: Game, opts: { fresh?: boolean; after?: string } = {}): Promise<Log & { next: string }> {
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

async function ring(a: Game): Promise<number | undefined> {
  const price = await mark(netIn(a), a.symbol).catch(() => undefined);
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

// The first copy of each game that may still have room. Copies only ever fill up, so the ones before it are never asked again.
const rooms = new Map<string, { n: number; at: number }>();
const roomKey = (a: Game, all: string[]) => pk(copyOf(a, 0, all));
const firstRoom = (a: Game, all: string[]) => {
  const kept = rooms.get(roomKey(a, all));
  return Math.max(a.shard ?? 0, kept && Date.now() - kept.at < 60_000 ? kept.n : 0);
};
const roomAt = (a: Game, all: string[], n: number) => {
  const key = roomKey(a, all);
  if ((rooms.get(key)?.n ?? 0) <= n || Date.now() - (rooms.get(key)?.at ?? 0) >= 60_000) rooms.set(key, { n, at: Date.now() });
};

// Who's in each game asked about, and in every copy of it run beside it once it filled: under each copy's own id, and
// under the game's id, the copy a new player would sit in.
export async function lobby(ids: string[], net: Network = BUILT): Promise<Record<string, Player[]>> {
  const all = await symbols(net);
  const arenas = ids.flatMap((id): Game[] => {
    const a = GAME.test(id) ? arenaOf(id, all) : null;
    return a ? [{ ...a, net }] : [];
  });
  const out: Record<string, Player[]> = {};
  await Promise.all(
    arenas.map(async (a) => {
      for (let n = firstRoom(a, all); n < SHARDS; n++) {
        const s = copyOf(a, n, all);
        const players = (await items(s, { prefix: "p#" })).flatMap((x) => (x.player ? [x.player] : []));
        out[s.id] = players;
        if (players.length < SEATS) {
          out[a.id] = players;
          roomAt(a, all, n);
          break;
        }
      }
    }),
  );
  return out;
}

const seatAt = async (a: Game, id: string) => (await db().send(new GetCommand({ TableName: table(), Key: { pk: pk(a), sk: `p#${id}` }, ConsistentRead: true }))).Item as Item | undefined;
// The seat signed in to Strike that a browser has taken in a game, so the same browser can't take a second one on paper.
const linkOf = async (a: Game, device: string) =>
  ((await db().send(new GetCommand({ TableName: table(), Key: { pk: pk(a), sk: `d#${device}` }, ConsistentRead: true }))).Item as { seat?: string } | undefined)?.seat;
const link = (a: Game, id: string, device: string) =>
  db().send(
    new TransactWriteCommand({
      TransactItems: [
        { Update: { TableName: table(), Key: { pk: pk(a), sk: `p#${id}` }, UpdateExpression: "ADD devices :d", ExpressionAttributeValues: { ":d": new Set([device]) } } },
        { Put: { TableName: table(), Item: { pk: pk(a), sk: `d#${device}`, seat: id, expiresAt: until(a) } } },
      ],
    }),
  );

// A seat this browser already has in one copy of a game: as asked, its own on paper while signing in, or the signed in
// seat it took before while asking on paper. One human, one seat.
async function already(s: Game, id: string, device: string): Promise<Player | undefined> {
  const [mine, paper, linked] = await Promise.all([seatAt(s, id), id !== device ? seatAt(s, device) : undefined, id === device ? linkOf(s, device) : undefined]);
  if (mine?.player) {
    if (id !== device && !mine.devices?.has(device)) await link(s, id, device);
    return mine.player;
  }
  if (paper?.player) return paper.player;
  if (linked) return (await seatAt(s, linked))?.player;
}

// The Strike account a signed GET /v2/account belongs to, by asking Strike with it while its timestamp still holds.
export type Proof = { key: string; signature: string; timestamp: string; nonce: string };
async function accountOf(proof: unknown, net: Network): Promise<string> {
  const p = proof as Partial<Proof> | null;
  const ok = (v: unknown, re: RegExp) => typeof v === "string" && re.test(v);
  if (!p || !ok(p.key, /^[0-9a-f]{64}$/) || !ok(p.signature, /^[0-9a-f]{128}$/) || !ok(p.timestamp, /^\d{9,11}$/) || !ok(p.nonce, /^[0-9a-f-]{36}$/)) throw new Refused("That's not a Strike sign-in", 401);
  const res = await ask(`${restOf(net)}/v2/account`, {
    headers: { "X-API-Wallet-Public-Key": p.key!, "X-API-Wallet-Signature": p.signature!, "X-API-Wallet-Timestamp": p.timestamp!, "X-API-Wallet-Nonce": p.nonce! },
  }).catch(() => null);
  if (!res) throw new Refused("Can't reach Strike", 502);
  if (!res.ok) throw new Refused("Strike didn't know that sign-in", 401);
  const account = ((await res.json().catch(() => ({}))) as { account_id?: unknown }).account_id;
  if (typeof account !== "string" && typeof account !== "number") throw new Refused("Strike didn't say whose account that is", 502);
  return String(account);
}

// Taking a seat: in the game asked for, or the next copy of it with room. A player signed in to Strike (with `proof`) sits as
// their account, and any device of theirs that proves it takes the same seat back; anyone else sits as their browser's secret.
export async function join(a: Game, body: Record<string, unknown>): Promise<{ player: Player; arena: Game }> {
  const device = playerOf(body.secret);
  const name = nameOf(body.name);
  const role = body.role as Role;
  if (!device) throw new Refused("Who are you?", 401);
  if (!name) throw new Refused("Pick a name of 2 to 20 letters and numbers");
  if (typeof role !== "string" || !Object.hasOwn(ROLES, role)) throw new Refused("Pick a ghost");
  const id = body.proof ? accountSeat(netIn(a), await accountOf(body.proof, netIn(a))) : device;
  const all = await symbols(netIn(a));
  const from = a.shard ?? 0;
  const first = firstRoom(a, all);
  // Copies known to be full are only looked at for a seat this browser already has there.
  const full = Array.from({ length: first - from }, (_, i) => copyOf(a, from + i, all));
  const found = await Promise.all(full.map((s) => already(s, id, device)));
  const at = found.findIndex(Boolean);
  if (at >= 0) return { player: found[at]!, arena: full[at] };
  for (let n = first; n < SHARDS; n++) {
    const s = copyOf(a, n, all);
    const kept = await already(s, id, device);
    if (kept) return { player: kept, arena: s };
    if (!doorsOpen(s, Date.now())) throw new Refused("That game has started without you", 409);
    const player = await sit(s, id, device, name, role, body.live === true);
    if (player) {
      roomAt(a, all, n);
      return { player, arena: s };
    }
    roomAt(a, all, n + 1);
  }
  throw new Refused("Every game of that kind is full: try the next one", 409);
}

// A seat in one copy of a game, or null when it's full. A name already taken there gets a number after it.
async function sit(a: Game, id: string, device: string, name: string, role: Role, live: boolean): Promise<Player | null> {
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
            ...(id !== device ? [{ Put: { TableName: table(), Item: { pk: pk(a), sk: `d#${device}`, seat: id, expiresAt: until(a) } } }] : []),
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
      // Others taking a seat at the same moment, or the table too busy for a moment.
      if ((codes.includes("TransactionConflict") || busy(err)) && tries < 6) await new Promise((r) => setTimeout(r, backoff(tries, busy(err))));
      else throw err;
    }
  }
}

// A move, checked against what the player has on (lib/server/moves.ts) and written with what it leaves them with, both at once:
// a second move racing it from the same player waits its turn rather than slipping past the checks. A move sent again with
// the same key, because the answer to it got lost, gets back the move that went in the first time rather than a second.
const KEY = /^[0-9a-f-]{16,64}$/i;
export async function act(a: Game, body: Record<string, unknown>): Promise<Move> {
  const device = playerOf(body.secret);
  if (!device) throw new Refused("Who are you?", 401);
  if (Date.now() < a.startsAt || Date.now() > a.endsAt + 5000) throw new Refused("That game isn't on");
  const id = typeof body.seat === "string" && /^[0-9a-f]{16}$/.test(body.seat) ? body.seat : device;
  const key = typeof body.key === "string" && KEY.test(body.key) ? body.key : undefined;
  for (let tries = 1; ; tries++) {
    const seat = await seatAt(a, id);
    if (!seat?.player || (id !== device && !seat.devices?.has(device))) throw new Refused("You're not in that game", 403);
    const was: State = seat.state ?? { n: 0, lastAt: 0 };
    if (key && was.k === key && was.sk) {
      const kept = (await db().send(new GetCommand({ TableName: table(), Key: { pk: pk(a), sk: was.sk }, ConsistentRead: true }))).Item as Item | undefined;
      if (kept?.move) return { ...kept.move, id: was.sk.slice(2) };
    }
    const now = Math.max(Date.now(), was.lastAt + 1);
    const { move: asked, state: after } = await rule(a.kind, was, body, now, pricesOf(a));
    const sk = moveSk(now, id, after.n);
    const state: State = { ...after, k: key, sk: key && sk };
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
      if ((codes[0] === "ConditionalCheckFailed" || codes.includes("TransactionConflict") || busy(err)) && tries < 6) await new Promise((r) => setTimeout(r, backoff(tries, busy(err))));
      else throw err;
    }
  }
}
