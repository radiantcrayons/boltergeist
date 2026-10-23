"use client";

import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import * as fmt from "@/lib/format";
import { foughtIn, gain, ROLES, SEATS, standingCount, standings, worth, YOU, type Fighter, type Game, type Role } from "@/lib/game/war";
import s from "./Board.module.css";
import { huesFor } from "./marks";

type Props = { game: Game; round: number; waiting: boolean };
type Tone = "ko" | "zap" | "long" | "short" | "ambushLong" | "ambushShort" | "ready" | "idle";
type Seat = { id: string; place: number; name: string; role: Role; bot: boolean; live: boolean; you: boolean; hue?: string; text: string; tone: Tone; g: number; title: string };

const SLIDE = 560;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const REST = "0 0 0 0 rgba(0, 0, 0, 0)";
const LIFT = "0 16px 30px -8px rgba(0, 0, 0, 0.85)";

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");
const isCall = (t: Tone) => t === "long" || t === "short";
const isOut = (t: Tone) => t === "ko" || t === "zap";
const signOf = (n: number) => (Math.abs(n) < 0.0005 ? 0 : Math.sign(n));
const yOf = (translate: string) => (translate === "none" ? 0 : parseFloat(translate.split(" ")[1] ?? "0") || 0);
const kOf = (scale: string) => (scale === "none" ? 1 : parseFloat(scale) || 1);
const arrows = (text: string) => text.split(/([▲▼])/).map((bit, i) => (i % 2 ? <b key={i} className={s.arrow}>{bit}</b> : bit));

function stateOf(f: Fighter, ready: boolean): [string, Tone] {
  if (f.out) return f.out.by === "ko" ? ["K.O.", "ko"] : ["banished", "zap"];
  if (f.call) return [`${f.call.side === "long" ? "▲" : "▼"} ${f.call.power}x`, f.call.side];
  if (f.trap) return f.trap.side === "long" ? ["graves ▲", "ambushLong"] : ["graves ▼", "ambushShort"];
  return ready ? ["ready", "ready"] : ["idle", "idle"];
}

// Slides still running, so a panel that moves again mid-slide carries on from where it is.
const slides = new WeakMap<HTMLElement, Animation[]>();

// A riser lifts and passes over the panels it overtakes; a faller sinks and passes under them, the further the more.
function slide(el: HTMLElement, dy: number, k: number, far: number, delay: number) {
  slides.get(el)?.forEach((a) => a.cancel());
  const up = dy > 0;
  const timing = { duration: SLIDE, delay, fill: "backwards" as const };
  el.style.zIndex = up ? "3" : "0";
  const move = el.animate({ translate: [`0 ${dy}px`, "0 0"] }, { ...timing, easing: EASE });
  const lift = el.animate(
    up
      ? { scale: [k, 1.02 + 0.03 * far, 1], boxShadow: [REST, LIFT, REST], offset: [0, 0.3, 1] }
      : { scale: [k, 0.99 - 0.03 * far, 1], filter: ["brightness(1)", `brightness(${0.88 - 0.25 * far})`, "brightness(1)"], offset: [0, 0.3, 1] },
    { ...timing, easing: "ease-out" },
  );
  slides.set(el, [move, lift]);
  move.onfinish = () => {
    if (slides.get(el)?.[0] !== move) return;
    el.style.zIndex = "";
    slides.delete(el);
  };
}

function enter(el: HTMLElement, delay: number) {
  el.animate({ opacity: [0, 1], translate: ["0 12px", "0 0"], scale: [0.97, 1] }, { duration: 460, delay, easing: EASE, fill: "backwards" });
}

