"use client";

import { useEffect, useRef, useState } from "react";
import * as fmt from "@/lib/format";
import { loadTicks, saveTicks, withTick, type Tick } from "@/lib/game/ticks";
import { useWar } from "@/lib/game/useWar";
import { YOU, type Game, type Kind, type Role } from "@/lib/game/war";
import { balance as fetchBalance, loadSession, saveSession, type Balance, type Session } from "@/lib/live/session";
import { play, setHaunting, setSound } from "@/lib/sfx";
import { recall, remember } from "@/lib/store";
import { markets as loadMarkets, NETWORK, stream, type Mark, type Network, type Ticker } from "@/lib/strike";
import type { Market } from "@/lib/types";
import { Arena } from "./Arena";
import { Logo } from "./art/Effects";
import { Base } from "./Base";
import { Connect } from "./Connect";

type Mode = "paper" | Network;
const MODES: Mode[] = ["paper", "testnet", "mainnet"];
const MODE_TIPS: Record<Mode, string> = {
  paper: "Play with pretend money on Strike's live prices",
  testnet: "Play live on Strike's testnet, with test money",
  mainnet: "Play live on Strike, with real money",
};
// Price history is kept apart for each network: the same market can stand at another price on testnet.
const kept = (symbol: string) => (NETWORK === "mainnet" ? symbol : `${NETWORK}.${symbol}`);

// Whether you have graves resting or a position open on Strike in a game that's still running.
const outOnStrike = (g: Game | null) => {
  const me = g && g.live && !g.over ? g.fighters.find((f) => f.id === YOU) : undefined;
  return !!(me?.call?.live || me?.trap?.live);
};

