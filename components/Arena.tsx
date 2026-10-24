"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties } from "react";
import * as fmt from "@/lib/format";
import { candlesFrom, type Tick } from "@/lib/game/ticks";
import type { War } from "@/lib/game/useWar";
import { useBook } from "@/lib/live/book";
import { ahead, join, key as bookKey, levels as bookLevels, type L3Side } from "@/lib/live/l3";
import { BUILDER } from "@/lib/live/session";
import {
  KINDS,
  koDistance,
  leastPower,
  moveOf,
  opening,
  placeOf,
  ROLES,
  roundAt,
  roundEnds,
  rulesOf,
  standingCount,
  STRIKE,
  valueOf,
  worth,
  YOU,
  type Event,
  type Game,
  type Side,
} from "@/lib/game/war";
import { play, type Sound } from "@/lib/sfx";
import { recall, remember } from "@/lib/store";
import type { Candle } from "@/lib/types";
import { COLORS, huesFor, type Mark, type Pick, type Pin } from "./marks";
import { Cutscene, type Scene } from "./Cutscene";
import { Board } from "./Board";
import { Field, type Yours } from "./Field";
import { Spirit } from "./Spirit";


type Moment = { title: string; detail?: string; tone: "good" | "bad" | "plain"; scene?: Scene; n: number };
// A line of what the field says along its foot, coloured by what it's about.
type Line = { text: string; tone: "good" | "bad" | "flag" | "dim" };

type Props = {
  game: Game;
  mark: { p: number; at: number } | null;
  tickSize: number;
  ticks: Tick[];
  war: War;
  scenes: boolean;
  onAgain: () => void;
  onLeave: () => void;
  // Asked before leaving with graves or a position on Strike: keep it running, give it up, or stay.
  leaving: boolean;
  onKeep: () => void;
  onAbandon: () => void;
  onStay: () => void;
};