// Everyone in the game, best first: each panel slides to its new place when the order changes. Drawn again only when the game
// or the round changes, not on every tick of the clock.
export const Board = memo(function Board({ game, round, waiting }: Props) {
  const list = useRef<HTMLOListElement>(null);
  const tops = useRef(new Map<string, number>());
  const gone = useRef(new Set<string>());
  const standing = standingCount(game);
  const ranked = standings(game);
  const hues = huesFor(game.fighters.filter((f) => f.id !== YOU).map((f) => f.id));
  // The panels are measured only when the order changes or someone goes out, not on every tick of the clock.
  const order = ranked.map((f) => `${f.id}${f.out ? "!" : ""}`).join(" ");

  useLayoutEffect(() => {
    const ol = list.current;
    if (!ol) return;
    const first = tops.current.size === 0;
    const now = new Map<string, number>();
    const moves: { el: HTMLElement; dy: number; k: number; far: number }[] = [];
    const fresh: HTMLElement[] = [];
    const out = new Set<string>();
    let fell = false;
    for (const el of Array.from(ol.children) as HTMLElement[]) {
      const id = el.dataset.id ?? "";
      const top = el.offsetTop;
      const was = tops.current.get(id);
      now.set(id, top);
      if (el.classList.contains(s.out)) {
        out.add(id);
        fell ||= !first && !gone.current.has(id);
      }
      if (was === undefined) fresh.push(el);
      else if (was !== top) {
        const style = getComputedStyle(el);
        const dy = was - top + yOf(style.translate);
        moves.push({ el, dy, k: kOf(style.scale), far: Math.min(1, Math.abs(dy) / (el.offsetHeight * 3)) });
      }
    }
    tops.current = now;
    gone.current = out;
    if (reduced()) return;
    fresh.forEach((el, i) => enter(el, first ? i * 45 : 0));
    // A knockout lands where it happened before the board closes over it.
    moves.forEach((m) => slide(m.el, m.dy, m.k, m.far, fell ? 420 : 0));
  }, [order]);

  return (
    <aside className={s.board} aria-label="The players">
      <h2 className={s.head}>
        the board{" "}
        <span className={s.count}>
          <Swap text={waiting ? `${game.fighters.length}/${SEATS} in` : `${standing} standing`} />
        </span>
      </h2>
      <ol ref={list} className={s.list}>
        {ranked.map((f, i) => {
          const [text, tone] = stateOf(f, waiting || foughtIn(game, f, round));
          return (
            <Panel
              key={f.id}
              id={f.id}
              place={i + 1}
              name={f.id === YOU ? "you" : f.name}
              role={f.role}
              bot={!!f.nerve}
              live={!!f.live && f.id !== YOU}
              you={f.id === YOU}
              hue={f.id === YOU ? undefined : hues.get(f.id)}
              text={text}
              tone={tone}
              g={gain(f, game.price)}
              title={`${fmt.money(worth(f, game.price))} from ${fmt.whole(f.stake)}`}
            />
          );
        })}
      </ol>
    </aside>
  );
});

// One player. It pulses as they spring into a call, flashes and dims when they go out, and shines as you climb or someone takes the lead.
const Panel = memo(function Panel({ id, place, name, role, bot, live, you, hue, text, tone, g, title }: Seat) {
  const card = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLElement>(null);
  const flash = useRef<HTMLElement>(null);
  const sheen = useRef<HTMLElement>(null);
  const seen = useRef({ tone, place });

  useEffect(() => {
    const was = seen.current;
    seen.current = { tone, place };
    if (reduced()) return;
    if (isCall(tone) && !isCall(was.tone)) {
      ring.current?.animate({ opacity: [0.95, 0], transform: ["scale(1)", "scale(1.04, 1.4)"] }, { duration: 720, easing: EASE });
      card.current?.animate({ transform: ["scale(1)", "scale(1.035)", "scale(1)"] }, { duration: 380, easing: "ease-out" });
    }
    if (isOut(tone) && !isOut(was.tone)) {
      flash.current?.animate({ opacity: [0, 0.6, 0] }, { duration: 720, easing: "ease-out" });
      card.current?.animate({ translate: ["0 0", "-6px 0", "5px 0", "-3px 0", "2px 0", "0 0"] }, { duration: 460, easing: "ease-out" });
    }
    if (place < was.place && (you || place === 1)) sheen.current?.animate({ opacity: [1, 1], transform: ["translateX(-100%)", "translateX(100%)"] }, { duration: 950, delay: 160, easing: "ease-in-out" });
    if (place > was.place) sheen.current?.getAnimations().forEach((a) => a.cancel());
  }, [tone, place, you]);

  return (
    <li data-id={id} className={cx(s.row, s[tone], you && s.you, isOut(tone) && s.out, place === 1 && s.lead)}>
      <div ref={card} className={s.card}>
        <span className={s.place}>
          <Swap text={String(place)} n={place} />
        </span>
        <span className={s.who}>
          <span className={s.name}>
            {hue && <i className={s.hue} style={{ background: hue }} aria-hidden="true" />}
            {name}
          </span>
          <span className={s.tags}>
            <small className={cx(s.hero, s[role])}>{ROLES[role].hero}</small>
            {bot && <small className={s.bot}>bot</small>}
            {live && <small className={s.live}>live</small>}
          </span>
        </span>
        <span className={s.score}>
          <Gain g={g} title={title} />
          <span className={s.chip}>
            <Swap text={text} n={isOut(tone) ? 1 : 0} show={arrows} />
          </span>
        </span>
        <i ref={flash} className={s.flash} />
        <i ref={sheen} className={s.sheen} />
      </div>
      <i ref={ring} className={s.ring} />
    </li>
  );
});

