export type Kind = "skirmish" | "battle" | "war";
export type Role = "soldier" | "commando" | "warlord";
export type Side = "long" | "short";

// A new haunt of each kind starts every `every`, and its doors stay open for the first `doors` of it.
// `reach` is how far from the price a trap usually sits.
export const KINDS: Record<Kind, { name: string; ms: number; every: number; doors: number; length: string; candles: "5s" | "1m" | "15m"; candleMs: number; floors: number[]; reach: number }> = {
  skirmish: { name: "Jump Scare", ms: 10 * 60_000, every: 2 * 60_000, doors: 30_000, length: "10 minutes", candles: "5s", candleMs: 5_000, floors: [2, 4, 7, 12, 20], reach: 0.00025 },
  battle: { name: "Haunting", ms: 3_600_000, every: 15 * 60_000, doors: 5 * 60_000, length: "1 hour", candles: "1m", candleMs: 60_000, floors: [2, 3, 5, 8, 12, 20], reach: 0.001 },
  war: { name: "Curse", ms: 86_400_000, every: 4 * 3_600_000, doors: 3 * 3_600_000, length: "1 day", candles: "15m", candleMs: 900_000, floors: [2, 3, 4, 6, 8, 12], reach: 0.004 },
};

export const ROLES: Record<Role, { name: string; hero: string; stake: number }> = {
  soldier: { name: "Confused", hero: "Slime", stake: 10 },
  commando: { name: "Restless", hero: "Spectre", stake: 50 },
  warlord: { name: "Furious", hero: "Boltergeist", stake: 250 },
};

export const TOP_STAKE = Math.max(...Object.values(ROLES).map((r) => r.stake));

// Every haunt runs on a market the game picks, so everyone in it is on the same chart. Jump Scares get the ones that move most in a minute.
const ROTATION: Record<Kind, string[]> = {
  skirmish: ["ETH-USD", "SOL-USD", "XRP-USD", "HYPE-USD", "DOGE-USD", "ADA-USD", "ZEC-USD"],
  battle: ["BTC-USD", "ETH-USD", "SOL-USD", "XAU-USD", "HYPE-USD", "NVDA-USD", "XRP-USD", "SP500-USD", "DOGE-USD", "TSLA-USD", "ADA-USD", "NAS100-USD"],
  war: ["BTC-USD", "ETH-USD", "SOL-USD", "XAU-USD", "NVDA-USD", "SP500-USD", "XRP-USD", "ADA-USD"],
};

export const POWER = { min: 1, max: 100 };

// Strike's fees each way (takers pay, makers are paid), smallest order in dollars, and an estimated maintenance margin.
export const STRIKE = { taker: 0.0005, maker: -0.00005, minOrder: 10, maintenance: 0.005 };

export function powerWord(p: number): string {
  if (p < 3) return "static";
  if (p < 8) return "charged";
  if (p < 16) return "amped";
  if (p < 31) return "supercharged";
  if (p < 61) return "overloaded";
  return "meltdown";
}

export type Call = {
  side: Side;
  power: number;
  entry: number;
  at: number;
  stake: number;
  fee: number;
  koAt: number;
  best: number;
  live?: string;
  size?: number;
  maker?: boolean;
  flag?: number;
  // A live thundercloud's order on Strike.
  flagOrder?: string;
};

// A maker order waiting below the price (long) or above it (short), with an optional thundercloud to cash in at once it springs.
// A live one is an order on Strike, and springs when Strike fills it rather than by the price here.
export type Trap = { side: Side; power: number; price: number; at: number; flag?: number; live?: string; size?: number };

export type Tier = { maxNotional: number; maxPower: number; mmr: number; amount: number };

export type Rules = { maxPower: number; tiers: Tier[] };

export const DEFAULT_TIERS: Tier[] = [{ maxNotional: 1e15, maxPower: POWER.max, mmr: STRIKE.maintenance, amount: 0 }];

export const DEFAULT_RULES: Rules = { maxPower: POWER.max, tiers: DEFAULT_TIERS };

const tierAt = (tiers: Tier[], notional: number) => tiers.find((t) => notional <= t.maxNotional) ?? tiers[tiers.length - 1];

// The most power a stake can carry: the highest leverage whose position still fits its margin tier.
export function rulesFor(tiers: Tier[], stake: number): Rules {
  if (!tiers.length) return DEFAULT_RULES;
  let p = tiers[0].maxPower;
  while (p > 1 && tierAt(tiers, stake * p).maxPower < p) p--;
  return { maxPower: p, tiers };
}

export type Fill = { entry: number; fee: number; koAt: number; live: string; size: number };

