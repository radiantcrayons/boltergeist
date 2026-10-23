import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { caught, close, filledOf, hit, lay, lift, open, plant } from "../live/desk";
import { strike } from "../live/exchange";
import { BUILDER, type Session } from "../live/session";
import { Full, gather, join, look, tell, Wait } from "../online";
import { PREFIX } from "../store";
import { klines, NETWORK, type Mark } from "../strike";
import type { Market } from "../types";
import {
  advance,
  arenaAt,
  arenaOf,
  bank as bankIn,
  call as callIn,
  canCall,
  catchUp,
  enter as newGame,
  flagHit,
  heed,
  knockedOut,
  plantFlag,
  pullTrap,
  rulesFor,
  sameGame,
  setTrap,
  settle,
  STRIKE,
  TOP_STAKE,
  trapped,
  valueOf,
  YOU,
  type Game,
  type Kind,
  type Log,
  type Move,
  type Role,
  type Side,
} from "./war";

// Each Strike network keeps its own games.
const KEY = `${PREFIX}games${NETWORK === "mainnet" ? "" : `.${NETWORK}`}`;
const RECORD = 30;

function load(): Game[] {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(kept) ? (kept as Game[]).filter((g) => g.fighters?.every((f) => "stake" in f)) : [];
  } catch {
    return [];
  }
}

function save(games: Game[]) {
  try {
    const finished = games.filter((g) => g.over).slice(0, RECORD);
    localStorage.setItem(KEY, JSON.stringify([...games.filter((g) => !g.over), ...finished]));
  } catch {}
}

const yours = (g: Game | undefined) => g?.fighters.find((f) => f.id === YOU);
const FEE_RATE = STRIKE.taker + BUILDER.feeBps / 10_000;
// How long a game played online waits past the bell for the game's price to end on, before ending on its own.
const BELL_WAIT = 8000;
// A gap between prices longer than this is caught up from candles, and a catch up that didn't work is tried again after RETRY.
const GAP = 10_000;
const RETRY = 15_000;
// Saving the games is put off to now and then, but never past a change in what's on Strike.
const SAVE_MS = 5000;
const onStrike = (games: Game[]) =>
  games
    .map((g) => {
      const me = yours(g);
      return `${g.id}:${g.over ? 1 : 0}:${me?.call?.live ?? ""}:${me?.call?.flagOrder ?? ""}:${me?.trap?.live ?? ""}`;
    })
    .join("|");

export type War = {
  games: Game[];
  enter: (kind: Kind, role: Role, live?: boolean) => Promise<string | null>;
  call: (id: string, side: Side, power: number) => void;
  trap: (id: string, side: Side, power: number, price: number) => void;
  pull: (id: string) => void;
  flag: (id: string, price: number | undefined) => void;
  bank: (id: string) => void;
  // Clears the last error, for a fresh screen.
  dismiss: () => void;
  // What's on its way to Strike, while it is.
  busy: string | null;
  joining: boolean;
  error: string | null;
};