export default function App() {
  const [markets, setMarkets] = useState<Market[] | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [tickers, setTickers] = useState<Record<string, Ticker>>({});
  const [streaming, setStreaming] = useState(false);
  const [symbol, setSymbol] = useState(() => recall("symbol", "BTC-USD"));
  const [ticks, setTicks] = useState<Record<string, Tick[]>>({});
  const [open, setOpen] = useState<string | null>(() => recall("open", null));
  const [sound, setSoundOn] = useState(() => recall("sound", true));
  const [session, setSession] = useState<Session | null>(loadSession);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [live, setLive] = useState(() => recall("live", false));
  const [connecting, setConnecting] = useState(false);
  const war = useWar(marks, markets ?? [], session);

  useEffect(() => {
    loadMarkets().then(setMarkets, (err: Error) => setFatal(err.message));
    // Every market's marks come in together. They're handed on at most four times a second, each one still kept for the ticks.
    let held: Record<string, Mark>[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = 0;
    const flush = () => {
      timer = null;
      last = Date.now();
      const batches = held;
      held = [];
      setMarks((all) => Object.assign({ ...all }, ...batches));
      setTicks((all) => {
        const next = { ...all };
        for (const m of batches) for (const [s, mark] of Object.entries(m)) next[s] = withTick(next[s] ?? loadTicks(kept(s)), mark);
        return next;
      });
    };
    const stop = stream({
      marks: (m) => {
        held.push(m);
        timer ??= setTimeout(flush, Math.max(0, last + 250 - Date.now()));
      },
      tickers: (t) => setTickers((all) => ({ ...all, ...t })),
      status: setStreaming,
    });
    return () => {
      stop();
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    saveSession(session);
    if (!session) return;
    let stale = false;
    const look = () =>
      fetchBalance(session.keys).then(
        (b) => !stale && setBalance(b),
        () => {},
      );
    look();
    const timer = setInterval(look, 10_000);
    return () => {
      stale = true;
      clearInterval(timer);
    };
  }, [session, war.busy]);

  const savedAt = useRef(0);
  const games = war.games;
  useEffect(() => {
    if (Date.now() - savedAt.current < 10_000) return;
    savedAt.current = Date.now();
    for (const s of new Set([symbol, ...games.filter((g) => !g.over).map((g) => g.symbol)])) if (ticks[s]) saveTicks(kept(s), ticks[s]);
  }, [ticks, games, symbol]);
  useEffect(() => remember("open", open), [open]);
  useEffect(() => remember("symbol", symbol), [symbol]);
  useEffect(() => remember("live", live), [live]);
  useEffect(() => {
    remember("sound", sound);
    setSound(sound);
  }, [sound]);

  const game = games.find((g) => g.id === open) ?? null;
  const inGame = !!game;
  // Sound stays on from the haunt button while a game is joining or open, and stops back on the start page.
  useEffect(() => {
    if (inGame) setHaunting(true);
    else if (!war.joining) setHaunting(false);
  }, [inGame, war.joining]);
  // Leaving a game with graves or a position on Strike asks first; closing the tab then makes the browser ask too.
  const [leaving, setLeaving] = useState(false);
  const leave = () => {
    setLeaving(false);
    war.dismiss();
    setOpen(null);
  };
  const tryLeave = () => (outOnStrike(game) ? setLeaving(true) : leave());
  const abandon = () => {
    const me = game?.fighters.find((f) => f.id === YOU);
    if (game && me?.call) war.bank(game.id);
    else if (game && me?.trap) war.pull(game.id);
    leave();
  };
  const anyOut = games.some(outOnStrike);
  useEffect(() => {
    if (!anyOut) return;
    const hold = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    addEventListener("beforeunload", hold);
    return () => removeEventListener("beforeunload", hold);
  }, [anyOut]);

  const shown = game?.symbol ?? symbol;
  const market = markets?.find((m) => m.symbol === shown);
  const goingLive = live && !!session;
  // Paper plays on mainnet's prices; testnet and mainnet are live there. Another network means starting the page again on it.
  const mode: Mode = live ? NETWORK : "paper";
  const choose = (next: Mode) => {
    const net: Network = next === "paper" ? "mainnet" : next;
    if (net !== NETWORK) {
      remember("net", net);
      remember("live", next !== "paper");
      location.reload();
      return;
    }
    setLive(next !== "paper");
    if (next !== "paper" && !session) setConnecting(true);
  };
  const enter = (kind: Kind, role: Role, real = goingLive) =>
    void war.enter(kind, role, real).then((id) => {
      if (id) setOpen(id);
    });

  if (fatal) return <div className="fatal">Can&apos;t reach Strike right now: {fatal}</div>;
  if (!markets) return <div className="fatal dim">reaching Strike...</div>;

  return (
    <div className="app">
      <header className="top">
        <button className="logo" onClick={tryLeave} title="Back to the start">
          <Logo className="mark" />
          <span>
            bolt<b>ergeist</b>
          </span>
        </button>
        <div className="price" title={`${shown} mark price on Strike`}>
          <span className={`pulse ${streaming ? "on" : ""}`} />
          <span className="dim">{market?.base ?? shown}</span>
          {marks[shown] && market ? fmt.price(marks[shown].p, market.tickSize) : "..."}
        </div>
        <div className="modes" role="radiogroup" aria-label="Paper, testnet or mainnet">
          {MODES.map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} className={`${m} ${mode === m ? "on" : ""}`} onClick={() => choose(m)} title={MODE_TIPS[m]}>
              {m}
            </button>
          ))}
        </div>
        <button className={`account ${session ? "on" : ""}`} onClick={() => setConnecting(true)}>
          {session ? (balance ? fmt.money(balance.available) : "connected") : "connect"}
        </button>
        <button
          className={`toggle ${sound ? "on" : ""}`}
          onClick={() => {
            setSoundOn(!sound);
            if (!sound) play("pick");
          }}
          aria-label={sound ? "Turn the sound off" : "Turn the sound on"}
        >
          {sound ? "sound on" : "sound off"}
        </button>
      </header>
      {game ? (
        <Arena
          key={game.id}
          game={game}
          mark={marks[game.symbol] ?? null}
          tickSize={market?.tickSize ?? 0.01}
          ticks={ticks[game.symbol] ?? []}
          war={war}
          scenes={false}
          onAgain={() => enter(game.kind, game.fighters.find((f) => f.id === YOU)!.role, !!game.live && !!session)}
          leaving={leaving}
          onLeave={tryLeave}
          onKeep={leave}
          onAbandon={abandon}
          onStay={() => setLeaving(false)}
        />
      ) : (
        <Base
          games={games}
          markets={markets}
          marks={marks}
          tickers={tickers}
          live={goingLive}
          available={balance?.available ?? null}
          joining={war.joining}
          error={war.error}
          onConnect={() => setConnecting(true)}
          onSymbol={setSymbol}
          onEnter={(kind, role) => enter(kind, role)}
          onOpen={setOpen}
        />
      )}
      {connecting && (
        <Connect
          session={session}
          balance={balance}
          onSession={(s) => {
            setSession(s);
            setBalance(null);
            if (s) play("ready");
          }}
          onClose={() => setConnecting(false)}
        />
      )}
    </div>
  );
}
