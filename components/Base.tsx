"use client";

import { useEffect, useState } from "react";
import * as fmt from "@/lib/format";
import { arenaAt, gain, KINDS, lineup, placeOf, ROLES, SEATS, worth, YOU, type Arena, type Game, type Kind, type Player, type Role } from "@/lib/game/war";
import { lobbies, me, NAME, rename } from "@/lib/online";
import { play } from "@/lib/sfx";
import { recall, remember } from "@/lib/store";
import type { Mark, Ticker } from "@/lib/strike";
import type { Market } from "@/lib/types";
import type { Mood } from "./art";
import { Spirit } from "./Spirit";

const BLURBS: Record<Kind, string> = { skirmish: "Five rounds, two minutes each. Quick frights.", battle: "Six rounds of ten minutes. Hold your nerve.", war: "Six rounds of four hours. Haunt them till dawn." };
const every = (ms: number) => (ms < 3_600_000 ? `every ${ms / 60_000} minutes` : `every ${ms / 3_600_000} hours`);
const HERO_BLURBS: Record<Role, string> = {
  soldier: "A small, dizzy blob of ectoplasm. Every haunting starts somewhere.",
  commando: "Hooded and patient. All chill, no stop loss.",
  warlord: "Strike's own Bolt, back from the dead. Biggest stake, same rules.",
};

type Props = {
  games: Game[];
  markets: Market[];
  marks: Record<string, Mark>;
  tickers: Record<string, Ticker>;
  live: boolean;
  available: number | null;
  joining: boolean;
  error: string | null;
  onConnect: () => void;
  onSymbol: (symbol: string) => void;
  onEnter: (kind: Kind, role: Role) => void;
  onOpen: (id: string) => void;
};