export type Fighter = {
  id: string;
  name: string;
  role: Role;
  stake: number;
  cash: number;
  call: Call | null;
  trap?: Trap | null;
  out: { at: number; price: number; by: "ko" | "zap" } | null;
  // The rounds fought in: in a position at some point in them, one bit each.
  fought: number;
  crits: number;
  // Notional filled as a maker: what this player added to Strike's book.
  liquidity?: number;
  joinedAt?: number;
  live?: boolean;
  nerve?: { power: number; nextAt: number; seed: number };
};

// Another player in the game, and what they do there.
export type Player = { id: string; name: string; role: Role; joinedAt: number; live?: boolean };
export type Move = {
  at: number;
  who: string;
  what: "call" | "bank" | "ko" | "trap" | "pull" | "flag" | "fill";
  side?: Side;
  power?: number;
  entry?: number;
  koAt?: number;
  fee?: number;
  price?: number;
  value?: number;
  flag?: number;
  live?: boolean;
  // The game server's own name for a move, to tell one already seen from a new one.
  id?: string;
};
// `bell` is the price the game ended at, as the game server took it; `next` is where the next look picks up from.
export type Log = { players: Player[]; moves: Move[]; bell?: number; next?: string };
// The moves taken in, by the game server's ids, which start with the time it took them: every one up to `upTo`, and those after.
export type Seen = { upTo?: string; ids: string[] };
const keyOf = (m: Move) => m.id ?? `${m.at}#${m.who}#${m.what}`;
// Ids a couple of minutes older than the moves still coming in are folded into `upTo`, so the list stays short.
const FOLD = 120_000;

export type Event = {
  at: number;
  who: string;
  what: Side | "bank" | "ko" | "zap" | "end" | "join" | "start" | "trap";
  role?: Role;
  power?: number;
  side?: Side;
  stake?: number;
  made?: number;
  move?: number;
  crit?: boolean;
  idle?: boolean;
  price?: number;
  // In by a trap, or out at a thundercloud: as a maker.
  maker?: boolean;
};

export type Arena = { id: string; kind: Kind; symbol: string; opensAt: number; startsAt: number; endsAt: number; shard?: number };

export type Game = {
  id: string;
  kind: Kind;
  symbol: string;
  live?: boolean;
  rules?: Rules;
  startsAt: number;
  endsAt: number;
  fighters: Fighter[];
  price: number;
  at: number;
  over: boolean;
  feed: Event[];
  // Playing online: who you are in the game, and which of its moves are in (a count, in games saved before ids).
  me?: string;
  seen?: Seen | number;
  bell?: number;
};

export const YOU = "you";
// How long after the start the seats stay open, for players on their way in.
export const GRACE = 2000;
export const SEATS = 10;
// How many games of a kind can run side by side when the first fills up.
export const SHARDS = 20;
const RIVALS = SEATS - 1;
const FEED = 40;

export const ROSTER = [
  "Volt Vixen",
  "Captain Candle",
  "Wick Wizard",
  "Doc Dip",
  "Margin Maven",
  "Fomo Fox",
  "Hodl Hawk",
  "Laser Eyes",
  "Rekt Rex",
  "Gigawatt",
  "Thunderclap",
  "Static Sam",
  "Ampere",
  "Ohm Kid",
  "Surge",
  "Flux",
  "Nova",
  "Whale Shark",
  "Moon Mage",
  "The Liquidator",
];
const NERVES = [2, 3, 5, 5, 8, 10, 10, 15, 20, 25, 40, 60];

const HERO_ODDS: [Role, number][] = [
  ["soldier", 0.45],
  ["commando", 0.8],
  ["warlord", 1],
];

const dir = (side: Side) => (side === "long" ? 1 : -1);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const between = (lo: number, hi: number, random: () => number) => lo + (hi - lo) * random();

// Seeded randomness, so every player in a game sees the same rivals do the same things.
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
const step = (seed: number): [number, number] => {
  const next = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(next ^ (next >>> 15), 1 | next);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next >>> 0];
};
const seeded = (seed: number) => {
  let s = seed;
  const random = () => {
    const [n, next] = step(s);
    s = next;
    return n;
  };
  return Object.assign(random, { seed: () => s });
};

const arenaFrom = (kind: Kind, startsAt: number, symbols: string[], shard = 0): Arena => {
  const { every, doors, ms } = KINDS[kind];
  const pool = ROTATION[kind].filter((s) => symbols.includes(s));
  const all = pool.length ? pool : [...symbols].sort();
  const id = `${kind}-${(startsAt / 60_000).toString(36)}${shard ? `-${shard}` : ""}`;
  return { id, kind, symbol: all[(startsAt / every) % all.length] ?? "BTC-USD", opensAt: startsAt - every + doors, startsAt, endsAt: startsAt + ms, ...(shard && { shard }) };
};

