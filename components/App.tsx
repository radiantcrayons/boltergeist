"use client";

import { useEffect, useRef, useState } from "react";
import * as fmt from "@/lib/format";
import { loadTicks, saveTicks, withTick, type Tick } from "@/lib/game/ticks";
import { useWar } from "@/lib/game/useWar";
import { YOU, type Kind, type Role } from "@/lib/game/war";
import { balance as fetchBalance, loadSession, saveSession, type Balance, type Session } from "@/lib/live/session";
import { play, setSound } from "@/lib/sfx";
import { recall, remember } from "@/lib/store";
import { markets as loadMarkets, NETWORK, stream, type Mark, type Ticker } from "@/lib/strike";
import type { Market } from "@/lib/types";
import { Arena } from "./Arena";
import { Logo } from "./art/Effects";
import { Base } from "./Base";
import { Connect } from "./Connect";

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
    return stream({
      marks: (m) => {
        setMarks((all) => ({ ...all, ...m }));
        setTicks((all) => {
          const next = { ...all };
          for (const [s, mark] of Object.entries(m)) next[s] = withTick(next[s] ?? loadTicks(s), mark);
          return next;
        });
      },
      tickers: (t) => setTickers((all) => ({ ...all, ...t })),
      status: setStreaming,
    });
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
    for (const s of new Set([symbol, ...games.filter((g) => !g.over).map((g) => g.symbol)])) if (ticks[s]) saveTicks(s, ticks[s]);
  }, [ticks, games, symbol]);
  useEffect(() => remember("open", open), [open]);
  useEffect(() => remember("symbol", symbol), [symbol]);
  useEffect(() => remember("live", live), [live]);
  useEffect(() => {
    remember("sound", sound);
    setSound(sound);
  }, [sound]);

  const game = games.find((g) => g.id === open) ?? null;
  const shown = game?.symbol ?? symbol;
  const market = markets?.find((m) => m.symbol === shown);
  const goingLive = live && !!session;
  const enter = (kind: Kind, role: Role, real = goingLive) =>
    void war.enter(kind, role, real).then((id) => {
      if (id) setOpen(id);
    });

  if (fatal) return <div className="fatal">Can&apos;t reach Strike right now: {fatal}</div>;
  if (!markets) return <div className="fatal dim">reaching Strike...</div>;

  return (
    <div className="app">
      <header className="top">
        <button className="logo" onClick={() => setOpen(null)} title="Back to the start">
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
        <div className="modes" role="radiogroup" aria-label="Paper or live">
          <button role="radio" aria-checked={!live} className={!live ? "on" : ""} onClick={() => setLive(false)}>
            paper
          </button>
          <button
            role="radio"
            aria-checked={live}
            className={`live ${live ? "on" : ""}`}
            onClick={() => {
              setLive(true);
              if (!session) setConnecting(true);
            }}
          >
            live{NETWORK === "testnet" ? " testnet" : ""}
          </button>
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
          onLeave={() => setOpen(null)}
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