export function Arena({ game, mark, tickSize, ticks, war, scenes, onAgain, onLeave, leaving, onKeep, onAbandon, onStay }: Props) {
  const kind = KINDS[game.kind];
  const me = game.fighters.find((f) => f.id === YOU)!;
  const role = ROLES[me.role];
  const stake = me.stake;
  const [nowMs, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const [fear, setFear] = useState(() => Math.min(2, Math.max(0, Math.round(recall("fear", 1)))));
  useEffect(() => remember("fear", fear), [fear]);
  // A haunt opens at the top, with the field in view, wherever the start page was scrolled to.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [game.id]);
  const candles = useCandles(ticks);
  const value = worth(me, game.price);
  const made = value - stake;
  const round = roundAt(game, Math.min(nowMs, game.endsAt - 1));
  const rounds = kind.floors.length;
  const most = rulesOf(game).maxPower;
  const least = Math.min(leastPower(game, { ...me, cash: value }, nowMs), most + 1);
  // Three ways to haunt: the least power this round allows, the most the market allows, and halfway between on a log scale.
  const lo = Math.min(least, most);
  const tiers = [lo, Math.min(most, Math.max(lo, Math.round(Math.sqrt(lo * most)))), most];
  const charge = me.call ? me.call.power : tiers[fear];
  const waiting = nowMs < game.startsAt;
  const count = Math.ceil((game.startsAt - nowMs) / 1000);
  const base = game.symbol.replace(/-USD$/, "");

  const [moments, setMoments] = useState<Moment[]>([]);
  const said = useRef(0);
  const seen = useRef<Event | null | undefined>(undefined);
  useEffect(() => {
    const say = (m: Omit<Moment, "n">, sound: Sound) => {
      play(sound);
      const n = ++said.current;
      setMoments((ms) => [...ms, { ...m, n, scene: m.scene && { ...m.scene, n } }]);
    };
    const scene = (s: Omit<Scene, "role" | "n">): Scene => ({ ...s, role: me.role, n: 0 });
    const hpNow = Math.round((10 * worth(me, game.price)) / stake);
    if (seen.current === undefined) {
      seen.current = game.feed[0] ?? null;
      return;
    }
    const fresh: Event[] = [];
    for (const e of game.feed) {
      if (seen.current && e.at === seen.current.at && e.who === seen.current.who && e.what === seen.current.what) break;
      fresh.unshift(e);
    }
    seen.current = game.feed[0] ?? null;
    for (const e of fresh) {
      // The countdown on the field ends in a boo, so the start only needs its sound.
      if (e.what === "start") {
        play("arm");
      } else if (e.what === "join") {
        if (e.who !== "you") play("pick");
      } else if (e.what === "trap") {
        if (e.who === "you") play("earth");
      } else if (e.what === "end") {
        const p = placeOf(game, YOU);
        if (me.out) say({ title: me.out.by === "ko" ? "busted" : "banished", detail: `${fmt.ordinal(p)} of ${game.fighters.length}`, tone: "bad" }, "out");
        else if (p === 1) say({ title: "champion!", detail: fmt.money(made, true), tone: "good", scene: scene({ kind: "victory", you: [hpNow, hpNow], them: [10, 0], title: "champion!", detail: fmt.money(made, true) }) }, "win");
        else
          say(
            { title: `${fmt.ordinal(p)} place`, detail: fmt.money(made, true), tone: made >= 0 ? "good" : "bad", scene: scene({ kind: "end", you: [hpNow, hpNow], them: [10, 10], title: `${fmt.ordinal(p)} place`, detail: fmt.money(made, true) }) },
            p <= 3 ? "enter" : "out",
          );
      } else if (e.who !== "you") {
        if (e.what === "ko" || e.what === "zap") play("out");
      } else if (e.what === "ko") {
        say({ title: "busted!", detail: `${e.power}x was too much power`, tone: "bad", scene: scene({ kind: "ko", side: e.side, you: [10, 0], them: [10, 10], title: "busted!", detail: `${e.power}x was too much power` }) }, "lose");
      } else if (e.what === "zap") {
        const title = "banished!";
        const detail = e.idle ? "no call this round" : "weakest still standing";
        say({ title, detail, tone: "bad", scene: scene({ kind: "zap", you: [hpNow, hpNow], them: [10, 10], title, detail }) }, "zap");
      } else if (e.what === "bank") {
        const gain = e.made ?? 0;
        const hp = Math.max(0, Math.round(10 + (10 * gain) / (e.stake ?? stake)));
        const move = e.move ?? 0;
        const ate = !e.maker && gain < 0 && move >= 0.005;
        const title = e.crit ? "critical hit!" : e.maker ? "struck!" : "you gave up the ghost";
        const detail = ate ? `${fmt.money(move, true)} on the call, ${fmt.money(gain, true)} after Strike's fees` : e.maker ? fmt.money(gain, true) : `${fmt.money(gain, true)} after every fee`;
        say(
          { title, detail, tone: gain >= 0 ? "good" : "bad", scene: scene({ kind: gain >= 0 ? "win" : "lose", side: e.side, you: [10, hp], them: [10, Math.max(0, Math.min(10, 20 - hp))], title, detail }) },
          e.maker ? "thunder" : gain > 0 ? "ready" : "place",
        );
      } else {
        const title = e.maker ? "your ghosts rise!" : `${e.what} ${e.power}x!`;
        const paid = me.call?.maker && me.call.fee < 0 ? `Strike paid you ${fmt.fine(-me.call.fee)}` : "Strike paid you to get in";
        const detail = e.maker ? `${e.what} ${e.power}x from ${fmt.price(e.price ?? 0, tickSize)}, and ${paid}` : e.what === "long" ? `${role.hero} says up` : `${role.hero} says down`;
        say({ title, detail, tone: "plain", scene: scene({ kind: "call", side: e.what, you: [10, 10], them: [10, 10], title, detail }) }, "enter");
      }
    }
  }, [game, stake, me, made, role.hero, tickSize]);
  const moment = moments[0] ?? null;
  const next = () => setMoments((ms) => ms.slice(1));
  useEffect(() => {
    if (!moment || (scenes && moment.scene)) return;
    const timer = setTimeout(() => setMoments((ms) => ms.slice(1)), 1700);
    return () => clearTimeout(timer);
  }, [moment, scenes]);

  // The last seconds before the start and before the bell, ticked off.
  const ticked = useRef(-1);
  useEffect(() => {
    const s = Math.ceil(((waiting ? game.startsAt : game.endsAt) - nowMs) / 1000);
    if (!game.over && s <= (waiting ? 3 : 5) && s > 0 && s !== ticked.current) {
      ticked.current = s;
      play("pick");
    }
  }, [nowMs, waiting, game.startsAt, game.endsAt, game.over]);

  const can = !game.over && !me.out && !war.busy;
  // Giving up at the market carries the builder fee, if there is one; graves and thunderclouds don't.
  const taker = STRIKE.taker + (game.live ? BUILDER.feeBps / 10_000 : 0);
  const bankFee = me.call ? valueOf(me.call, game.price, 0) - valueOf(me.call, game.price, taker) : 0;
  // What giving up the ghost leaves you with right now: the move, less the fee in and the fee for closing at the market.
  const walkAway = me.call ? valueOf(me.call, game.price, taker) - me.call.stake : 0;
  const trap = me.trap ?? null;
  const flag = me.call?.flag ?? trap?.flag;
  // Strike's order book, order by order: where your graves and your thundercloud would stand in its line.
  const l3 = useBook(game.symbol);
  const trapSide = trap?.side;
  const trapPrice = trap?.price;
  const trapAt = trap?.at;
  const holding = me.call?.side ?? trapSide;
  const trapSize = trap?.live ? trap.size : undefined;
  const inLine = useMemo(() => {
    if (!l3.book || !trapSide || trapPrice === undefined || trapAt === undefined) return null;
    const place = join(l3.book, BOOK_SIDE[trapSide], bookKey(trapPrice, tickSize));
    // Live graves are already on Strike by the time they're dug here: the last order in their line of their size is yours, not ahead of you.
    const queue = l3.book[place.side].get(place.price);
    const last = queue?.[queue.length - 1];
    if (trapSize && last && Math.abs(last.size - trapSize) <= trapSize * 0.01) place.ahead.delete(last.id);
    return place;
  }, [l3.book, trapSide, trapPrice, trapAt, trapSize, tickSize]);
  const flagLine = useMemo(
    () => (l3.book && holding && flag !== undefined ? join(l3.book, holding === "long" ? "sell" : "buy", bookKey(flag, tickSize)) : null),
    [l3.book, holding, flag, tickSize],
  );
  const lineAhead = inLine && l3.book ? ahead(l3.book, inLine) : null;
  const flagAhead = flagLine && l3.book ? ahead(l3.book, flagLine) : null;
  // The book changes in place a few times a second; its walls are worked out again only when it does.
  const { book: liveBook, version: bookVersion } = l3;
  const walls = useMemo(
    () =>
      liveBook && bookVersion > 0
        ? (["buy", "sell"] as const).flatMap((side) =>
            bookLevels(liveBook, side, 40).map((l) => ({ p: l.price, side: side === "buy" ? ("long" as const) : ("short" as const), orders: l.orders.map((o) => o.size * l.price) })),
          )
        : [],
    [liveBook, bookVersion],
  );
  // Fills from the tape, kept for a little longer than their puff of dust lasts, so the clock's tick alone doesn't rebuild them.
  const fills = l3.tape?.fills;
  const tick = Math.floor(nowMs / 900);
  const blasts = useMemo(() => (fills ?? []).filter((f) => tick * 900 - f.at < 1800).map((f) => ({ p: Number(f.price), at: f.at })), [fills, tick]);
  const bank = () => can && me.call && war.bank(game.id);
  // Taps are judged against the live price the kids are drawn at, which leads the game's own while it catches up.
  const shownPrice = mark?.p ?? game.price;
  const sideOf = (p: number): Side => (p < shownPrice ? "long" : "short");
  // A click takes the side of the price it lands on, then the nearest tick on that side, so one by the kids is never the price itself.
  // The game server checks against its own copy of the price, a few seconds behind ours or ahead of it, so nothing goes closer
  // than a safe margin past anywhere the price has been in that time, and wider when it's moving fast.
  const recent = candles.slice(-13);
  const typical = recent.length > 1 ? recent.slice(1).reduce((s, k, i) => s + Math.abs(k.c - recent[i].c), 0) / (recent.length - 1) : 0;
  const margin = Math.max(3 * tickSize, shownPrice * 0.0001, typical * 1.5);
  let low = shownPrice;
  let high = shownPrice;
  const last = ticks[ticks.length - 1]?.at ?? 0;
  for (let i = ticks.length - 1; i >= 0 && ticks[i].at >= last - LATELY; i--) {
    low = Math.min(low, ticks[i].p);
    high = Math.max(high, ticks[i].p);
  }
  const onTick = (p: number) => {
    const up = p >= shownPrice;
    let at = (up ? Math.ceil : Math.floor)(p / tickSize - (up ? 1e-9 : -1e-9)) * tickSize;
    if (up && at < high + margin) at = Math.ceil((high + margin) / tickSize - 1e-9) * tickSize;
    if (!up && at > low - margin) at = Math.floor((low - margin) / tickSize + 1e-9) * tickSize;
    return Number(at.toFixed(12));
  };
  const pick = (raw: number): Pick | null => {
    if (!can || waiting) return null;
    const side = sideOf(raw);
    const p = onTick(raw);
    if (me.call) {
      if (side === me.call.side) return null;
      return { p, label: `pays ${fmt.money(valueOf(me.call, p, STRIKE.maker) - me.call.stake, true)}`, color: COLORS.volt, art: "cloud" };
    }
    if (trap && side !== trap.side) return { p, label: "", color: COLORS.volt, art: "cloud" };
    if (least > most) return null;
    return { p, label: `${side} ${charge}x`, color: side === "long" ? COLORS.up : COLORS.down, art: { side, count: COUNTS[fear] } };
  };
  const onPick = (p: number) => {
    if (me.call || (trap && sideOf(p) !== trap.side)) war.flag(game.id, p);
    else war.trap(game.id, sideOf(p), charge, p);
  };
  // Changing the power with graves waiting digs them again at the new power, once the choice settles.
  const relay = useEffectEvent(() => {
    if (trap && !me.call && can && trap.power !== charge) war.trap(game.id, trap.side, charge, trap.price);
  });
  const trapPower = trap?.power;
  useEffect(() => {
    if (trapPower === undefined || trapPower === charge) return;
    const timer = setTimeout(relay, 450);
    return () => clearTimeout(timer);
  }, [charge, trapPower]);
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement && e.key.startsWith("Arrow")) return;
    const nudge = (by: number) => !me.call && setFear((f: number) => Math.min(2, Math.max(0, f + by)));
    if (e.key === "Escape") war.pull(game.id);
    else if (e.key === " ") bank();
    else if (e.key === "ArrowLeft") nudge(-1);
    else if (e.key === "ArrowRight") nudge(1);
    else return;
    e.preventDefault();
  });
  useEffect(() => {
    const handle = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);

  const fighters = game.fighters;
  const pins = useMemo(() => {
    const hues = huesFor(fighters.filter((f) => f.id !== YOU).map((f) => f.id));
    return fighters.flatMap((f): Pin[] => {
      if (f.id === YOU || f.out) return [];
      const hue = hues.get(f.id) ?? COLORS.text;
      if (f.call) return [{ id: f.id, p: f.call.entry, role: f.role, side: f.call.side, hue, call: true }];
      return f.trap ? [{ id: f.id, p: f.trap.price, role: f.role, side: f.trap.side, hue, call: false }] : [];
    });
  }, [fighters]);
  const marks = useMemo(
    (): Mark[] =>
      fighters
        .filter((f) => f.out)
        .map((f) => ({ t: f.out!.at, p: f.out!.price, glyph: f.out!.by === "ko" ? "BUSTED" : "⚡", color: f.id === YOU ? COLORS.down : f.out!.by === "ko" ? COLORS.dim : COLORS.volt })),
    [fighters],
  );
  // How your last call ended, so the field can show it: struck by your thundercloud, busted, or given up.
  const ended = game.feed.find((e) => e.who === "you" && (e.what === "bank" || e.what === "ko"));
  const yours: Yours = {
    ...(trap && !me.call && { trap: { side: trap.side, price: trap.price, at: trap.at, power: trap.power, count: COUNTS[fear], ahead: lineAhead?.orders } }),
    ...(me.call && { call: { side: me.call.side, entry: me.call.entry, at: me.call.at, power: me.call.power, count: COUNTS[fear], maker: !!me.call.maker, koAt: me.call.koAt, move: moveOf(me.call, game.price) } }),
    ...(flag !== undefined && { flag: { price: flag, banks: me.call ? valueOf(me.call, flag, STRIKE.maker) - me.call.stake : undefined, ahead: flagAhead?.orders } }),
    ...(ended && { end: { by: ended.what === "ko" ? "bust" : ended.maker ? "cloud" : "hand", at: ended.at } }),
  };
  // The give-up button shows how the call stands by what it would walk away with: yellow at about even, pulsing toward red as the
  // loss grows and toward green as the gain grows, deeper and quicker the further it goes, all the way at half the stake. In four
  // steps, so the beat doesn't start over with every tick.
  const swing = me.call ? Math.max(-1, Math.min(1, walkAway / (me.call.stake * 0.5))) : 0;
  const heat = Math.round(Math.abs(swing) * 4);
  const glow = heat ? heatOf(swing < 0 ? ROSE : MINT, heat) : null;
  // What the field says along its foot: what you can do now, the whole time (hints); and in their place for a few seconds,
  // anything brief: Strike's word on something that didn't go through, or what's on its way to Strike while it is.
  const hints: Line[] = me.out
    ? [{ text: me.out.by === "ko" ? "you got busted" : "you were banished", tone: "bad" }, ...(game.over ? [] : [{ text: "watch the rest, or haunt again", tone: "dim" as const }])]
    : game.over
      ? []
      : me.call
        ? [
            { text: `${me.call.side} ${me.call.power}x`, tone: me.call.side === "long" ? "good" : "bad" },
            { text: `click ${me.call.side === "long" ? "above" : "below"} them for a thundercloud`, tone: "flag" },
          ]
        : [
            trap?.side === "short" ? { text: "click below them for a thundercloud", tone: "flag" } : { text: `click below them to ${trap ? "move your graves" : "go long"}`, tone: "good" },
            trap?.side === "long" ? { text: "click above them for a thundercloud", tone: "flag" } : { text: `click above them to ${trap ? "move your graves" : "go short"}`, tone: "bad" },
          ];
  const [heard, setHeard] = useState<{ text: string; at: number } | null>(null);
  if (war.error && war.error !== heard?.text) setHeard({ text: war.error, at: nowMs });
  else if (!war.error && heard) setHeard(null);
  const brief = war.busy ? { text: war.busy, tone: "busy" } : heard && nowMs - heard.at < BRIEF_MS ? { text: heard.text, tone: "bad" } : null;
  const steps = Array.from({ length: Math.max(0, rounds - 1) }, (_, r) => roundEnds(game, r));
  // What's next on the clock: the start in the lobby, then each new round, then the final bell.
  const nextAt = waiting ? game.startsAt : (steps.find((t) => t > nowMs) ?? game.endsAt);
  const hurry = !waiting && nextAt === game.endsAt && nextAt - nowMs < 10_000;
  const away = koDistance(me.call ?? opening("long", charge, game.price, Math.max(me.cash, 1), nowMs));

  return (
    <main className="arena">
      <section className="field">
        <div className="corner">
          <button className="back" onClick={onLeave} title="Back to the start: the game carries on" aria-label="Back to the start">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M21 12H5M12 4l-8 8 8 8" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        {!waiting && (
          <div className="corner right">
            <span className="chip" title="Each round raises the least power you can haunt with">
              round {round + 1}/{rounds}
              {game.live && <span className="tag">live</span>}
            </span>
            {!game.over && nowMs < game.endsAt && (
              <div className={`timer ${hurry ? "hurry" : ""}`} title={nextAt === game.endsAt ? "Until the final bell" : `Until round ${round + 1} ends`}>
                <b>{fmt.clock(nextAt - nowMs)}</b>
              </div>
            )}
          </div>
        )}
        <Field
            key={game.id}
            candles={candles}
            intervalMs={VIEW.candleMs}
            mark={mark?.p ?? null}
            tickSize={tickSize}
            reach={VIEW.reach}
            yours={yours}
            role={me.role}
            walls={walls}
          coin={base}
            blasts={blasts}
            marks={marks}
            pins={pins}
            pick={pick}
            onPick={onPick}
          />
        {waiting && !(count <= 10) && (
          <div className="timer lobby" title="Everyone starts together when the lobby closes">
            <small>lobby</small>
            <b>{fmt.clock(nextAt - nowMs)}</b>
          </div>
        )}
        {waiting && count <= 10 && (
          <div key={count} className="count" aria-hidden="true">
            <b>{count}</b>
          </div>
        )}
        {!waiting && !game.over && nowMs - game.startsAt < 1200 && (
          <div className="count boo" aria-hidden="true">
            <b>boo!</b>
            <small>the haunting begins</small>
          </div>
        )}
        {moment &&
          (scenes && moment.scene ? (
            <Cutscene key={moment.n} scene={moment.scene} onDone={next} />
          ) : (
            <div key={moment.n} className={`banner ${moment.tone === "plain" ? "calm" : moment.tone}`} role="status">
              <b>{moment.title}</b>
              {moment.detail && <span>{moment.detail}</span>}
            </div>
          ))}
        {game.over && !moment && <Debrief game={game} onAgain={onAgain} onLeave={onLeave} />}
        {leaving && (
          <div className="leave" role="dialog" aria-label="Leave the game">
            <button className="close" onClick={onStay} aria-label="Stay in the game">
              &times;
            </button>
            <b>your ghosts are still out on Strike</b>
            <p>
              {me.call ? `Your ${me.call.side} position is open on Strike.` : "Your graves are resting on Strike as real orders."} Keep haunting and the game carries on, then takes everything off Strike at the final bell, as long as this tab stays open.
            </p>
            <div className="choices">
              <button className="plain" onClick={onKeep}>
                keep haunting
              </button>
              <button className="big" onClick={onAbandon}>
                {me.call ? "give up the ghost and leave" : "fill in the graves and leave"}
              </button>
            </div>
          </div>
        )}
        {(brief || hints.length > 0) && (
          <div className={`say ${brief ? `brief ${brief.tone}` : me.call || me.out ? "" : "two"}`} role="status" aria-live="polite">
            {brief ? (
              <span key={brief.text}>{brief.text}</span>
            ) : (
              hints.map((line) => (
                <span key={line.text} className={line.tone}>
                  {line.text}
                </span>
              ))
            )}
          </div>
        )}
      </section>

      <Board game={game} round={round} waiting={waiting} />

      <section className="deck" aria-label="Your controls">
        <div className="me">
          <Spirit role={me.role} mood={me.out ? "ko" : me.call ? "attack" : made > 0 ? "happy" : "ready"} className="portrait" spin />
          <div className="stack">
            <span className="label">funds</span>
            <b>{fmt.money(value)}</b>
            <span className={made > 0 ? "good" : made < 0 ? "bad" : "dim"}>
              {fmt.money(made, true)} <span className="dim">{fmt.gain(made / stake)}</span>
            </span>
          </div>
        </div>

        <div className={`power ${me.call || !can ? "locked" : ""}`}>
          <span className="label">power</span>
          <div className="fears" role="radiogroup" aria-label="Power" style={{ "--at": fear } as CSSProperties}>
            <span className="thumb" aria-hidden="true" />
            {FEARS.map((name, i) => (
              <button key={name} role="radio" aria-checked={fear === i} className={fear === i ? "on" : ""} disabled={!!me.call || !can} onClick={() => setFear(i)} title={FEAR_TIPS[i]}>
                <b>{name}</b>
                <small>{tiers[i]}x</small>
              </button>
            ))}
          </div>
          <span className="readout dim">
            {me.call ? `${me.call.power}x, ` : ""}{(away * 100).toFixed(1)}% away from being busted{!me.call && !waiting && fear === 0 && round > 0 ? `, the least round ${round + 1} allows` : ""}
          </span>
        </div>

        <div className="orders">
          {me.out ? (
            <button className="plain" onClick={onAgain}>
              haunt again
            </button>
          ) : me.call ? (
            <button
              className={`order bank ${glow ? "hot" : ""}`}
              style={glow ?? undefined}
              onClick={bank}
              disabled={!can}
              title={`What you walk away with if you give up now, after every fee: Strike's fee to get in and ${fmt.money(bankFee)} for closing at the market. Hold on and a thundercloud pays you instead (space)`}
            >
              <span>give up the ghost</span>
              <small>{fmt.money(walkAway, true)}</small>
            </button>
          ) : trap && !game.over ? (
            <button className="plain clear" onClick={() => war.pull(game.id)} disabled={!!war.busy} title="Take your graves and any thundercloud away, to dig on the other side (Esc)">
              clear graves
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function Debrief({ game, onAgain, onLeave }: { game: Game; onAgain: () => void; onLeave: () => void }) {
  const me = game.fighters.find((f) => f.id === YOU)!;
  const value = worth(me, game.price);
  const made = value - me.stake;
  const place = placeOf(game, YOU);
  const badges = [
    place === 1 && { icon: "★", name: "champion" },
    !me.out && { icon: "⛨", name: "survivor" },
    me.crits > 0 && { icon: "⚡", name: me.crits > 1 ? `critical hit x${me.crits}` : "critical hit" },
  ].filter((m): m is { icon: string; name: string } => !!m);
  return (
    <div className="debrief" role="dialog" aria-label="The result">
      <Spirit role={me.role} mood={place === 1 ? "happy" : me.out ? "ko" : made >= 0 ? "happy" : "hurt"} className="portrait" />
      <div>
        <h2>{me.out ? (me.out.by === "ko" ? "busted" : "banished") : place === 1 ? "champion!" : `${fmt.ordinal(place)} place`}</h2>
        <p>
          {fmt.money(me.stake)} &rarr; <b>{fmt.money(value)}</b>{" "}
          <span className={made > 0 ? "good" : made < 0 ? "bad" : "dim"}>
            ({fmt.money(made, true)}, {fmt.gain(made / me.stake)})
          </span>
        </p>
        <p className="dim">
          {fmt.ordinal(place)} of {game.fighters.length}, {standingCount(game)} left standing
        </p>
        {!!me.liquidity && (
          <p className="dim">
            You added <b>{fmt.money(me.liquidity)}</b> to Strike&apos;s order book and earned {fmt.fine(me.liquidity * -STRIKE.maker)} in maker rebates
          </p>
        )}
        {badges.length > 0 && (
          <ul className="badges">
            {badges.map((m) => (
              <li key={m.name}>
                <i>{m.icon}</i>
                {m.name}
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <button className="big" onClick={onAgain} autoFocus>
            haunt again
          </button>
          <button className="plain" onClick={onLeave}>
            the start
          </button>
          <button className="plain" onClick={() => share(game, place, made / me.stake)}>
            share
          </button>
        </div>
      </div>
    </div>
  );
}

function share(game: Game, place: number, change: number) {
  const role = ROLES[game.fighters.find((f) => f.id === YOU)!.role];
  const result = place === 1 ? "won" : `came ${fmt.ordinal(place)} of ${game.fighters.length} in`;
  const text = `I ${result} a Boltergeist ${KINDS[game.kind].name.toLowerCase()} on ${game.symbol.replace(/-USD$/, "")} as ${role.hero}: ${fmt.gain(change)} on Strike's live prices. @strikeperps`;
  window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(location.origin)}`, "_blank", "noopener");
}

const BOOK_SIDE: Record<Side, L3Side> = { long: "buy", short: "sell" };
// The give-up button's yellow, and what it runs to: red for a loss, green for a gain. At each of the four steps (heat) it rests a
// little further from the yellow and pulses all the way to its colour at the last, the beat quickening from 1.6 s to 0.6 s.
const VOLT = [255, 225, 74];
const ROSE = [255, 77, 109];
const MINT = [43, 245, 181];
const BEATS = [1.6, 1.15, 0.85, 0.6];
function heatOf(to: number[], heat: number): CSSProperties {
  const at = (f: number, dark = 1) => `rgb(${VOLT.map((c, i) => Math.round((c + (to[i] - c) * f) * dark)).join(", ")})`;
  const hot = 0.3 + 0.175 * heat;
  return { "--rest": at(0.12 * heat), "--rest-edge": at(0.12 * heat, 0.66), "--hot": at(hot), "--hot-edge": at(hot, 0.66), "--beat": `${BEATS[heat - 1]}s` } as CSSProperties;
}
const FEARS = ["whisper", "howl", "shriek"];
// How many graves each digs, and so how many ghosts rise when they spring.
const COUNTS = [4, 8, 12];
const FEAR_TIPS = ["The least power this round allows: hardest to bust", "Halfway between", "The most power the market allows: the biggest swings"];
// How long Strike's word on something that didn't go through stands in for the field's hints, ms.
const BRIEF_MS = 5000;
// How far back the game server's copy of the price can be: Strike's price a few seconds old, kept by the server a moment more.
const LATELY = 8000;

// Every length of haunt is drawn at the Jump Scare's pace, five seconds a tile from the live prices, so the field moves alike in
// all of them; the rounds and the rules keep their own clock.
const VIEW = KINDS.skirmish;

function useCandles(ticks: Tick[]): Candle[] {
  return useMemo(() => candlesFrom(ticks, VIEW.candleMs), [ticks]);
}