// The same game run again side by side, for players who find the first one full.
export const shardOf = (a: Arena, shard: number, symbols: string[]): Arena => arenaFrom(a.kind, a.startsAt, symbols, shard);
export const sameGame = (x: string, y: string) => x.split("-").slice(0, 2).join("-") === y.split("-").slice(0, 2).join("-");

// The one game of a kind to join: the running one while its doors are open, then the next. On the market whose turn it is.
export function arenaAt(kind: Kind, now: number, symbols: string[]): Arena {
  const { every, doors } = KINDS[kind];
  const last = Math.floor(now / every);
  return arenaFrom(kind, (now - last * every < doors ? last : last + 1) * every, symbols);
}

export function arenaOf(id: string, symbols: string[]): Arena | null {
  const [kind, at, shard, ...rest] = id.split("-");
  if (rest.length || !Object.hasOwn(KINDS, kind) || !/^[0-9a-z]{1,10}$/.test(at ?? "")) return null;
  const n = shard === undefined ? 0 : /^[1-9][0-9]?$/.test(shard) ? Number(shard) : -1;
  if (n < 0 || n >= SHARDS) return null;
  const startsAt = parseInt(at, 36) * 60_000;
  return startsAt % KINDS[kind as Kind].every === 0 ? arenaFrom(kind as Kind, startsAt, symbols, n) : null;
}

export const doorsOpen = (a: Arena, now: number) => now >= a.opensAt && now < a.startsAt + KINDS[a.kind].doors;

// The rivals who fill a game's seats, and when each of them walks in.
export function lineup(a: Pick<Arena, "id" | "kind" | "startsAt">): { joinsAt: number; fighter: Fighter }[] {
  const random = seeded(hash(a.id));
  const { every, doors, ms } = KINDS[a.kind];
  const names = [...ROSTER];
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  return names
    .slice(0, RIVALS)
    .map((name) => {
      const pick = random();
      const role = HERO_ODDS.find(([, upTo]) => pick < upTo)?.[0] ?? "commando";
      const stake = ROLES[role].stake;
      const joinsAt = Math.round(a.startsAt - (every - doors) * between(0.05, 0.95, random));
      const nerve = { power: NERVES[Math.floor(random() * NERVES.length)], nextAt: a.startsAt + ms * between(0.01, 0.06, random), seed: Math.floor(random() * 2 ** 32) };
      return { joinsAt, fighter: { id: name, name, role, stake, cash: stake, call: null, out: null, fought: 0, crits: 0, nerve } };
    })
    .sort((x, y) => x.joinsAt - y.joinsAt);
}

const roundMs = (g: Game) => (g.endsAt - g.startsAt) / KINDS[g.kind].floors.length;
export const roundAt = (g: Game, t: number) => clamp(Math.floor((t - g.startsAt) / roundMs(g)), 0, KINDS[g.kind].floors.length - 1);
export const roundEnds = (g: Game, round: number) => g.startsAt + (round + 1) * roundMs(g);
export const rulesOf = (g: Game): Rules => g.rules ?? DEFAULT_RULES;
export const started = (g: Game, t: number) => t >= g.startsAt;
export const leastPower = (g: Game, f: Fighter, t: number) => Math.max(Math.min(KINDS[g.kind].floors[roundAt(g, t)], rulesOf(g).maxPower), Math.ceil(STRIKE.minOrder / Math.max(f.cash, 1e-9)));
export const foughtIn = (g: Game, f: Fighter, round: number) => ((f.fought >> round) & 1) === 1 || (!!f.call && f.call.at < roundEnds(g, round));
const fights = (g: Game, f: Fighter, t: number) => f.fought | (1 << roundAt(g, t));
// Coming out of a call: every round it was held in, from the one it went in to this one.
const held = (g: Game, f: Fighter, t: number) => {
  let bits = f.fought;
  for (let r = roundAt(g, f.call?.at ?? t); r <= roundAt(g, t); r++) bits |= 1 << r;
  return bits;
};