export function useWar(marks: Record<string, Mark>, markets: Market[], session: Session | null): War {
  const [games, setGames] = useState<Game[]>(load);
  const [busy, setBusy] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef({ marks, markets, games });
  useEffect(() => {
    latest.current = { marks, markets, games };
  }, [marks, markets, games]);
  const kept = useRef({ strike: "", dirty: false });
  useEffect(() => {
    const strikeNow = onStrike(games);
    if (strikeNow === kept.current.strike) return void (kept.current.dirty = true);
    save(games);
    kept.current = { strike: strikeNow, dirty: false };
  }, [games]);
  useEffect(() => {
    const flush = () => {
      if (!kept.current.dirty) return;
      save(latest.current.games);
      kept.current.dirty = false;
    };
    const hidden = () => document.visibilityState === "hidden" && flush();
    const timer = setInterval(flush, SAVE_MS);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hidden);
      flush();
    };
  }, []);
  const update = useCallback((id: string, f: (g: Game) => Game) => setGames((gs) => gs.map((g) => (g.id === id ? f(g) : g))), []);
  const ex = useMemo(() => (session ? strike(session.keys, BUILDER.feeBps) : null), [session]);

  // Live calls known to be on Strike, by the game they're in, and those on their way out.
  const known = useRef(new Map<string, string>());
  const closing = useRef(new Set<string>());
  // Live traps resting on Strike, by game; the thundercloud order on each live call; and the games with an order on its way.
  const traps = useRef(new Map<string, string>());
  const flags = useRef(new Map<string, string>());
  const acting = useRef(new Set<string>());

  // What each game played online has heard from the game server so far, in the order it came in.
  const logs = useRef(new Map<string, Log>());

  // A game that's been away from the price, closed or walked into late, is caught up from Strike's candles.
  const syncing = useRef(new Set<string>());
  const sync = useCallback(
    (g: Game) => {
      syncing.current.add(g.id);
      const minutes = Date.now() - g.at < 400 * 60_000;
      Promise.all([klines(g.symbol, minutes ? "1m" : "15m"), g.me ? look(g.id) : null])
        .then(
          ([candles, log]) => {
            if (log) logs.current.set(g.id, log);
            update(g.id, (x) => catchUp(x, candles, minutes ? 60_000 : 900_000, Date.now(), log ?? undefined));
          },
          () => {},
        )
        .finally(() => syncing.current.delete(g.id));
    },
    [update],
  );
  useEffect(() => {
    const at = Date.now();
    for (const g of load()) {
      const me = yours(g);
      if (me?.call?.live) known.current.set(me.call.live, g.id);
      if (me?.call?.live && me.call.flagOrder) flags.current.set(me.call.live, me.call.flagOrder);
      if (me?.trap?.live) traps.current.set(me.trap.live, g.id);
      if (!g.over && at - g.at >= 10_000) sync(g);
    }
  }, [sync]);

  // A game that's gone a while without a price (a phone in a pocket, a tab asleep) is caught up from Strike's candles rather
  // than in one step, so it plays out as it did for everyone else. A catch up that fails is tried again now and then.
  const tried = useRef(new Map<string, number>());
  const behind = useCallback(
    (g: Game, at: number) => {
      const now = Date.now();
      if (g.over || g.at < g.startsAt || syncing.current.has(g.id) || at - g.at <= GAP || now - (tried.current.get(g.id) ?? 0) < RETRY) return false;
      tried.current.set(g.id, now);
      sync(g);
      return true;
    },
    [sync],
  );
  // Coming back by any way a browser has: the tab shown again, a page restored from the back button's cache, the window
  // focused, or a frozen page resumed.
  useEffect(() => {
    const back = () => {
      if (document.visibilityState === "visible") for (const g of latest.current.games) behind(g, Date.now());
    };
    document.addEventListener("visibilitychange", back);
    document.addEventListener("resume", back);
    window.addEventListener("pageshow", back);
    window.addEventListener("focus", back);
    return () => {
      document.removeEventListener("visibilitychange", back);
      document.removeEventListener("resume", back);
      window.removeEventListener("pageshow", back);
      window.removeEventListener("focus", back);
    };
  }, [behind]);

  // Games move on by Strike's marks, at the time Strike gives each one, so every browser sees the bots act at the same
  // prices. The clock alone only walks a game up to its start, and over the bell. A game played online waits a moment
  // at the bell for the game's price, so everyone in it ends on the same one.
  const moveOn = useCallback(
    (all: Record<string, Mark>, ticking: boolean) => {
      if (!ticking) for (const g of latest.current.games) if (all[g.symbol]) behind(g, all[g.symbol].at);
      setGames((gs) => {
        if (!gs.some((g) => !g.over && all[g.symbol])) return gs;
        let moved = false;
        const next = gs.map((g) => {
          const m = all[g.symbol];
          if (g.over || !m || syncing.current.has(g.id)) return g;
          const now = Date.now();
          const bar = { h: m.p, l: m.p, c: m.p };
          let at = ticking ? (now < g.startsAt ? now : now >= g.endsAt ? now : g.at) : Math.max(m.at, Math.min(now, g.startsAt - 1));
          if (at >= g.endsAt && g.me && g.bell === undefined && now < g.endsAt + BELL_WAIT) at = Math.max(g.at, g.endsAt - 1);
          const after = at > g.at ? advance(g, bar, at) : g;
          if (after !== g) moved = true;
          return after;
        });
        return moved ? next : gs;
      });
    },
    [behind],
  );
  useEffect(() => moveOn(marks, false), [marks, moveOn]);
  useEffect(() => {
    const timer = setInterval(() => moveOn(latest.current.marks, true), 1000);
    return () => clearInterval(timer);
  }, [moveOn]);

  const marketOf = (symbol: string) => latest.current.markets.find((m) => m.symbol === symbol);

  // The other players in each game you're in: who's come in, and what they've done.
  const looking = useRef(new Set<string>());
  useEffect(() => {
    const timer = setInterval(() => {
      // Asked again here, as a hidden page's held timers can run before it says it's back.
      if (document.hidden) return;
      for (const g of latest.current.games) {
        if (!g.me || g.over || syncing.current.has(g.id) || looking.current.has(g.id)) continue;
        looking.current.add(g.id);
        look(g.id, logs.current.get(g.id)?.next)
          .then((got) => {
            if (!got) return;
            const log = gather(logs.current.get(g.id), got);
            logs.current.set(g.id, log);
            update(g.id, (x) => (syncing.current.has(x.id) ? x : heed(x, log, Date.now())));
          })
          .finally(() => looking.current.delete(g.id));
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [update]);

  const announce = useCallback((g: Game, m: Omit<Move, "at" | "who">) => {
    if (g.me) tell(g.id, g.me, m).catch((err: Error) => setError(err instanceof Wait ? err.message : `The game missed that: ${err.message}`));
  }, []);

  // Your graves springing and thunderclouds striking happen here by the price: the game server hears of them too.
  const told = useRef(new Map<string, number>());
  useEffect(() => {
    for (const g of games) {
      if (!g.me) continue;
      const since = told.current.get(g.id) ?? g.at;
      const fresh = g.feed.filter((e) => e.who === "you" && e.maker && e.at > since).reverse();
      told.current.set(g.id, Math.max(since, g.feed[0]?.at ?? since));
      for (const e of fresh) announce(g, e.what === "bank" ? { what: "bank", price: e.price, flag: e.price } : { what: "fill", price: e.price });
    }
  }, [games, announce]);

  // A live call that's left its game here (banished, or the final bell) comes off Strike too.
  useEffect(() => {
    if (!ex) return;
    for (const [liveId, gameId] of known.current) {
      const g = games.find((x) => x.id === gameId);
      const c = yours(g)?.call;
      if (closing.current.has(liveId) || c?.live === liveId) continue;
      const market = g && marketOf(g.symbol);
      const mark = g && latest.current.marks[g.symbol]?.p;
      if (!g || !market || !mark) continue;
      closing.current.add(liveId);
      const flagOrder = flags.current.get(liveId);
      (flagOrder ? lift(ex, g.symbol, flagOrder) : Promise.resolve(null))
        .then(() => close(ex, { market, mark, live: liveId, feeRate: FEE_RATE, estimate: yours(g)!.cash }))
        .then(
          (out) => {
            known.current.delete(liveId);
            flags.current.delete(liveId);
            if (out !== "gone") update(gameId, (x) => settle(x, out.value));
          },
          (err: Error) => setError(`Couldn't close your position on Strike: ${err.message}`),
        )
        .finally(() => closing.current.delete(liveId));
    }
  }, [games, ex, update]);

  // A live trap that's left its game (banished, or the final bell) comes off Strike too. One that filled on its way out
  // comes straight back off, and what that made or lost is kept.
  const lifting = useRef(new Set<string>());
  useEffect(() => {
    if (!ex) return;
    for (const [liveId, gameId] of traps.current) {
      const g = games.find((x) => x.id === gameId);
      const me = yours(g);
      if (lifting.current.has(liveId) || acting.current.has(gameId) || me?.trap?.live === liveId || me?.call?.live === liveId) continue;
      const market = g && marketOf(g.symbol);
      const mark = g && latest.current.marks[g.symbol]?.p;
      if (!g || !market || !mark) continue;
      lifting.current.add(liveId);
      lift(ex, g.symbol, liveId)
        .then(async (o) => {
          traps.current.delete(liveId);
          if (!filledOf(o)) return;
          const out = await close(ex, { market, mark, live: liveId, feeRate: FEE_RATE, estimate: 0 });
          if (out !== "gone") update(gameId, (x) => settle(x, (yours(x)?.cash ?? 0) + out.made));
        })
        .catch((err: Error) => setError(`Couldn't take your graves off Strike: ${err.message}`))
        .finally(() => lifting.current.delete(liveId));
    }
  }, [games, ex, update]);

  // Summons a live call's thundercloud on Strike, moving the one it has, or takes it off with no price. Where it went, if anywhere.
  const replant = useCallback(
    async (g: Game, c: { live: string; flagOrder?: string }, price: number | undefined): Promise<number | undefined> => {
      const market = marketOf(g.symbol);
      if (!ex || !market) return;
      if (c.flagOrder) {
        // One that struck first is left for the watch to take in.
        if ((await lift(ex, g.symbol, c.flagOrder))?.Status === "filled") return;
        flags.current.delete(c.live);
      }
      if (price === undefined) return void update(g.id, (x) => plantFlag(x, undefined, Date.now()));
      try {
        const flag = await plant(ex, { market, price, clientId: `${c.live}-f${(Date.now() % 1e6).toString(36)}` });
        flags.current.set(c.live, flag.live);
        update(g.id, (x) => plantFlag(x, flag.price, Date.now(), flag.live));
        return flag.price;
      } catch (err) {
        update(g.id, (x) => plantFlag(x, undefined, Date.now()));
        throw err;
      }
    },
    [ex, update],
  );

  // Strike's word on live graves and thunderclouds: whether they've filled yet.
  useEffect(() => {
    if (!ex) return;
    const timer = setInterval(async () => {
      for (const g of latest.current.games) {
        const me = yours(g);
        const market = marketOf(g.symbol);
        if (g.over || !g.live || !me || !market || acting.current.has(g.id)) continue;
        try {
          if (me.trap?.live) {
            const trap = me.trap;
            const fill = await caught(ex, market, trap.live!, STRIKE.maker);
            // Gone from the game meanwhile, it's left to come off Strike with the rest.
            if (!fill || acting.current.has(g.id) || yours(latest.current.games.find((x) => x.id === g.id))?.trap?.live !== trap.live) continue;
            traps.current.delete(trap.live!);
            if (fill === "gone") {
              update(g.id, (x) => (yours(x)?.trap?.live === trap.live ? pullTrap(x) : x));
              setError("Strike took your graves off: dig some more");
              continue;
            }
            known.current.set(fill.live, g.id);
            update(g.id, (x) => trapped(x, fill, fill.at));
            if (trap.flag) {
              acting.current.add(g.id);
              await replant(g, { live: fill.live }, trap.flag)
                .catch((err: Error) => setError(`Couldn't summon your thundercloud on Strike: ${err.message}`))
                .finally(() => acting.current.delete(g.id));
            }
          } else if (me.call?.live && me.call.flagOrder) {
            const c = me.call;
            const banked = await hit(ex, g.symbol, c.flagOrder!);
            if (!banked || acting.current.has(g.id)) continue;
            flags.current.delete(c.live!);
            if (banked === "gone") {
              update(g.id, (x) => (yours(x)?.call?.flagOrder === c.flagOrder ? plantFlag(x, undefined, Date.now()) : x));
              continue;
            }
            known.current.delete(c.live!);
            update(g.id, (x) => flagHit(x, banked.at, banked.price, banked.fee));
          }
        } catch {}
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [ex, update, replant]);

  // Strike's word on live calls: still there (and where it's knocked out), or liquidated.
  useEffect(() => {
    if (!ex) return;
    const timer = setInterval(async () => {
      for (const g of latest.current.games) {
        const c = yours(g)?.call;
        if (g.over || !c?.live || closing.current.has(c.live) || acting.current.has(g.id)) continue;
        try {
          const held = await ex.position(g.symbol);
          if (closing.current.has(c.live) || acting.current.has(g.id)) continue;
          if (!held && c.flagOrder) {
            // Gone at the thundercloud, or knocked out with the thundercloud left over.
            const banked = await hit(ex, g.symbol, c.flagOrder);
            if (banked && banked !== "gone") {
              known.current.delete(c.live);
              update(g.id, (x) => flagHit(x, banked.at, banked.price, banked.fee));
              continue;
            }
            await lift(ex, g.symbol, c.flagOrder).catch(() => null);
          }
          if (!held) {
            known.current.delete(c.live);
            update(g.id, (x) => (yours(x)?.call?.live === c.live ? knockedOut(x, Date.now(), c.koAt) : x));
            announce(g, { what: "ko", price: c.koAt });
          } else if (held.koAt && Math.abs(held.koAt - c.koAt) > 1e-9) {
            update(g.id, (x) => ({ ...x, fighters: x.fighters.map((f) => (f.id === YOU && f.call && f.call.live === c.live ? { ...f, call: { ...f.call, koAt: held.koAt } } : f)) }));
          }
        } catch {}
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [ex, update, announce]);

  // Joining takes a seat in the game of that kind that's open. Everyone in it has the same most power: the most the top stake can carry.
  // With the game server out of reach, the haunt goes on with bots in every other seat.
  const enter = useCallback(
    async (kind: Kind, role: Role, live = false) => {
      const symbols = latest.current.markets.map((m) => m.symbol);
      const first = arenaAt(kind, Date.now(), symbols);
      const there = latest.current.games.find((g) => sameGame(g.id, first.id));
      if (there) return there.id;
      if (!latest.current.marks[first.symbol]) return null;
      setJoining(true);
      setError(null);
      try {
        const seat = await join(first.id, role, live, live ? session?.keys : undefined);
        const arena = (seat && arenaOf(seat.arena, symbols)) || first;
        if (seat) logs.current.set(arena.id, seat.log);
        const now = Date.now();
        const rules = rulesFor(marketOf(arena.symbol)?.tiers ?? [], TOP_STAKE);
        const game = newGame(arena, role, latest.current.marks[arena.symbol].p, now, { live, rules, ...(seat && { me: seat.me, players: seat.log.players }) });
        setGames((gs) => (gs.some((g) => g.id === game.id) ? gs : [game, ...gs]));
        if (game.at < now) sync(game);
        return game.id;
      } catch (err) {
        setError(err instanceof Full ? err.message : `Couldn't get into the game: ${(err as Error).message}`);
        return null;
      } finally {
        setJoining(false);
      }
    },
    [sync, session],
  );

  // One thing at a time on Strike per game, with the watch standing back while it's on its way.
  const act = useCallback((id: string, doing: string, job: () => Promise<void>) => {
    acting.current.add(id);
    setBusy(doing);
    setError(null);
    job()
      .catch((err: Error) => setError(err.message))
      .finally(() => {
        acting.current.delete(id);
        setBusy(null);
      });
  }, []);

  // Taking your live trap off Strike before something else: false if it sprang first, for the watch to take in.
  const unset = useCallback(
    async (g: Game) => {
      const live = yours(g)?.trap?.live;
      if (!ex || !live) return true;
      if (filledOf(await lift(ex, g.symbol, live))) return false;
      traps.current.delete(live);
      update(g.id, (x) => (yours(x)?.trap?.live === live ? pullTrap(x) : x));
      return true;
    },
    [ex, update],
  );

  const call = useCallback(
    (id: string, side: Side, power: number) => {
      const g = latest.current.games.find((x) => x.id === id);
      if (!g) return;
      const p = Math.round(power);
      if (!g.live) {
        const now = Date.now();
        if (!canCall(g, p, now)) return;
        update(id, (x) => callIn(x, side, p, now, { entry: g.price }));
        return announce(g, { what: "call", side, power: p, entry: g.price });
      }
      const market = marketOf(g.symbol);
      if (!ex) return setError("Connect to Strike to make live calls");
      if (!market || !canCall(g, p, Date.now())) return;
      act(id, "swooping in on Strike...", async () => {
        if (!(await unset(g))) return;
        const mark = latest.current.marks[g.symbol]?.p ?? g.price;
        const fill = await open(ex, { market, mark, side, stake: yours(g)!.cash, power: p, clientId: `tw-${g.id}-${Date.now().toString(36)}`, feeRate: FEE_RATE });
        known.current.set(fill.live, id);
        update(id, (x) => callIn(x, side, p, Date.now(), fill));
        announce(g, { what: "call", side, power: p, entry: fill.entry, koAt: fill.koAt, fee: fill.fee, live: true });
      });
    },
    [ex, update, announce, act, unset],
  );

  const trap = useCallback(
    (id: string, side: Side, power: number, price: number) => {
      const g = latest.current.games.find((x) => x.id === id);
      if (!g) return;
      const now = Date.now();
      const p = Math.round(power);
      const next = setTrap(g, side, p, price, now);
      if (next === g) return;
      const said = (at: number, flag: number | undefined) => announce(g, { what: "trap", side, power: p, price: at, ...(flag && { flag }) });
      if (!g.live) {
        update(id, (x) => setTrap(x, side, p, price, now));
        return said(price, yours(next)!.trap!.flag);
      }
      const market = marketOf(g.symbol);
      if (!ex) return setError("Connect to Strike to dig live graves");
      if (!market) return;
      // Moving one takes it off Strike first, unless it's sprung already.
      const old = yours(g)!.trap?.live;
      act(id, "digging your graves on Strike...", async () => {
        if (old) {
          if (filledOf(await lift(ex, g.symbol, old))) return;
          traps.current.delete(old);
        }
        try {
          const laid = await lay(ex, { market, side, stake: yours(g)!.cash, power: p, price, clientId: `tw-${g.id}-${Date.now().toString(36)}` });
          traps.current.set(laid.live, id);
          update(id, (x) => setTrap(x, side, p, laid.price, Date.now(), laid));
          said(laid.price, yours(next)!.trap!.flag);
        } catch (err) {
          if (old) update(id, (x) => (yours(x)?.trap?.live === old ? pullTrap(x) : x));
          throw err;
        }
      });
    },
    [ex, update, announce, act],
  );

  const pull = useCallback(
    (id: string) => {
      const g = latest.current.games.find((x) => x.id === id);
      if (!g || !yours(g)?.trap) return;
      if (!g.live || !yours(g)!.trap!.live) {
        update(id, pullTrap);
        return announce(g, { what: "pull" });
      }
      act(id, "filling in your graves on Strike...", async () => {
        if (await unset(g)) announce(g, { what: "pull" });
      });
    },
    [update, announce, act, unset],
  );

  const flag = useCallback(
    (id: string, price: number | undefined) => {
      const g = latest.current.games.find((x) => x.id === id);
      if (!g) return;
      const now = Date.now();
      if (plantFlag(g, price, now) === g) return;
      const c = yours(g)!.call;
      if (!g.live || !c?.live) {
        update(id, (x) => plantFlag(x, price, now));
        return announce(g, { what: "flag", price });
      }
      if (!ex) return setError("Connect to Strike to summon live thunderclouds");
      act(id, price === undefined ? "clearing your thundercloud on Strike..." : "summoning your thundercloud on Strike...", async () => {
        const at = await replant(g, { live: c.live!, flagOrder: c.flagOrder }, price);
        if (at !== undefined || price === undefined) announce(g, { what: "flag", price: at });
      });
    },
    [ex, update, announce, act, replant],
  );

  const bank = useCallback(
    (id: string) => {
      const g = latest.current.games.find((x) => x.id === id);
      const c = yours(g)?.call;
      if (!g || !c) return;
      if (!c.live) {
        update(id, (x) => bankIn(x, Date.now(), { price: g.price }));
        return announce(g, { what: "bank", price: g.price });
      }
      const market = marketOf(g.symbol);
      if (!ex || !market) return setError("Connect to Strike to give up a live call");
      const liveId = c.live;
      act(id, "giving up the ghost on Strike...", async () => {
        // A thundercloud out comes off first; if it struck on the way, the watch takes that in.
        if (c.flagOrder && (await lift(ex, g.symbol, c.flagOrder))?.Status === "filled") return;
        flags.current.delete(liveId);
        closing.current.add(liveId);
        try {
          const mark = latest.current.marks[g.symbol]?.p ?? g.price;
          const out = await close(ex, { market, mark, live: liveId, feeRate: FEE_RATE, estimate: valueOf(c, mark) });
          known.current.delete(liveId);
          update(id, (x) => {
            if (yours(x)?.call?.live !== liveId) return out === "gone" ? x : settle(x, out.value);
            return out === "gone" ? knockedOut(x, Date.now(), c.koAt) : bankIn(x, Date.now(), out);
          });
          announce(g, out === "gone" ? { what: "ko", price: c.koAt } : { what: "bank", price: out.price, value: out.value, live: true });
        } finally {
          closing.current.delete(liveId);
        }
      });
    },
    [ex, update, announce, act],
  );

  const dismiss = useCallback(() => setError(null), []);

  return { games, enter, call, trap, pull, flag, bank, dismiss, busy, joining, error };
}