// The gain counts its way to each new value, and flashes when it turns or jumps.
function Gain({ g, title }: { g: number; title: string }) {
  const num = useRef<HTMLSpanElement>(null);
  const glow = useRef<HTMLElement>(null);
  const [first] = useState(() => fmt.gain(g));
  const tween = useRef({ at: g, to: g, frame: 0, flashed: 0 });

  useEffect(() => {
    const t = tween.current;
    return () => {
      cancelAnimationFrame(t.frame);
      t.frame = 0;
    };
  }, []);

  useEffect(() => {
    const t = tween.current;
    const el = num.current;
    if (!el || t.to === g) return;
    const from = t.to;
    const now = performance.now();
    t.to = g;
    if (reduced()) {
      t.at = g;
      el.textContent = fmt.gain(g);
      return;
    }
    const turned = signOf(g) !== 0 && signOf(from) !== 0 && signOf(g) !== signOf(from);
    if (now - t.flashed > 800 && (turned || Math.abs(g - from) >= 0.05)) {
      t.flashed = now;
      glow.current?.animate({ opacity: [0.42, 0], transform: ["scale(1.15)", "scale(1)"] }, { duration: 820, easing: "ease-out" });
      el.animate({ transform: ["scale(1.2)", "scale(1)"], filter: ["brightness(1.9)", "brightness(1)"] }, { duration: 520, easing: EASE });
    }
    if (t.frame) return;
    let then = now;
    const step = (time: number) => {
      t.at += (t.to - t.at) * (1 - Math.exp(-Math.max(0, time - then) / 130));
      then = time;
      if (Math.abs(t.to - t.at) < 0.0001) t.at = t.to;
      const text = fmt.gain(t.at);
      if (el.textContent !== text) el.textContent = text;
      t.frame = t.at === t.to ? 0 : requestAnimationFrame(step);
    };
    t.frame = requestAnimationFrame(step);
  }, [g]);

  return (
    <span className={cx(s.gain, g > 0 && s.good, g < 0 && s.bad)} title={title}>
      <i ref={glow} className={s.glow} />
      <span ref={num}>{first}</span>
    </span>
  );
}

// Text that rolls to each new value, the old leaving as the new comes in: upward, unless n went up.
function Swap({ text, n = 0, show = (t) => t }: { text: string; n?: number; show?: (text: string) => ReactNode }) {
  const [shown, setShown] = useState({ text, n, was: text, up: true, k: 0 });
  if (shown.text !== text) setShown({ text, n, was: shown.text, up: n <= shown.n, k: shown.k + 1 });
  const way = shown.up ? s.up : s.down;
  return (
    <span className={s.swap}>
      <span key={shown.k} className={cx(shown.k > 0 && s.in, way)}>
        {show(text)}
      </span>
      {shown.k > 0 && (
        <span key={`was${shown.k}`} className={cx(s.was, way)} aria-hidden="true">
          {show(shown.was)}
        </span>
      )}
    </span>
  );
}