export function opening(side: Side, power: number, entry: number, stake: number, at: number, tiers = DEFAULT_TIERS, maker = false): Call {
  const fee = stake * power * (maker ? STRIKE.maker : STRIKE.taker);
  const size = (stake * power) / entry;
  const { mmr, amount } = tierAt(tiers, stake * power);
  const cushion = (stake - fee + amount) / size;
  const koAt = side === "long" ? (entry - cushion) / (1 - mmr) : (entry + cushion) / (1 + mmr);
  return { side, power, entry, at, stake, fee, koAt: Math.max(0, koAt), best: entry, ...(maker && { maker: true }) };
}

// What the price has done for a call, before any fee: its unrealized P&L, as Strike shows a position.
export const moveOf = (c: Call, price: number) => (dir(c.side) * c.stake * c.power * (price - c.entry)) / c.entry;

export function valueOf(c: Call, price: number, rate = STRIKE.taker): number {
  const size = (c.stake * c.power) / c.entry;
  return Math.max(0, c.stake - c.fee + moveOf(c, price) - size * price * rate);
}

// The price a call has to pass for giving it up at the market to come out ahead, fees and all.
export function breakEven(c: Call, rate = STRIKE.taker): number {
  const size = (c.stake * c.power) / c.entry;
  const d = dir(c.side);
  return (c.fee + d * size * c.entry) / (size * (d - rate));
}

// How far the price has to go your way to cover the fees in and out: below zero, Strike pays you to trade.
export const hurdle = (rateIn: number, rateOut: number) => (rateIn + rateOut) / (1 - rateOut);

export const koDistance = (c: Pick<Call, "entry" | "koAt">) => Math.abs(c.entry - c.koAt) / c.entry;

// What a player has, as Strike shows equity: the fee in already paid, and a call's move so far.
export const worth = (f: Fighter, price: number) => f.cash + (f.call ? valueOf(f.call, price, 0) : 0);

// What everyone is ranked on: how far their stake has come, so every ghost haunts on the same board.
export const gain = (f: Fighter, price: number) => worth(f, price) / f.stake - 1;

// A critical hit: cashed in near the best price the call saw, for a good profit.
const critAt = (c: Call, price: number, made: number) => {
  const move = dir(c.side) * (c.best - c.entry);
  return made > c.stake * 0.1 && move > 0 && dir(c.side) * (price - c.entry) >= move * 0.85;
};

// Bots fill the seats players leave empty, each as their time comes. A player in after the start takes the seat of the last bot in.
function bots(a: Pick<Arena, "id" | "kind" | "startsAt">, people: Fighter[], t: number): Fighter[] {
  const room = SEATS - people.length;
  return lineup(a)
    .filter((b) => b.joinsAt <= Math.min(t, a.startsAt))
    .slice(0, Math.max(0, room))
    .map((b) => b.fighter);
}

const known = (p: Player) => Object.prototype.hasOwnProperty.call(ROLES, p.role);

const newcomer = (p: Player, id = p.id, name = p.name): Fighter => {
  const stake = ROLES[p.role].stake;
  return { id, name, role: p.role, stake, cash: stake, call: null, out: null, fought: 0, crits: 0, joinedAt: p.joinedAt, ...(p.live && { live: true }) };
};

// Walking in after the start, the game is set up as of the start for the rivals to be caught up from there.
export function enter(arena: Arena, role: Role, price: number, now: number, opts: { live?: boolean; rules?: Rules; me?: string; players?: Player[] } = {}): Game {
  const self = newcomer({ id: YOU, name: "you", role, joinedAt: now, live: opts.live }, YOU, "you");
  const people = [self, ...(opts.players ?? []).filter((p) => p.id !== opts.me && p.joinedAt <= now && known(p)).map((p) => newcomer(p))];
  const seated = bots(arena, people, now);
  const joins: Event[] = [...people.slice(1), ...seated]
    .map((f) => ({ at: f.joinedAt ?? lineup(arena).find((b) => b.fighter.id === f.id)!.joinsAt, who: f.name, what: "join" as const, role: f.role }))
    .sort((x, y) => y.at - x.at);
  return {
    id: arena.id,
    kind: arena.kind,
    symbol: arena.symbol,
    ...(opts.live && { live: true }),
    rules: opts.rules ?? DEFAULT_RULES,
    startsAt: arena.startsAt,
    endsAt: arena.endsAt,
    fighters: [...people, ...seated],
    price,
    at: Math.min(now, arena.startsAt),
    over: false,
    feed: [{ at: now, who: "you", what: "join" as const, role }, ...joins].slice(0, FEED),
    ...(opts.me && { me: opts.me, seen: { ids: [] } }),
  };
}

