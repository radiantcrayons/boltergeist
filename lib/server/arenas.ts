import { createHash, randomBytes } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { arenaOf, doorsOpen, ROLES, ROSTER, SEATS, type Arena, type Log, type Move, type Player, type Role, type Side } from "../game/war.ts";
import { NETWORK, REST } from "../strike.ts";

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

export class Refused extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// A fight's seat count, players and moves share its partition, and go a day after it ends.
const pk = (a: Arena) => `${NETWORK}#${a.id}`;
const until = (a: Arena) => Math.ceil(a.endsAt / 1000) + 86_400;
const NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]{1,19}$/;
// A price called or banked at has to be within this of Strike's mark when it comes in.
const SLACK = 0.01;
const REACH = 0.2;

let markets: { at: number; symbols: string[] } | null = null;
async function symbols(): Promise<string[]> {
  if (markets && Date.now() - markets.at < 600_000) return markets.symbols;
  const res = await fetch(`${REST}/price/v2/exchangeInfo`, { cache: "no-store" });
  if (!res.ok) throw new Refused("Can't reach Strike", 502);
  const info = (await res.json()) as { symbols: { symbol: string; status: string }[] };
  markets = { at: Date.now(), symbols: info.symbols.filter((s) => s.status === "trading").map((s) => s.symbol) };
  return markets.symbols;
}

async function mark(symbol: string): Promise<number> {
  const res = await fetch(`${REST}/price/v2/markPrice?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
  const p = res.ok ? Number(((await res.json()) as { p?: string }).p) : NaN;
  if (!Number.isFinite(p) || p <= 0) throw new Refused("Can't reach Strike's price", 502);
  return p;
}

export const online = () => !!process.env.ARENAS_TABLE;

export async function arena(id: string): Promise<Arena> {
  const a = arenaOf(id, await symbols());
  if (!a) throw new Refused("No such game", 404);
  return a;
}

export const playerOf = (secret: unknown) => (typeof secret === "string" && /^[0-9a-f]{64}$/.test(secret) ? createHash("sha256").update(secret).digest("hex").slice(0, 16) : null);

export function nameOf(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const clean = name.trim().replace(/\s+/g, " ");
  const lower = clean.toLowerCase();
  return NAME.test(clean) && lower !== "you" && !ROSTER.some((r) => r.toLowerCase() === lower) ? clean : null;
}

async function items(a: Arena, prefix = "", fresh = false): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let from: Record<string, unknown> | undefined;
  do {
    const got = await db().send(
      new QueryCommand({
        TableName: table(),
        KeyConditionExpression: prefix ? "pk = :pk AND begins_with(sk, :prefix)" : "pk = :pk",
        ExpressionAttributeValues: { ":pk": pk(a), ...(prefix && { ":prefix": prefix }) },
        ExclusiveStartKey: from,
        ConsistentRead: fresh,
      }),
    );
    out.push(...(got.Items ?? []));
    from = got.LastEvaluatedKey;
  } while (from);
  return out;
}

export async function log(a: Arena, fresh = false): Promise<Log> {
  const all = await items(a, "", fresh);
  return {
    players: all.flatMap((i) => (i.player ? [i.player as Player] : [])).sort((x, y) => x.joinedAt - y.joinedAt),
    moves: all.flatMap((i) => (i.move ? [i.move as Move] : [])),
  };
}

export async function lobby(ids: string[]): Promise<Record<string, Player[]>> {
  const all = await symbols();
  const arenas = ids.map((id) => arenaOf(id, all)).filter((a): a is Arena => !!a);
  const got = await Promise.all(arenas.map((a) => items(a, "p#")));
  return Object.fromEntries(arenas.map((a, i) => [a.id, got[i].map((x) => x.player as Player)]));
}

const seated = async (a: Arena, id: string) => (await db().send(new GetCommand({ TableName: table(), Key: { pk: pk(a), sk: `p#${id}` }, ConsistentRead: true }))).Item?.player as Player | undefined;

export async function join(a: Arena, body: Record<string, unknown>): Promise<Player> {
  const id = playerOf(body.secret);
  const name = nameOf(body.name);
  const role = body.role as Role;
  if (!id) throw new Refused("Who are you?", 401);
  if (!name) throw new Refused("Pick a name of 2 to 20 letters and numbers");
  if (!(role in ROLES)) throw new Refused("Pick a ghost");
  const now = Date.now();
  const kept = await seated(a, id);
  if (kept) return kept;
  if (!doorsOpen(a, now)) throw new Refused("That game has started without you", 409);
  const player: Player = { id, name, role, joinedAt: now, ...(body.live === true && { live: true }) };
  for (let tries = 1; ; tries++) {
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
            { Put: { TableName: table(), Item: { pk: pk(a), sk: `p#${id}`, player, expiresAt: until(a) }, ConditionExpression: "attribute_not_exists(sk)" } },
          ],
        }),
      );
      return player;
    } catch (err) {
      const codes = (err as { CancellationReasons?: { Code?: string }[] }).CancellationReasons?.map((r) => r.Code) ?? [];
      // In already, from another tab at the same moment.
      if (codes[1] === "ConditionalCheckFailed") return (await seated(a, id))!;
      if (codes[0] === "ConditionalCheckFailed") throw new Refused("That game is full: try the next one", 409);
      // Others taking a seat at the same moment.
      if (codes.includes("TransactionConflict") && tries < 6) await new Promise((r) => setTimeout(r, Math.random() * 100 * tries));
      else throw err;
    }
  }
}

