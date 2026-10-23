import { ROSTER, type Log, type Move, type Player, type Role } from "./game/war";
import { signedHeaders, type Keys } from "./live/keys";
import { PREFIX } from "./store";
import { NETWORK } from "./strike";

// `chosen` once the player has typed a name of their own, so a nickname from Strike doesn't write over it.
export type Me = { id: string; secret: string; name: string; chosen?: boolean };

const KEY = `${PREFIX}me`;
const FIRST = ["Neon", "Turbo", "Lucky", "Rapid", "Silent", "Cosmic", "Iron", "Golden", "Wild", "Shadow", "Crimson", "Frost", "Solar", "Atomic", "Mega"];
const LAST = ["Comet", "Tiger", "Falcon", "Viper", "Panda", "Rocket", "Ninja", "Otter", "Raven", "Lynx", "Shark", "Mantis", "Wolf", "Dragon", "Yeti"];
const pick = (from: string[]) => from[Math.floor(Math.random() * from.length)];

export const NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]{1,19}$/;

const hex = (bytes: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");

export async function me(): Promise<Me> {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? "null") as Me | null;
    if (kept?.id && kept.secret && kept.name) return kept;
  } catch {}
  const secret = hex(crypto.getRandomValues(new Uint8Array(32)));
  const id = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret))).slice(0, 16);
  const made = { id, secret, name: `${pick(FIRST)} ${pick(LAST)} ${10 + Math.floor(Math.random() * 90)}` };
  try {
    localStorage.setItem(KEY, JSON.stringify(made));
  } catch {}
  return made;
}

export async function rename(name: string, chosen = true): Promise<Me | null> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!NAME.test(clean)) return null;
  const now = { ...(await me()), name: clean, chosen };
  try {
    localStorage.setItem(KEY, JSON.stringify(now));
  } catch {}
  return now;
}