// Until just after the start the bots shuffle to make room for players; then the seats are set, and only a player coming in late moves a bot out.
function seat(game: Game, fighters: Fighter[], t: number, events: Event[]): Fighter[] {
  const people = fighters.filter((f) => !f.nerve);
  const had = new Map(fighters.filter((f) => f.nerve).map((f) => [f.id, f]));
  const due = bots(game, people, t);
  if (game.at >= game.startsAt + GRACE) {
    if (fighters.length <= SEATS) return fighters;
    const kept = new Set(due.map((b) => b.id));
    return fighters.filter((f) => !f.nerve || kept.has(f.id));
  }
  for (const b of due) if (!had.has(b.id)) events.push({ at: lineup(game).find((x) => x.fighter.id === b.id)!.joinsAt, who: b.name, what: "join", role: b.role });
  if (due.length === had.size && due.every((b) => had.has(b.id))) return fighters;
  return [...people, ...due.map((b) => had.get(b.id) ?? b)];
}

// What the other players in the game did, up to a time: who came in, and their moves in order.
export function heed(game: Game, log: Log, until: number): Game {
  if (!game.me) return game;
  const events: Event[] = [];
  const here = new Set(game.fighters.map((f) => f.id));
  const fresh = log.players.filter((p) => p.id !== game.me && !here.has(p.id) && p.joinedAt <= until && p.joinedAt < game.endsAt && known(p));
  for (const p of fresh) events.push({ at: p.joinedAt, who: p.name, what: "join", role: p.role });
  let g: Game = fresh.length ? { ...game, fighters: seat(game, [...game.fighters, ...fresh.map((p) => newcomer(p))], Math.max(game.at, until), events) } : game;
  if (events.length) g = { ...g, feed: [...events.sort((x, y) => y.at - x.at), ...g.feed].slice(0, FEED) };
  if (log.bell && !g.bell) g = { ...g, bell: log.bell };
  const was: Seen = typeof g.seen === "object" ? g.seen : { ids: log.moves.slice(0, g.seen ?? 0).map(keyOf) };
  const had = new Set(was.ids);
  const due = log.moves
    .filter((m) => m.at <= until && !had.has(keyOf(m)) && !(was.upTo !== undefined && m.id !== undefined && m.id <= was.upTo))
    .sort((x, y) => x.at - y.at || (keyOf(x) < keyOf(y) ? -1 : 1));
  if (!due.length && typeof g.seen === "object") return g;
  for (const m of due) if (m.who !== g.me) g = move(g, m);
  const old = String(Math.max(0, Math.floor(until - FOLD))).padStart(13, "0");
  let upTo = was.upTo;
  const ids: string[] = [];
  for (const k of [...was.ids, ...due.map(keyOf)]) {
    if (/^\d{13}#/.test(k) && k.slice(0, 13) < old) upTo = upTo === undefined || k > upTo ? k : upTo;
    else ids.push(k);
  }
  return { ...g, seen: { ...(upTo !== undefined && { upTo }), ids } };
}

// Another player's move, as the game server took it. Their graves and thunderclouds spring here by the price, as everyone's do;
// the fills and exits they say they had only land if the price here hasn't sprung them already. A live call
// lands at the game's price like any other: what Strike says about it is only theirs to see.
export function move(game: Game, m: Move): Game {
  const f = game.fighters.find((x) => x.id === m.who);
  if (!f || f.id === YOU || f.out || game.over || m.at > game.endsAt) return game;
  if (m.what === "trap") {
    if (f.call || !m.side || !m.power || !m.price || m.at < game.startsAt) return game;
    const trap: Trap = { side: m.side, power: m.power, price: m.price, at: m.at, ...(m.flag && { flag: m.flag }) };
    return withFighter(game, { ...f, trap }, f.trap ? null : { at: m.at, who: f.name, what: "trap", side: m.side, power: m.power, price: m.price });
  }
  if (m.what === "pull") return f.trap ? withFighter(game, { ...f, trap: null }, null) : game;
  if (m.what === "flag") {
    if (f.call) return withFighter(game, { ...f, call: withFlag(f.call, m.price) }, null);
    return f.trap ? withFighter(game, { ...f, trap: withFlag(f.trap, m.price) }, null) : game;
  }
  if (m.what === "fill") {
    if (!f.trap || f.call || m.at < game.startsAt) return game;
    const events: Event[] = [];
    return withFighter(game, sprung(game, f, f.trap.price, m.at, events), events[0]);
  }
  if (m.what === "call") {
    if (f.call || !m.side || !m.power || !m.entry || m.at < game.startsAt) return game;
    const c = opening(m.side, m.power, m.entry, f.cash, m.at, rulesOf(game).tiers);
    return withFighter(game, { ...f, cash: 0, call: c, trap: null, fought: fights(game, f, m.at) }, { at: m.at, who: f.name, what: m.side, power: m.power });
  }
  if (!f.call) return game;
  const price = m.price ?? (m.what === "ko" ? f.call.koAt : game.price);
  if (m.what === "ko") return withFighter(game, { ...f, cash: 0, call: null, out: { at: m.at, price, by: "ko" } }, { at: m.at, who: f.name, what: "ko", power: f.call.power, side: f.call.side });
  if (m.flag) {
    const events: Event[] = [];
    return withFighter(game, flagged(game, f, m.flag, m.at, events), events[0]);
  }
  const cash = valueOf(f.call, price);
  const made = cash - f.call.stake;
  const crit = critAt(f.call, price, made);
  return withFighter(game, { ...f, cash, call: null, crits: f.crits + (crit ? 1 : 0), fought: held(game, f, m.at) }, { at: m.at, who: f.name, what: "bank", side: f.call.side, stake: f.call.stake, made, crit });
}

const withFlag = <T extends { flag?: number }>(x: T, flag: number | undefined): T => {
  const next = { ...x };
  delete next.flag;
  return flag ? { ...next, flag } : next;
};

// A trap springing: in at exactly its price, as a maker.
function sprung(game: Game, f: Fighter, price: number, t: number, events: Event[]): Fighter {
  const trap = f.trap!;
  const c = opening(trap.side, trap.power, price, f.cash, t, rulesOf(game).tiers, true);
  events.push({ at: t, who: f.name, what: trap.side, power: trap.power, price, maker: true });
  return { ...f, cash: 0, trap: null, call: withFlag(c, trap.flag), fought: fights(game, f, t), liquidity: (f.liquidity ?? 0) + c.stake * c.power };
}

// Your live trap filled on Strike: in at its fill, as a maker.
export function trapped(game: Game, fill: Fill, at: number): Game {
  const me = you(game);
  if (game.over || me.out || me.call || !fill.live || me.trap?.live !== fill.live) return game;
  const events: Event[] = [];
  const f = sprung(game, me, fill.entry, at, events);
  return withYou(game, { ...f, call: { ...f.call!, fee: fill.fee, koAt: fill.koAt || f.call!.koAt, live: fill.live, size: fill.size } }, events[0]);
}

// Your live thundercloud filled on Strike, at the price and fee it filled at.
export function flagHit(game: Game, at: number, price: number, fee?: number): Game {
  const me = you(game);
  if (game.over || !me.call?.flagOrder) return game;
  const events: Event[] = [];
  return withYou(game, flagged(game, me, price, at, events, fee), events[0]);
}

// A thundercloud cashing in a call at its price, as a maker.
function flagged(game: Game, f: Fighter, price: number, t: number, events: Event[], fee?: number): Fighter {
  const c = f.call!;
  const cash = fee === undefined ? valueOf(c, price, STRIKE.maker) : Math.max(0, valueOf(c, price, 0) - fee);
  const made = cash - c.stake;
  const crit = critAt(c, price, made);
  events.push({ at: t, who: f.name, what: "bank", side: c.side, stake: c.stake, made, crit, price, maker: true });
  return { ...f, cash, call: null, crits: f.crits + (crit ? 1 : 0), fought: held(game, f, t), liquidity: (f.liquidity ?? 0) + ((c.stake * c.power) / c.entry) * price };
}

// Graves spring and thunderclouds strike when the price trades through them, not when it only touches.
const through = (side: Side, at: number, bar: { h: number; l: number }) => (side === "long" ? bar.l < at : bar.h > at);
const beyond = (side: Side, a: number, b: number) => (side === "long" ? a > b : a < b);

const you = (game: Game) => game.fighters.find((f) => f.id === YOU)!;
const withFighter = (game: Game, f: Fighter, event: Event | null): Game => ({
  ...game,
  fighters: game.fighters.map((x) => (x.id === f.id ? f : x)),
  feed: event ? [event, ...game.feed].slice(0, FEED) : game.feed,
});
const withYou = withFighter;

export function canCall(game: Game, power: number, now: number): boolean {
  const me = you(game);
  return !game.over && started(game, now) && now < game.endsAt && !me.out && !me.call && me.cash > 0 && power >= leastPower(game, me, now) && power <= rulesOf(game).maxPower;
}

// Swooping in: in at the price now, as a taker.
export function call(game: Game, side: Side, power: number, now: number, fill?: Partial<Fill> & { entry: number }): Game {
  const me = you(game);
  const p = Math.round(power);
  if (!canCall(game, p, now)) return game;
  const opened = opening(side, p, fill?.entry ?? game.price, me.cash, now, rulesOf(game).tiers);
  const c = fill?.live ? { ...opened, fee: fill.fee ?? opened.fee, koAt: fill.koAt ?? opened.koAt, live: fill.live, size: fill.size } : opened;
  return withYou(game, { ...me, cash: 0, call: c, trap: null, fought: fights(game, me, now) }, { at: now, who: me.name, what: side, power: p });
}

// A long trap sits below the price and a short one above it. Setting one where you have one moves it.
export const canTrap = (game: Game, side: Side, power: number, price: number, now: number) => price > 0 && beyond(side, game.price, price) && canCall(game, power, now);

export function setTrap(game: Game, side: Side, power: number, price: number, now: number, laid?: { live: string; size: number }): Game {
  const me = you(game);
  const p = Math.round(power);
  // One Strike has taken is where Strike has it, even if the price has moved since.
  if (laid ? !canCall(game, p, now) : !canTrap(game, side, p, price, now)) return game;
  const kept = me.trap?.side === side && me.trap.flag && beyond(side, me.trap.flag, price) ? me.trap.flag : undefined;
  const trap: Trap = { side, power: p, price, at: now, ...(kept && { flag: kept }), ...(laid && { live: laid.live, size: laid.size }) };
  return withYou(game, { ...me, trap }, me.trap ? null : { at: now, who: me.name, what: "trap", side, power: p, price });
}

export const pullTrap = (game: Game): Game => (you(game).trap ? withYou(game, { ...you(game), trap: null }, null) : game);

// A thundercloud is where a call cashes in as a maker: past the price for a call, past the trap for a trap.
export function canFlag(game: Game, price: number, now: number): boolean {
  const me = you(game);
  if (game.over || me.out || now >= game.endsAt || price <= 0) return false;
  if (me.call) return beyond(me.call.side, price, game.price);
  return !!me.trap && beyond(me.trap.side, price, me.trap.price);
}

export function plantFlag(game: Game, price: number | undefined, now: number, order?: string): Game {
  const me = you(game);
  if (price !== undefined && !order && !canFlag(game, price, now)) return game;
  if (me.call) {
    const c = withFlag(me.call, price);
    delete c.flagOrder;
    return withYou(game, { ...me, call: price && order ? { ...c, flagOrder: order } : c }, null);
  }
  return me.trap ? withYou(game, { ...me, trap: withFlag(me.trap, price) }, null) : game;
}

export function bank(game: Game, now: number, fill?: { price: number; value?: number }): Game {
  const me = you(game);
  if (game.over || !me.call) return game;
  const price = fill?.price ?? game.price;
  const cash = fill?.value ?? valueOf(me.call, price);
  const made = cash - me.call.stake;
  const crit = critAt(me.call, price, made);
  return withYou(game, { ...me, cash, call: null, crits: me.crits + (crit ? 1 : 0), fought: held(game, me, now) }, { at: now, who: me.name, what: "bank", side: me.call.side, stake: me.call.stake, made, move: moveOf(me.call, price), crit });
}

export function knockedOut(game: Game, at: number, price: number): Game {
  const me = you(game);
  if (!me.call || me.out) return game;
  return withYou(game, { ...me, cash: 0, call: null, out: { at, price, by: "ko" } }, { at, who: me.name, what: "ko", power: me.call.power, side: me.call.side });
}

export const settle = (game: Game, value: number): Game => ({ ...game, fighters: game.fighters.map((f) => (f.id === YOU ? { ...f, cash: value } : f)) });

export function advance(game: Game, bar: { h: number; l: number; c: number }, at: number): Game {
  if (game.over || at < game.at) return game;
  const t = Math.min(at, game.endsAt);
  const events: Event[] = [];
  const seated = seat(game, game.fighters, t, events);
  if (t < game.startsAt) return { ...game, fighters: seated, price: bar.c, at: t, feed: [...events.reverse(), ...game.feed].slice(0, FEED) };
  if (game.at < game.startsAt) events.push({ at: game.startsAt, who: "", what: "start" });
  // What springs in a bar happened within it, so a bar ending on the bell counts for the round it ends.
  const within = Math.max(game.at, t - 1);
  let fighters = seated.map((f) => {
    if (f.trap && !f.trap.live && !f.call && !f.out && t > f.trap.at && through(f.trap.side, f.trap.price, bar)) return sprung(game, f, f.trap.price, within, events);
    if (!f.call) return f;
    const c = { ...f.call, best: f.call.side === "long" ? Math.max(f.call.best, bar.h) : Math.min(f.call.best, bar.l) };
    if (c.live || (c.side === "long" ? bar.l > c.koAt : bar.h < c.koAt)) {
      return c.flag && !c.live && c.at < t && through(c.side === "long" ? "short" : "long", c.flag, bar) ? flagged(game, { ...f, call: c }, c.flag, within, events) : { ...f, call: c };
    }
    events.push({ at: t, who: f.name, what: "ko", power: c.power, side: c.side });
    return { ...f, cash: 0, call: null, out: { at: t, price: c.koAt, by: "ko" as const } };
  });

  const ending = at >= game.endsAt;
  if (!ending) {
    const g = { ...game, fighters };
    fighters = fighters.map((f) => {
      if (!f.nerve || f.out || f.nerve.nextAt > t) return f;
      const moved = act(f, g, bar.c, t);
      if (moved.event) events.push(moved.event);
      return moved.fighter;
    });
  } else {
    const last = game.bell ?? bar.c;
    fighters = fighters.map((f) => (f.call ? { ...f, cash: valueOf(f.call, last), call: null } : f.trap ? { ...f, trap: null } : f));
    events.push({ at: t, who: "", what: "end" });
  }
  return { ...game, fighters, price: ending && game.bell ? game.bell : bar.c, at: t, over: ending, feed: [...events.reverse(), ...game.feed].slice(0, FEED) };
}

function act(f: Fighter, game: Game, price: number, t: number): { fighter: Fighter; event: Event | null } {
  const round = roundMs(game);
  const random = seeded(f.nerve!.seed);
  const nerve = (nextAt: number) => ({ ...f.nerve!, seed: random.seed(), nextAt });
  const reach = KINDS[game.kind].reach;
  if (f.call) {
    if (f.call.flag && random() < 0.85) return { fighter: { ...f, nerve: nerve(t + round * between(0.2, 0.6, random)) }, event: null };
    const cash = valueOf(f.call, price);
    const made = cash - f.call.stake;
    const crit = critAt(f.call, price, made);
    return {
      fighter: { ...f, cash, call: null, crits: f.crits + (crit ? 1 : 0), fought: held(game, f, t), nerve: nerve(t + round * between(0.05, 0.3, random)) },
      event: { at: t, who: f.name, what: "bank", side: f.call.side, stake: f.call.stake, made, crit },
    };
  }
  const least = leastPower(game, f, t);
  const most = rulesOf(game).maxPower;
  if (least > most) return { fighter: { ...f, trap: null, nerve: { ...f.nerve!, nextAt: Infinity } }, event: null };
  const up = price >= game.price;
  const side: Side = random() < 0.6 === up ? "long" : "short";
  const power = clamp(Math.round(f.nerve!.power * between(0.6, 1.4, random)), least, most);
  // Most dig graves near the price and wait; now and then one swoops in and pays the fee.
  if (random() < 0.12) {
    return {
      fighter: { ...f, cash: 0, trap: null, call: opening(side, power, price, f.cash, t, rulesOf(game).tiers), fought: fights(game, f, t), nerve: nerve(t + round * between(0.2, 0.9, random)) },
      event: { at: t, who: f.name, what: side, power },
    };
  }
  const away = reach * between(0.2, 1.6, random);
  const at = side === "long" ? price * (1 - away) : price * (1 + away);
  const target = reach * between(0.6, 2.2, random);
  const flag = random() < 0.85 ? (side === "long" ? at * (1 + target) : at * (1 - target)) : undefined;
  return { fighter: { ...f, trap: { side, power, price: at, at: t, ...(flag && { flag }) }, nerve: nerve(t + round * between(0.15, 0.45, random)) }, event: null };
}

// Catching a game up over candles, with the other players' moves taken in as their times come.
export function catchUp(game: Game, candles: { t: number; h: number; l: number; c: number }[], ms: number, now: number, log?: Log): Game {
  let g = game;
  for (const c of candles) {
    const end = Math.min(c.t + ms, now);
    if (end <= g.at) continue;
    if (log) g = heed(g, log, end);
    g = advance(g, c, end);
    if (g.over) break;
  }
  return log ? heed(g, log, now) : g;
}

export const standings = (game: Game): Fighter[] =>
  [...game.fighters].sort((a, b) => Number(!!a.out) - Number(!!b.out) || (b.out?.at ?? 0) - (a.out?.at ?? 0) || gain(b, game.price) - gain(a, game.price));

export const placeOf = (game: Game, id: string) => standings(game).findIndex((f) => f.id === id) + 1;

export const standingCount = (game: Game) => game.fighters.filter((f) => !f.out).length;
