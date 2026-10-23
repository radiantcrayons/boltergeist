"use client";

import { useEffect, useRef } from "react";
import type { Role } from "@/lib/game/war";
import type { Mood } from "./art";
import { ANGLES, paintSpook, type Figure, type GhostKind, type RGB } from "./clay";

// Slime, Spectre and Boltergeist: the bigger the stake, the bigger the ghost.
const GHOST_SIZE: Record<Role, number> = { soldier: 0.75, commando: 1, warlord: 1.35 };
const BODY: Record<Role, RGB> = { soldier: [214, 240, 228], commando: [222, 226, 246], warlord: [196, 246, 224] };
export const GHOST_KIND: Record<Role, GhostKind> = { soldier: "wisp", commando: "spectre", warlord: "poltergeist" };
// How far each sits right of its middle, in clay units: the wisp's tail and the boltergeist's bolt hang off to the right.
const LEAN: Record<Role, number> = { soldier: 1, commando: 0, warlord: 1.5 };
// How far out from its middle each reaches as it turns, in clay units.
const REACH: Record<Role, number> = { soldier: 13, commando: 11, warlord: 17 };
const FRAMES = 8;
const painted = new Map<string, Figure>();

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

// A clay ghost on a canvas, as big as its stake next to the others, swaying. It throws its arms up to attack and fades when hurt. In a
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
      // The boltergeist and its bolt set the scale: about 29 units across and 21 above its feet, or turned, its full reach either way.
      const fit = scene ? Math.min((h * 0.56) / 24, (w * 0.9) / (REACH.warlord * 2)) : spin ? Math.min((h * 0.84) / 22, (w * 0.96) / (REACH.warlord * 2)) : Math.min((h * 0.84) / 21, (w * 0.96) / 29);
      const px = Math.round(fit * (GHOST_SIZE[role] / 1.35) * 10) / 10;
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
      g.drawImage(f.canvas, Math.round(w / 2 - f.ox - (turning ? 0 : LEAN[role] * px)), Math.round(foot - f.oy - lift));
      g.globalAlpha = 1;
      if (scene) mist(g, w, h, tick, true);
    };
    draw();
    const seen = new ResizeObserver(draw);
    seen.observe(c);
    const timer = still
      ? undefined
      : setInterval(
          () => {
            tick++;
            draw();
          },
          turning ? 80 : 140,
        );
    return () => {
      seen.disconnect();
      clearInterval(timer);
    };
  }, [role, mood, scene, spin]);
  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