export function Base({ games, markets, marks, tickers, live, available, joining, error, onConnect, onSymbol, onEnter, onOpen }: Props) {
  const [kind, setKind] = useState<Kind>(() => (recall<string>("kind", "skirmish") in KINDS ? recall<Kind>("kind", "skirmish") : "skirmish"));
  const [role, setRole] = useState<Role>(() => (recall<string>("role", "commando") in ROLES ? recall<Role>("role", "commando") : "commando"));
  const [hover, setHover] = useState<Role | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => remember("kind", kind), [kind]);
  useEffect(() => remember("role", role), [role]);
  const symbols = markets.map((m) => m.symbol);
  const arenas = Object.fromEntries((Object.keys(KINDS) as Kind[]).map((k) => [k, arenaAt(k, now, symbols)])) as Record<Kind, Arena>;
  const arena = arenas[kind];
  const ids = Object.values(arenas)
    .map((a) => a.id)
    .join(",");
  const [crowd, setCrowd] = useState<Record<string, Player[]>>({});
  useEffect(() => {
    let stale = false;
    const look = () => lobbies(ids.split(",")).then((got) => !stale && setCrowd(got));
    look();
    const timer = setInterval(look, 4000);
    return () => {
      stale = true;
      clearInterval(timer);
    };
  }, [ids]);
  const [name, setName] = useState("");
  useEffect(() => {
    me().then((m) => setName(m.name));
  }, []);
  useEffect(() => onSymbol(arena.symbol), [arena.symbol, onSymbol]);
  const running = games.filter((g) => !g.over);
  const finished = games.filter((g) => g.over);
  const net = finished.reduce((sum, g) => {
    const me = g.fighters.find((f) => f.id === YOU)!;
    return sum + worth(me, g.price) - me.stake;
  }, 0);
  const market = markets.find((m) => m.symbol === arena.symbol);
  const joined = games.find((g) => g.id === arena.id);
  const stake = ROLES[role].stake;
  const short = !joined && live && available !== null && available < stake;
  const ready = !!joined || (!!marks[arena.symbol] && !short);
  const when = (a: Arena) => (now >= a.startsAt ? "on now" : `starts in ${fmt.clock(a.startsAt - now)}`);

  return (
    <main className="base">
      <section className="intro">
        <h1>
          Haunt the market <em>on Strike</em>
        </h1>
        <ol className="rules">
          <li>
            <b>Pick a fright and a ghost.</b> Everyone in a fright plays the same Strike market. Your ghost&apos;s stake is your stack.
          </li>
          <li>
            <b>Dig your graves.</b> The kids with the lantern are the price. Click below them to go &#9650; long, above them to go &#9660; short. When the kids walk onto your graves your
            ghosts rise, you&apos;re in, and Strike pays you to be.
          </li>
          <li>
            <b>Summon a thundercloud.</b> Click past the kids to set where you get out. When they walk into it, lightning strikes and you bank. The biggest gain at the final bell wins.
          </li>
        </ol>
      </section>

      <section className="pick" aria-label="The fright">
        <h2>choose your fright</h2>
        <div className="cards" role="radiogroup">
          {(Object.keys(KINDS) as Kind[]).map((k) => {
            const a = arenas[k];
            const m = markets.find((x) => x.symbol === a.symbol);
            const t = tickers[a.symbol];
            const change = t && t.open ? t.last / t.open - 1 : null;
            const yours = games.some((g) => g.id === a.id);
            const people = Math.max(crowd[a.id]?.length ?? 0, yours ? 1 : 0);
            const others = people - (yours ? 1 : 0);
            const seated = Math.min(SEATS, people + Math.min(lineup(a).filter((b) => b.joinsAt <= now).length, Math.max(0, SEATS - people)));
            return (
              <button
                key={k}
                role="radio"
                aria-checked={k === kind}
                className={`card fight ${k === kind ? "on" : ""}`}
                onClick={() => {
                  setKind(k);
                  play("pick");
                }}
              >
                <span className="name">{KINDS[k].name}</span>
                <span className="headline">
                  {KINDS[k].length}, {every(KINDS[k].every)}
                </span>
                <span className="on-market">
                  <span className="dim">on</span> <b>{m?.base ?? a.symbol}</b>
                  <span className="last">{marks[a.symbol] && m ? fmt.price(marks[a.symbol].p, m.tickSize) : "..."}</span>
                  {change !== null && <span className={`change ${change >= 0 ? "good" : "bad"}`}>{fmt.percent(change, true)}</span>}
                </span>
                <span className="lobby">
                  {now >= a.startsAt ? (
                    <span>
                      <span className="good">on now</span>, doors close in <b>{fmt.clock(a.startsAt + KINDS[k].doors - now)}</b>
                    </span>
                  ) : (
                    <span>
                      starts in <b>{fmt.clock(a.startsAt - now)}</b>
                    </span>
                  )}
                  <span className={yours ? "good" : "dim"}>
                    {yours ? "you're in" : `${seated}/${SEATS} in`}
                    {others > 0 && <b className="players">{others === 1 ? " 1 player" : ` ${others} players`}</b>}
                  </span>
                </span>
                <span className="blurb">{BLURBS[k]}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="pick" aria-label="Your ghost">
        <h2>choose your ghost</h2>
        <div className="cards heroes" role="radiogroup">
          {(Object.keys(ROLES) as Role[]).map((r) => {
            const mood: Mood = r === role ? (hover === r ? "attack" : "happy") : hover === r ? "attack" : "ready";
            return (
              <button
                key={r}
                role="radio"
                aria-checked={r === role}
                className={`card hero ${r} ${r === role ? "on" : ""}`}
                onMouseEnter={() => setHover(r)}
                onMouseLeave={() => setHover(null)}
                onClick={() => {
                  setRole(r);
                  play("pick");
                }}
              >
                <span className="stage">
                  <Spirit role={r} mood={mood} className="art" scene />
                </span>
                <span className="rank">{ROLES[r].name}</span>
                <span className="name">{ROLES[r].hero}</span>
                <span className="headline">{fmt.whole(ROLES[r].stake)} stake</span>
                <span className="blurb">{HERO_BLURBS[r]}</span>
              </button>
            );
          })}
        </div>
      </section>

      <button
        className={`go ${live ? "live" : ""}`}
        disabled={!ready || joining}
        onClick={() => {
          play("arm");
          if (joined) onOpen(joined.id);
          else onEnter(kind, role);
        }}
      >
        <span>{joining ? "joining..." : joined ? `back to the ${KINDS[kind].name.toLowerCase()}` : short ? "top up to haunt live" : marks[arena.symbol] ? (live ? "haunt live!" : "haunt!") : "waiting for Strike's price"}</span>
        <small>
          {joined
            ? `You're in as ${ROLES[joined.fighters.find((f) => f.id === YOU)!.role].hero}, ${when(arena)}`
            : short
              ? `${ROLES[role].hero} needs ${fmt.whole(stake)} on Strike and you have ${fmt.money(available ?? 0)} available`
              : `${KINDS[kind].name} on ${market?.base ?? arena.symbol} as ${ROLES[role].hero}, ${fmt.whole(stake)} ${live ? "real stake on Strike" : "paper stake"}, ${when(arena)}`}
        </small>
      </button>
      <label className="handle">
        <span className="dim">haunting as</span>
        <input
          value={name}
          maxLength={20}
          spellCheck={false}
          aria-label="Your name on the board"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => (NAME.test(name.trim()) ? rename(name) : me()).then((m) => m && setName(m.name))}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      </label>
      {error && <p className="error center">{error}</p>}
      {!live && (
        <p className="golive">
          Playing on paper.{" "}
          <button className="link" onClick={onConnect}>
            Connect to Strike
          </button>{" "}
          to dig real graves in Strike&apos;s book.
        </p>
      )}

      {running.length > 0 && (
        <section className="list" aria-label="Your games">
          <h2>your games</h2>
          {running.map((g) => {
            const me = g.fighters.find((f) => f.id === YOU)!;
            const waiting = now < g.startsAt;
            return (
              <button key={g.id} className="game" onClick={() => onOpen(g.id)}>
                <span className="name">
                  {KINDS[g.kind].name} <span className="dim">{g.symbol.replace(/-USD$/, "")}</span> {ROLES[me.role].hero}
                </span>
                <span className="dim">{waiting ? `starts in ${fmt.clock(g.startsAt - now)}` : `${fmt.clock(g.endsAt - now)} left`}</span>
                <span>{me.out ? (me.out.by === "ko" ? "K.O." : "zapped") : fmt.money(worth(me, g.price))}</span>
                <span className="dim">{waiting ? `${g.fighters.length}/${SEATS} in` : `${fmt.ordinal(placeOf(g, YOU))} of ${g.fighters.length}`}</span>
                <span className="go-to">return &rarr;</span>
              </button>
            );
          })}
        </section>
      )}

      {finished.length > 0 && (
        <section className="record" aria-label="Your record">
          <h2>your record</h2>
          <div className="totals">
            <span>
              <b>{finished.length}</b> haunted
            </span>
            <span>
              <b>{finished.filter((g) => placeOf(g, YOU) === 1).length}</b> won
            </span>
            <span>
              <b className={net > 0 ? "good" : net < 0 ? "bad" : ""}>{fmt.money(net, true)}</b> net
            </span>
          </div>
          <ul>
            {finished.slice(0, 5).map((g) => {
              const me = g.fighters.find((f) => f.id === YOU)!;
              const made = gain(me, g.price);
              return (
                <li key={g.id}>
                  <button onClick={() => onOpen(g.id)}>
                    <span>
                      {KINDS[g.kind].name} <span className="dim">{g.symbol.replace(/-USD$/, "")}</span> {ROLES[me.role].hero}
                    </span>
                    <span className="dim">{me.out ? `${me.out.by === "ko" ? "K.O." : "zapped"}, ${fmt.ordinal(placeOf(g, YOU))}` : `${fmt.ordinal(placeOf(g, YOU))} of ${g.fighters.length}`}</span>
                    <span className={made > 0 ? "good" : made < 0 ? "bad" : "dim"}>
                      {fmt.money(worth(me, g.price) - me.stake, true)} <span className="dim">{fmt.gain(made)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
