"use client";

import { useEffect, useRef } from "react";
import type { Role } from "@/lib/game/war";
import type { Mood } from "./art";
import { ANGLES, paintSpook, type Figure, type GhostKind, type RGB } from "./clay";

// Slime, Spectre and Boltergeist, all in the game's mint. Off the field each fills its frame like the boltergeist does; only the field
// shows their true sizes.
const MINT: RGB = [124, 232, 192];
const BODY: Record<Role, RGB> = { soldier: MINT, commando: MINT, warlord: MINT };
export const GHOST_KIND: Record<Role, GhostKind> = { soldier: "wisp", commando: "spectre", warlord: "poltergeist" };
const FRAMES = 8;
const painted = new Map<string, Figure>();

type Span = { up: number; reach: number; wide: number; mid: number };
const spans = new Map<Role, Span>();

// How tall, how far out as it turns, how wide face on and how far its middle sits from its feet, in clay units, measured once from
// its own model at rest and mid sway.
function span(role: Role): Span {
  const known = spans.get(role);
  if (known) return known;
  const unit = 4;
  const s: Span = { up: 0, reach: 0, wide: 0, mid: 0 };
  for (const frame of [0, FRAMES / 4]) {
    for (let turn = 0; turn < ANGLES; turn += ANGLES / 8) {
      const f = paintSpook(GHOST_KIND[role], BODY[role], unit, frame, FRAMES, false, turn);
      const { width, height } = f.canvas;
      const alpha = f.canvas.getContext("2d")?.getImageData(0, 0, width, height).data;
      if (!alpha) continue;
      let left = width;
      let right = -1;
      let top = height;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          if (alpha[(y * width + x) * 4 + 3] > 24) {
            left = Math.min(left, x);
            right = Math.max(right, x);
            top = Math.min(top, y);
          }
      if (right < 0) continue;
      s.up = Math.max(s.up, (f.oy - top) / unit);
      s.reach = Math.max(s.reach, Math.max(f.ox - left, right - f.ox) / unit);
      if (turn === 0) {
        s.wide = Math.max(s.wide, (right - left) / unit);
        if (frame === 0) s.mid = ((left + right) / 2 - f.ox) / unit;
      }
    }
  }
  spans.set(role, s);
  return s;
}

// How much bigger than its true size a ghost is drawn so it fills the room the boltergeist does.
function grow(role: Role, turning: boolean): number {
  const mine = span(role);
  const bolt = span("warlord");
  if (!mine.up || !bolt.up) return 1;
  return Math.min(bolt.up / mine.up, turning ? bolt.reach / mine.reach : bolt.wide / mine.wide);
}

// Mist for a scene: banks of it drifting slowly across, thickening toward the bottom. Drawn behind the ghost, and again in front at the
// very bottom so its tail trails into it.
function mist(g: CanvasRenderingContext2D, w: number, h: number, t: number, front: boolean) {
  const from = front ? h * 0.82 : h * 0.5;
  const rise = g.createLinearGradient(0, from, 0, h);
  rise.addColorStop(0, "rgba(196, 214, 230, 0)");
  rise.addColorStop(1, `rgba(196, 214, 230, ${front ? 0.42 : 0.3})`);
  g.fillStyle = rise;
  g.fillRect(0, from, w, h - from);
  for (let i = 0; i < (front ? 3 : 5); i++) {
    const speed = 0.006 + i * 0.003;
    const span = w * 1.6;
    const x = ((((t * speed * w + i * span * 0.37) % span) + span) % span) - w * 0.3;
    const y = front ? h * (0.93 + (i % 2) * 0.04) : h * (0.7 + i * 0.05);
    const rx = w * (0.32 + (i % 3) * 0.08);
    const ry = h * (front ? 0.06 : 0.07 + i * 0.012);
    g.save();
    g.translate(x, y);
    g.scale(1, ry / rx);
    const bank = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    bank.addColorStop(0, `rgba(210, 226, 238, ${front ? 0.3 : 0.22 + i * 0.03})`);
    bank.addColorStop(1, "rgba(210, 226, 238, 0)");
    g.fillStyle = bank;
    g.fillRect(-rx, -rx, rx * 2, rx * 2);
    g.restore();
  }
}

// A clay ghost on a canvas, as big as its stake next to the others, swaying. It throws its arms up to spook and fades when hurt. In a
// scene it floats in drifting mist and turns round, through each of the angles it is drawn at; set spinning, it just turns.
export function Spirit({ role, mood = "ready", className, scene = false, spin = false }: { role: Role; mood?: Mood; className?: string; scene?: boolean; spin?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    const still = mood === "ko" || matchMedia("(prefers-reduced-motion: reduce)").matches;
    const turning = scene || spin;
    let tick = 0;
    const draw = () => {
      const dpr = devicePixelRatio || 1;
      const w = Math.round(c.clientWidth * dpr);
      const h = Math.round(c.clientHeight * dpr);
      if (!w || !h) return;
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const frame = tick % FRAMES;
      const turn = turning && !still ? tick % ANGLES : 0;
      // The boltergeist, wings and bolt and all, sets the scale: its height, and across face on or, turned, its full reach either way.
      const b = span("warlord");
      const fit = scene ? Math.min((h * 0.56) / (b.up + 3), (w * 0.9) / (b.reach * 2)) : spin ? Math.min((h * 0.84) / (b.up + 1), (w * 0.96) / (b.reach * 2)) : Math.min((h * 0.84) / b.up, (w * 0.96) / (b.wide * 1.04));
      const px = Math.round(fit * grow(role, turning) * 10) / 10;
      const key = `${role}|${px}|${frame}|${mood === "attack"}|${turn}`;
      let f = painted.get(key);
      if (!f) {
        if (painted.size > 600) painted.clear();
        f = paintSpook(GHOST_KIND[role], BODY[role], px, frame, FRAMES, mood === "attack", turn);
        painted.set(key, f);
      }
      g.clearRect(0, 0, w, h);
      const foot = scene ? h * 0.82 : h * 0.84;
      if (scene) mist(g, w, h, tick, false);
      g.globalAlpha = mood === "ko" ? 0.35 : mood === "hurt" ? 0.65 : 1;
      const lift = scene ? (2.5 + Math.sin((tick / FRAMES) * Math.PI * 2) * 1) * px : 0;
      g.drawImage(f.canvas, Math.round(w / 2 - f.ox - (turning ? 0 : span(role).mid * px)), Math.round(foot - f.oy - lift));
      g.globalAlpha = 1;
      if (scene) mist(g, w, h, tick, true);
    };
    draw();
    const seen = new ResizeObserver(draw);
    seen.observe(c);
    // It only moves while it can be seen: scrolled away or in a hidden tab, it waits where it was.
    let shown = true;
    const sight = new IntersectionObserver(([e]) => (shown = e.isIntersecting));
    sight.observe(c);
    const timer = still
      ? undefined
      : setInterval(
          () => {
            if (!shown || document.hidden) return;
            tick++;
            draw();
          },
          turning ? 80 : 140,
        );
    return () => {
      seen.disconnect();
      sight.disconnect();
      clearInterval(timer);
    };
  }, [role, mood, scene, spin]);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
