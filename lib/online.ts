import type { Log, Move, Player, Role } from "./game/war";
import { signedHeaders, type Keys } from "./live/keys";
import { PREFIX } from "./store";
import { NETWORK } from "./strike";

export type Me = { id: string; secret: string; name: string };

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

export async function rename(name: string): Promise<Me | null> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!NAME.test(clean)) return null;
  const now = { ...(await me()), name: clean };
  try {
    localStorage.setItem(KEY, JSON.stringify(now));
  } catch {}
  return now;
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
class Down extends Error {}

// Once the game server says it's offline, this browser plays on with bots and stops asking.
let offline = false;

async function send<T>(path: string, init?: RequestInit, fresh = init?.method === "POST"): Promise<T | null> {
  if (offline) return null;
  const sent = Date.now();
  const res = await fetch(path, init).catch(() => null);
  if (res?.status === 503) offline = true;
  if (!res || res.status === 503) return null;
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
    if (err instanceof Down) return null;
    throw err;
  });
  return got && { me: got.player.id, arena: got.arena ?? arena, joinedAt: got.player.joinedAt - skew, log: local(got.log) };
}

// A move in a game, as the seat it was taken as.
export async function tell(arena: string, seat: string, move: Omit<Move, "at" | "who">): Promise<void> {
  const { secret } = await me();
  for (let tries = 0; tries < 3; tries++) {
    try {
      await send(`/api/arenas/${arena}?net=${NETWORK}`, { method: "POST", body: JSON.stringify({ ...move, secret, seat }) });
      return;
    } catch (err) {
      if (tries === 2) throw err;
      await new Promise((r) => setTimeout(r, 500 * (tries + 1)));
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