export async function act(a: Arena, body: Record<string, unknown>): Promise<Move> {
  const who = playerOf(body.secret);
  if (!who) throw new Refused("Who are you?", 401);
  const now = Date.now();
  if (now < a.startsAt || now > a.endsAt + 5000) throw new Refused("That game isn't on");
  if (!(await seated(a, who))) throw new Refused("You're not in that game", 403);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);
  const live = body.live === true;
  // Calls, fills and banks happen at Strike's price; traps and flags wait for it, so only have to be within reach of it.
  const near = async (p: number | undefined, slack = SLACK) => {
    if (!p) throw new Refused("At what price?");
    const m = await mark(a.symbol);
    if (Math.abs(p / m - 1) > slack) throw new Refused("That's not Strike's price");
    return p;
  };
  const sided = () => {
    const side = body.side as Side;
    const power = num(body.power);
    if (side !== "long" && side !== "short") throw new Refused("Long or short?");
    if (!power || !Number.isInteger(power) || power > 100) throw new Refused("How much power?");
    return { side, power };
  };
  let move: Move;
  if (body.what === "call") {
    move = { at: now, who, what: "call", ...sided(), entry: await near(num(body.entry)), ...(live && { live, koAt: num(body.koAt), fee: num(body.fee) }) };
  } else if (body.what === "trap") {
    const flag = num(body.flag);
    move = { at: now, who, what: "trap", ...sided(), price: await near(num(body.price), REACH), ...(flag && { flag: await near(flag, REACH) }) };
  } else if (body.what === "pull") {
    move = { at: now, who, what: "pull" };
  } else if (body.what === "flag") {
    const price = num(body.price);
    move = { at: now, who, what: "flag", ...(price && { price: await near(price, REACH) }) };
  } else if (body.what === "fill") {
    move = { at: now, who, what: "fill", price: await near(num(body.price)) };
  } else if (body.what === "bank") {
    const price = await near(num(body.price));
    move = { at: now, who, what: "bank", price, ...(num(body.flag) === price && { flag: price }), ...(live && { live, value: num(body.value) }) };
  } else if (body.what === "ko") {
    move = { at: now, who, what: "ko", price: num(body.price) };
  } else throw new Refused("Call, trap, flag, bank or K.O.?");
  const sk = `m#${String(now).padStart(13, "0")}#${who}#${randomBytes(3).toString("hex")}`;
  await db().send(new PutCommand({ TableName: table(), Item: { pk: pk(a), sk, move, expiresAt: until(a) } }));
  return move;
}
