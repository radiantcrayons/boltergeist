"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ROLES, type Role, type Side } from "@/lib/game/war";
import { FOES, HEROES, type Mood } from "./art";
import { Burst, Coin, Lightning, Slash, Strikebolt } from "./art/Effects";

export type SceneKind = "call" | "win" | "lose" | "ko" | "zap" | "victory" | "end";

export type Scene = {
  kind: SceneKind;
  role: Role;
  side?: Side;
  you: [number, number];
  them: [number, number];
  title: string;
  detail?: string;
  n: number;
};

type Phase = "intro" | "action" | "resolve";
type Army = "you" | "them";

const INTRO = 450;
const ACTION = 1750;
const LENGTH = 2900;

const SQUADS: Record<Role, { most: number; foes: number; scale: number }> = {
  soldier: { most: 4, foes: 2, scale: 1.25 },
  commando: { most: 2, foes: 2, scale: 1 },
  warlord: { most: 1, foes: 1, scale: 1.08 },
};

const SPOTS: Record<number, { x: number; b: number }[]> = {
  1: [{ x: 15, b: 9 }],
  2: [
    { x: 21, b: 6 },
    { x: 3, b: 15 },
  ],
  4: [
    { x: 36, b: 7 },
    { x: 15, b: 19 },
    { x: 21, b: 0 },
    { x: 0, b: 9 },
  ],
};

const count = (most: number, hp: number) => (hp <= 0 ? 0 : Math.min(most, Math.ceil(hp / (10 / most))));

const isReduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function moodOf(kind: SceneKind, army: Army, phase: Phase, goer: boolean, up: boolean): Mood {
  if (phase === "intro") return "ready";
  const heroesHit = kind === "lose" || kind === "ko" || kind === "zap";
  const foesHit = kind === "win" || kind === "victory";
  if (army === "you") {
    if (phase === "action") return heroesHit ? "hurt" : kind === "end" ? "ready" : "attack";
    if (goer || kind === "ko" || kind === "zap") return "ko";
    if (foesHit) return "happy";
    if (kind === "lose") return "hurt";
    if (kind === "end") return up ? "happy" : "hurt";
    return "ready";
  }
  if (phase === "action") return heroesHit && kind !== "zap" ? "attack" : foesHit ? "hurt" : "ready";
  if (goer || kind === "victory") return "ko";
  if (heroesHit) return "happy";
  if (kind === "win") return "hurt";
  if (kind === "end") return up ? "hurt" : "happy";
  return "ready";
}

