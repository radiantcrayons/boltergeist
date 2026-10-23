import type { Log, Move, Player, Role } from "./game/war";
import { PREFIX } from "./store";

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

// The arena's clock, less ours: its times come back onto this browser's clock with it.
let skew = 0;
let timed = false;
const local = (log: Log): Log => ({
  players: log.players.map((p) => ({ ...p, joinedAt: p.joinedAt - skew })),
  moves: log.moves.map((m) => ({ ...m, at: m.at - skew })),
});

export class Full extends Error {}
class Down extends Error {}

// Once the arena says it's offline, this browser plays on with bots and stops asking.
let offline = false;

async function send<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (offline) return null;
  const sent = Date.now();
  const res = await fetch(path, init).catch(() => null);
  if (res?.status === 503) offline = true;
  if (!res || res.status === 503) return null;
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; now?: number };
  if (res.status === 409) throw new Full(body.error ?? "That game is full");
  if (res.status >= 500) throw new Down(body.error ?? `The game said ${res.status}`);
  if (!res.ok) throw new Error(body.error ?? `The game said ${res.status}`);
  if (body.now && (init?.method === "POST" || !timed)) {
    skew = body.now - (sent + Date.now()) / 2;
    timed = true;
  }
  return body;
}

// Taking a seat. Null when the arena isn't reachable or is down, so the fight goes on with bots alone.
export async function join(arena: string, role: Role, live: boolean): Promise<{ me: string; joinedAt: number; log: Log } | null> {
  const { secret, name } = await me();
  const got = await send<{ player: Player; log: Log }>(`/api/arenas/${arena}`, { method: "POST", body: JSON.stringify({ secret, name, role, live, what: "join" }) }).catch((err) => {
    if (err instanceof Down) return null;
    throw err;
  });
  return got && { me: got.player.id, joinedAt: got.player.joinedAt - skew, log: local(got.log) };
}

export async function tell(arena: string, move: Omit<Move, "at" | "who">): Promise<void> {
  const { secret } = await me();
  for (let tries = 0; tries < 3; tries++) {
    try {
      await send(`/api/arenas/${arena}`, { method: "POST", body: JSON.stringify({ ...move, secret }) });
      return;
    } catch (err) {
      if (tries === 2) throw err;
      await new Promise((r) => setTimeout(r, 500 * (tries + 1)));
    }
  }
}

export async function look(arena: string): Promise<Log | null> {
  const got = await send<Log>(`/api/arenas/${arena}${timed ? "" : `?t=${Date.now()}`}`).catch(() => null);
  return got && local(got);
}

export async function lobbies(ids: string[]): Promise<Record<string, Player[]>> {
  const got = await send<Record<string, Player[]>>(`/api/arenas?ids=${ids.join(",")}`).catch(() => null);
  return got ?? {};
}