// A Strike nickname as a name the board takes: only its letters, numbers, spaces and _ . -, at most 20 long, and not a bot's.
export function asName(nickname: string): string | null {
  const clean = nickname.replace(/[^A-Za-z0-9 _.-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 20).trim();
  const lower = clean.toLowerCase();
  return NAME.test(clean) && lower !== "you" && !ROSTER.some((r) => r.toLowerCase() === lower) ? clean : null;
}

// Takes the nickname from a player's Strike account as their name here, unless they've chosen one of their own.
export async function adopt(nickname: string): Promise<Me | null> {
  const name = asName(nickname);
  const kept = await me();
  if (!name || kept.chosen || kept.name === name) return null;
  return rename(name, false);
}

// The game server's clock, less ours: its times come back onto this browser's clock with it. Only taken from answers made just
// for us (never a cached one), and kept from the quickest round trip, where the guess of when it was made is closest.
let skew = 0;
let timed = false;
let quickest = Infinity;
const local = (log: Log): Log => ({
  players: log.players.map((p) => ({ ...p, joinedAt: p.joinedAt - skew })),
  moves: log.moves.map((m) => ({ ...m, at: m.at - skew })),
});

export class Full extends Error {}
// The game server asked for a pause: nothing more goes its way until it's over.
export class Wait extends Error {}
class Down extends Error {}
class Lost extends Error {}

// Once the game server says it's offline, this browser plays on with bots and stops asking.
let offline = false;

// Until when each of the game server's routes asked to be left alone, from its Retry-After: a minute if it doesn't say, five at most.
const held = new Map<string, number>();
const routeOf = (path: string) => (path.startsWith("/api/arenas/") ? "game" : path.split("?")[0]);
function holdFrom(res: Response): number {
  const said = res.headers.get("retry-after")?.trim() ?? "";
  const secs = /^\d+$/.test(said) ? Number(said) : said ? (Date.parse(said) - Date.now()) / 1000 : NaN;
  return Math.min(300, Math.max(1, Number.isFinite(secs) ? secs : 60)) * 1000;
}
const wait = (ms: number) => new Wait(`The game server asked us to wait ${Math.ceil(ms / 1000)} s`);

async function send<T>(path: string, init?: RequestInit, fresh = init?.method === "POST"): Promise<T | null> {
  if (offline) return null;
  const route = routeOf(path);
  const left = (held.get(route) ?? 0) - Date.now();
  if (left > 0) throw wait(left);
  const sent = Date.now();
  const res = await fetch(path, init).catch(() => null);
  if (!res) throw new Lost("Can't reach the game server");
  if (res.status === 503) {
    offline = true;
    return null;
  }
  if (res.status === 429) {
    const ms = holdFrom(res);
    held.set(route, Date.now() + ms);
    throw wait(ms);
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; now?: number };
  if (res.status === 409) throw new Full(body.error ?? "That game is full");
  if (res.status >= 500) throw new Down(body.error ?? `The game said ${res.status}`);
  if (!res.ok) throw new Error(body.error ?? `The game said ${res.status}`);
  const trip = Date.now() - sent;
  const cached = Number(res.headers.get("age") ?? 0) > 0;
  if (body.now && fresh && !cached && trip <= quickest) {
    skew = body.now - (sent + Date.now()) / 2;
    quickest = trip;
    timed = true;
  }
  return body;
}

// Proof of the Strike account a key belongs to, for the game server to check with Strike: so a seat taken signed in follows the account.
async function proofOf(keys: Keys) {
  const h = await signedHeaders(keys, "GET", "/v2/account");
  return { key: h["X-API-Wallet-Public-Key"], signature: h["X-API-Wallet-Signature"], timestamp: h["X-API-Wallet-Timestamp"], nonce: h["X-API-Wallet-Nonce"] };
}

// Taking a seat: in that game, or a copy of it beside it when it's full (`arena` says which). Signed in to Strike, the seat is
// the account's, and taken back from any device signed in to it. Null when the game server isn't reachable or is down, so the
// haunt goes on with bots alone.
export async function join(arena: string, role: Role, live: boolean, keys?: Keys): Promise<{ me: string; arena: string; joinedAt: number; log: Log } | null> {
  const { secret, name } = await me();
  const proof = keys ? await proofOf(keys).catch(() => undefined) : undefined;
  const got = await send<{ player: Player; arena?: string; log: Log }>(`/api/arenas/${arena}?net=${NETWORK}`, { method: "POST", body: JSON.stringify({ secret, name, role, live, what: "join", ...(proof && { proof }) }) }).catch((err) => {
    if (err instanceof Down || err instanceof Lost) return null;
    throw err;
  });
  return got && { me: got.player.id, arena: got.arena ?? arena, joinedAt: got.player.joinedAt - skew, log: local(got.log) };
}

// A move in a game, as the seat it was taken as. Only a move that may not have arrived (no answer, or the server failing) is sent
// again, with the same key so the game server keeps it once; one turned away stays turned away.
export async function tell(arena: string, seat: string, move: Omit<Move, "at" | "who">): Promise<void> {
  const { secret } = await me();
  const key = crypto.randomUUID();
  for (let tries = 0; ; tries++) {
    try {
      await send(`/api/arenas/${arena}?net=${NETWORK}`, { method: "POST", body: JSON.stringify({ ...move, secret, seat, key }) });
      return;
    } catch (err) {
      if (!(err instanceof Down || err instanceof Lost) || tries >= 2) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** tries + Math.random() * 250));
    }
  }
}

// What's happened in a game: all of it, or with `after` (a look's `next`) only what's new since, a few seconds over.
export async function look(arena: string, after?: string): Promise<Log | null> {
  const query = new URLSearchParams({ net: NETWORK, ...(after && { after }), ...(!timed && { t: String(Date.now()) }) }).toString();
  const got = await send<Log>(`/api/arenas/${arena}?${query}`, undefined, !timed).catch(() => null);
  return got && local(got);
}

// The moves of a game seen so far, in the order they came in: a look's new ones are added on, and ones already in are left.
export function gather(had: Log | undefined, got: Log): Log {
  if (!had) return got;
  const ids = new Set(had.moves.flatMap((m) => (m.id ? [m.id] : [])));
  const fresh = got.moves.filter((m) => !m.id || !ids.has(m.id));
  return { players: got.players.length >= had.players.length ? got.players : had.players, moves: fresh.length ? [...had.moves, ...fresh] : had.moves, bell: got.bell ?? had.bell, next: got.next ?? had.next };
}

export async function lobbies(ids: string[]): Promise<Record<string, Player[]>> {
  const got = await send<Record<string, Player[]>>(`/api/arenas?ids=${ids.join(",")}&net=${NETWORK}`).catch(() => null);
  return got ?? {};
}