export function Cutscene({ scene, onDone }: { scene: Scene; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>(() => (isReduced() ? "resolve" : "intro"));
  const done = useRef(onDone);
  const hp = useRef<{ you: HTMLElement | null; them: HTMLElement | null; youBar: HTMLElement | null; themBar: HTMLElement | null }>({ you: null, them: null, youBar: null, themBar: null });

  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    const ease = (x: number) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;
    const at = (side: [number, number], t: number) => Math.round(side[0] + (side[1] - side[0]) * ease((t - 650) / 900));
    const paint = (t: number) => {
      const h = hp.current;
      const you = Math.max(0, at(scene.you, t));
      const them = Math.max(0, at(scene.them, t));
      if (h.you) h.you.textContent = String(you);
      if (h.them) h.them.textContent = String(them);
      if (h.youBar) h.youBar.style.width = `${Math.min(100, you * 10)}%`;
      if (h.themBar) h.themBar.style.width = `${Math.min(100, them * 10)}%`;
    };
    if (isReduced()) {
      paint(LENGTH);
      const timer = setTimeout(() => done.current(), 1800);
      return () => clearTimeout(timer);
    }
    const started = performance.now();
    let frame = 0;
    const timers = [setTimeout(() => setPhase("action"), INTRO), setTimeout(() => setPhase("resolve"), ACTION), setTimeout(() => done.current(), LENGTH)];
    const tick = () => {
      paint(performance.now() - started);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      timers.forEach(clearTimeout);
      cancelAnimationFrame(frame);
    };
  }, [scene]);

  useEffect(() => {
    const skip = () => done.current();
    window.addEventListener("keydown", skip, { once: true });
    return () => window.removeEventListener("keydown", skip);
  }, []);

  const squad = SQUADS[scene.role];
  const foe = scene.side === "long" ? "bears" : scene.side === "short" ? "bulls" : scene.n % 2 ? "bears" : "bulls";
  const Hero = HEROES[scene.role];
  const Foe = FOES[foe];
  const up = scene.you[1] >= 10;
  const heroesHit = scene.kind === "lose" || scene.kind === "ko";
  const foesHit = scene.kind === "win" || scene.kind === "victory";

  const army = (side: Army) => {
    const [from, to] = side === "you" ? scene.you : scene.them;
    const most = side === "you" ? squad.most : squad.foes;
    const showing = count(most, Math.max(from, Math.min(to, 10)));
    const staying = count(most, to);
    const spots = SPOTS[showing === 3 ? 4 : Math.max(1, showing)] ?? SPOTS[1];
    return Array.from({ length: showing }, (_, i) => {
      const spot = spots[i] ?? spots[0];
      const goer = i >= staying;
      const mood = moodOf(scene.kind, side, phase, goer, up);
      const Art = side === "you" ? Hero : Foe;
      const style = {
        "--x": `${spot.x}%`,
        "--b": `${spot.b}%`,
        "--s": side === "you" ? squad.scale : squad.foes === 1 ? 1.12 : 1,
        "--i": i,
        zIndex: 10 + Math.round(30 - spot.b),
      } as CSSProperties;
      return (
        <div key={`${side}${i}`} className={`unit ${side} ${goer ? "goer" : ""}`} style={style}>
          <div className="body">
            <Art mood={mood} className="art" />
          </div>
          {side === "you" && phase === "action" && (scene.kind === "win" || scene.kind === "victory") && (
            <>
              {[0, 1, 2].map((k) => (
                <Lightning key={k} className="shot" />
              ))}
            </>
          )}
          {side === "you" && phase === "action" && scene.kind === "call" && <div className="aura" />}
          {phase === "action" && ((side === "you" && heroesHit) || (side === "them" && foesHit)) && (
            <>
              <Burst className="hit h1" />
              <Burst className="hit h2" color="#ffe14a" />
              {side === "you" && <Slash className="slash" />}
            </>
          )}
        </div>
      );
    });
  };

  const enemy = scene.side === "long" ? "the bears" : scene.side === "short" ? "the bulls" : "the rivals";
  return (
    <div className={`cutscene ${scene.kind} ${foe} phase-${phase}`} onClick={onDone} role="img" aria-label={`${scene.title}${scene.detail ? `: ${scene.detail}` : ""}`}>
      <div className="stage">
        <div className="half left" />
        <div className="half right" />
        <svg className="seam" viewBox="0 0 60 600" preserveAspectRatio="none" aria-hidden="true">
          <path d="M34 0 L18 140 L40 150 L14 300 L38 310 L20 460 L42 470 L26 600 L6 600 L22 470 L0 460 L18 310 L-6 300 L20 150 L-2 140 L14 0 Z" transform="translate(10 0)" />
        </svg>
        <div className="platform left" />
        <div className="platform right" />
        <div className="army you">{army("you")}</div>
        <div className="army them">{army("them")}</div>
        {scene.kind === "zap" && phase !== "intro" && <Strikebolt className="strikebolt" />}
        {(scene.kind === "victory" || (scene.kind === "win" && phase === "resolve")) && (
          <div className="coins">
            {Array.from({ length: scene.kind === "victory" ? 14 : 6 }, (_, i) => (
              <Coin key={i} className="coin" />
            ))}
          </div>
        )}
        <div className="flash" />

        <div className="hp you">
          <span className="who">
            you <small>{ROLES[scene.role].hero}</small>
          </span>
          <span className="meter">
            <span className="bar">
              <i ref={(el) => void (hp.current.youBar = el)} />
            </span>
            <b ref={(el) => void (hp.current.you = el)}>{scene.you[0]}</b>
          </span>
        </div>
        <div className="hp them">
          <span className="who">{enemy}</span>
          <span className="meter">
            <span className="bar">
              <i ref={(el) => void (hp.current.themBar = el)} />
            </span>
            <b ref={(el) => void (hp.current.them = el)}>{scene.them[0]}</b>
          </span>
        </div>

        <div className="caption">
          <b>{scene.title}</b>
          {scene.detail && <span>{scene.detail}</span>}
        </div>
      </div>
      <small className="skip">click or press any key to skip</small>
    </div>
  );
}
