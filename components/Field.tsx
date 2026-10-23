"use client";

import { useEffect, useRef } from "react";
import * as fmt from "@/lib/format";
import { play } from "@/lib/sfx";
import type { Role, Side } from "@/lib/game/war";
import type { Candle } from "@/lib/types";
import { COLORS, niceStep, type Mark, type Pick, type Pin } from "./Chart";
import { ANGLES, kidsLantern, paintCloud, paintKids, paintSpook, type Figure, type GhostKind } from "./clay";
import { GHOST_KIND } from "./Spirit";
import { paintTree } from "./trees";

// What of yours is on the field: ghosts lying in wait, ghosts on the kids, your thundercloud, where banking starts to pay.
export type Yours = {
  trap?: { side: Side; price: number; at: number; power: number; count: number; ahead?: number };
  call?: { side: Side; entry: number; at: number; power: number; count: number; maker: boolean; koAt: number; move: number };
  flag?: { price: number; banks?: number; ahead?: number };
  even?: number;
};

type Props = {
  candles: Candle[];
  intervalMs: number;
  mark: number | null;
  tickSize: number;
  reach: number;
  span: { from: number; to: number };
  // Each new round from the second: when it starts, and the least power it allows.
  rounds: { at: number; round: number; floor: number }[];
  yours: Yours;
  // Which ghost you are: it sets their look, and their size is your stake's.
  role: Role;
  // Strike's order book: what's resting at each price, and fills of resting orders just now.
  walls?: { p: number; side: Side; orders: number[] }[];
  // The market's coin, shown as a signal in the lantern's light under the kids.
  coin?: string;
  blasts?: { p: number; at: number }[];
  marks: Mark[];
  pins?: Pin[];
  pick?: (p: number) => Pick | null;
  onPick?: (p: number) => void;
};

// Where the ground came from: where you got in, and where you got out.
type Past = { at: number; price: number; side: Side; kind: "in" | "taken" | "out" };
// One of Strike's biggest orders, a hand out of the ground in the candle the kids were in: when it rose, when it went, whether it stays.
type Hand = { col: number; row: number; side: Side; usd: number; reach: number; head: boolean; kept: boolean; born: number; gone: number; seed: number };

// The field: x runs east with time, a tile per candle; y runs south across the price, so north is a higher price.
const P = 18;
const F = 7;
const R = 14;

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const times = (c: RGB, m: RGB | number): RGB => (typeof m === "number" ? [c[0] * m, c[1] * m, c[2] * m] : [c[0] * m[0], c[1] * m[1], c[2] * m[2]]);
const plus = (c: RGB, d: RGB): RGB => [c[0] + d[0], c[1] + d[1], c[2] + d[2]];
const css = (c: RGB, a = 1) => `rgba(${Math.round(clamp(c[0], 0, 248))}, ${Math.round(clamp(c[1], 0, 248))}, ${Math.round(clamp(c[2], 0, 248))}, ${a})`;

// Clay: flat matte colours lit by a warm sun from the south and a cool sky, shaded toward indigo and a pale blue, never black or white.
const INDIGO: RGB = [5, 6, 11];
const PALE: RGB = [223, 230, 238];
const pole = (c: RGB, f: number): RGB => (f >= 0 ? mix(c, PALE, f) : mix(c, INDIGO, -f));
const SUNNY: RGB = [1.1, 1.06, 0.92];
const SHADY: RGB = [0.57, 0.58, 0.64];
const CLAY = {
  skyTop: hex("#96b2c6"),
  haze: hex("#ece0ce"),
  glow: hex("#f8f0e2"),
  grass: hex("#86a866"),
  earth: hex("#9a7458"),
  soil: hex("#684a34"),
  rock: hex("#5c5654"),
  bark: hex("#5b3b2f"),
  leafLight: hex("#88a868"),
  leafDark: hex("#4c6944"),
  leafUnder: hex("#3d5e58"),
  skin: hex("#d2a07c"),
  steel: hex("#5c6575"),
  steelDark: hex("#363c48"),
  yellow: hex("#e0b54f"),
  offWhite: hex("#e9e6de"),
  sand: hex("#c9b48a"),
  wood: hex("#8b6a45"),
};
const TEAMS: Record<Side, { coat: RGB; helmet: RGB; ui: string; dy: number }> = {
  long: { coat: hex("#5aa882"), helmet: hex("#3e7a5e"), ui: COLORS.up, dy: 1 },
  short: { coat: hex("#c4503f"), helmet: hex("#7e2f2b"), ui: COLORS.down, dy: -1 },
};
const MUD: RGB = [118, 90, 66];
const PUDDLE: RGB = [150, 168, 186];

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const hash = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Smooth value noise for the grass patches, laid on the ground itself so the patches stay put as the field moves.
function lattice(x: number, y: number) {
  const xi = ((x % 4096) + 4096) % 4096;
  const yi = ((y % 4096) + 4096) % 4096;
  let h = (xi * 374761393 + yi * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(lattice(xi, yi), lattice(xi + 1, yi), sx), lerp(lattice(xi, yi + 1), lattice(xi + 1, yi + 1), sx), sy);
}
const fbm = (x: number, y: number) => (noise(x, y) * 0.55 + noise(x * 2.1, y * 2.1) * 0.3 + noise(x * 4.3, y * 4.3) * 0.15);

type Pt = { x: number; y: number };
type Ctx = CanvasRenderingContext2D;

function poly(ctx: Ctx, pts: Pt[], fill?: string, stroke?: string, width = 1) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

function line(ctx: Ctx, a: Pt, b: Pt, color: string, width = 1, dash?: number[]) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.setLineDash(dash ?? []);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineCap = "butt";
}

function oval(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill?: string, stroke?: string, width = 2) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

let MONO = "ui-monospace, monospace";
let DISPLAY = "sans-serif";

// A clay lump: lit from the upper left in four hard bands, the way plasticine catches the light.
function lump(g: Ctx, path: () => void, x: number, y: number, rx: number, ry: number, base: RGB, outline = false) {
  const grad = g.createRadialGradient(x - rx * 0.42, y - ry * 0.48, 0, x - rx * 0.12, y - ry * 0.12, Math.max(rx, ry) * 1.3);
  const lit = plus(times(base, 1.1), [10, 9, 7]);
  const bands: [number, RGB][] = [
    [0, lit],
    [0.34, lit],
    [0.34, base],
    [0.62, base],
    [0.62, times(base, 0.88)],
    [0.84, times(base, 0.88)],
    [0.84, times(base, 0.78)],
    [1, times(base, 0.78)],
  ];
  for (const [at, c] of bands) grad.addColorStop(at, css(c));
  g.fillStyle = grad;
  path();
  g.fill();
  if (outline) {
    g.strokeStyle = css(plus(times(base, [0.3, 0.26, 0.28]), [10, 6, 8]));
    g.lineWidth = 1;
    g.stroke();
  }
}
const ellipsePath = (g: Ctx, x: number, y: number, rx: number, ry: number) => () => {
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
};

// Pictures drawn once at a size and kept: figures in each frame, trees, tombstones, tufts and shadows.
type Sprite = { c: HTMLCanvasElement; ox: number; oy: number; w: number; h: number };
const sprites = new Map<string, Sprite>();
function sprite(key: string, w: number, h: number, ox: number, oy: number, paint: (g: Ctx) => void): Sprite {
  const dpr = devicePixelRatio || 1;
  const id = `${key}|${dpr}`;
  const kept = sprites.get(id);
  if (kept) return kept;
  if (sprites.size > 600) sprites.clear();
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w * dpr));
  c.height = Math.max(1, Math.ceil(h * dpr));
  const g = c.getContext("2d")!;
  g.scale(dpr, dpr);
  g.translate(ox, oy);
  paint(g);
  const s = { c, ox, oy, w, h };
  sprites.set(id, s);
  return s;
}
const blit = (ctx: Ctx, s: Sprite, p: Pt, alpha = 1) => {
  ctx.globalAlpha = alpha;
  ctx.drawImage(s.c, p.x - s.ox, p.y - s.oy, s.w, s.h);
  ctx.globalAlpha = 1;
};
const STRIDES = 8;

// Each market's mark, cut out of a disc of warm light: the coin's own silhouette where there is one, its letters where there isn't.
const SIGNAL = 256;
const COINS = new Set(["ada", "bnb", "btc", "doge", "eth", "sol", "xrp", "zec"]);
const signals = new Map<string, HTMLCanvasElement>();
function signalOf(coin: string) {
  const kept = signals.get(coin);
  if (kept) return kept;
  const c = document.createElement("canvas");
  c.width = c.height = SIGNAL;
  const g = c.getContext("2d")!;
  const tint = () => {
    g.globalCompositeOperation = "source-in";
    g.fillStyle = "rgb(255, 206, 140)";
    g.fillRect(0, 0, SIGNAL, SIGNAL);
    g.globalCompositeOperation = "source-over";
  };
  g.fillStyle = "#fff";
  g.beginPath();
  g.arc(SIGNAL / 2, SIGNAL / 2, SIGNAL / 2, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = "destination-out";
  g.font = `${SIGNAL * (coin.length > 4 ? 0.2 : coin.length > 3 ? 0.27 : 0.34)}px ${DISPLAY}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(coin, SIGNAL / 2, SIGNAL / 2 + SIGNAL * 0.02);
  g.globalCompositeOperation = "source-over";
  tint();
  signals.set(coin, c);
  if (!COINS.has(coin.toLowerCase())) return c;
  const img = new Image();
  img.onload = () => {
    g.clearRect(0, 0, SIGNAL, SIGNAL);
    g.drawImage(img, 0, 0, SIGNAL, SIGNAL);
    tint();
  };
  img.src = `/coins/${coin.toLowerCase()}.svg`;
  return c;
}

// A lightning bolt in the field's own space, from a point in the sky to one on the ground, positions in tiles with z up: it wanders
// and forks every way in three dimensions, so its spindles reach out toward and away from the viewer as well as across, and where it
// lands, sparks crawl off along the ground. Seen through the field's view by see.
type P3 = { x: number; y: number; z: number };
function lightning3d(ctx: Ctx, a: P3, b: P3, seed: number, size: number, see: (p: P3) => Pt, alpha = 1) {
  const paths: { pts: Pt[]; w: number }[] = [];
  let n = 0;
  const rnd = () => hash(seed * 0.91 + n++ * 1.618) * 2 - 1;
  const split = (p: P3, q: P3, depth: number): P3[] => {
    if (!depth) return [p, q];
    const len = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
    const m = { x: (p.x + q.x) / 2 + rnd() * len * 0.28, y: (p.y + q.y) / 2 + rnd() * len * 0.28, z: (p.z + q.z) / 2 + rnd() * len * 0.12 };
    return [...split(p, m, depth - 1), ...split(m, q, depth - 1).slice(1)];
  };
  const grow = (p: P3, q: P3, w: number, depth: number, level: number) => {
    const pts = split(p, q, depth);
    paths.push({ pts: pts.map(see), w });
    if (level > 1) return;
    const reach = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
    for (let i = 2; i < pts.length - 2; i++) {
      if (Math.abs(rnd()) > (level ? 0.22 : 0.3)) continue;
      const len = reach * (0.18 + Math.abs(rnd()) * 0.3) * (1 - i / pts.length);
      const at = pts[i];
      const end = { x: at.x + rnd() * len, y: at.y + rnd() * len, z: Math.max(0, at.z - len * (0.35 + Math.abs(rnd()) * 0.5)) };
      grow(at, end, w * 0.45, Math.max(2, depth - 2), level + 1);
    }
  };
  grow(a, b, 1, 6, 0);
  for (let i = 0; i < 6; i++) {
    const turn = (i / 6) * Math.PI * 2 + rnd() * 0.5;
    const len = 0.35 + Math.abs(rnd()) * 0.6;
    grow(b, { x: b.x + Math.cos(turn) * len, y: b.y + Math.sin(turn) * len, z: 0 }, 0.4, 3, 2);
  }
  glowing(ctx, paths, size, alpha);
}

// Strokes of lightning drawn as light: a wide blue glow, a narrower one, and a thin white core.
function glowing(ctx: Ctx, paths: { pts: Pt[]; w: number }[], size: number, alpha: number) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const [width, color] of [
    [10, `rgba(100, 120, 255, ${0.06 * alpha})`],
    [5, `rgba(150, 172, 255, ${0.14 * alpha})`],
    [2.2, `rgba(205, 218, 255, ${0.45 * alpha})`],
    [0.9, `rgba(255, 255, 255, ${0.95 * alpha})`],
  ] as const) {
    ctx.strokeStyle = color;
    for (const { pts, w } of paths) {
      ctx.lineWidth = Math.max(0.5, width * w * size);
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
  }
  ctx.restore();
}

// A soft round shadow or glow on the ground, fading out to its edge.
function blob(ctx: Ctx, x: number, y: number, rx: number, ry: number, color: RGB, alpha: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const fall = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  fall.addColorStop(0, css(color, alpha));
  fall.addColorStop(1, css(color, 0));
  ctx.fillStyle = fall;
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
  ctx.restore();
}

// The clay figures, each look, size and frame made once and kept.
const figures = new Map<string, Figure>();
function figure(key: string, make: () => Figure) {
  const kept = figures.get(key);
  if (kept) return kept;
  if (figures.size > 900) figures.clear();
  const made = make();
  figures.set(key, made);
  return made;
}
const GHOSTS: Record<Side, RGB> = { long: [214, 240, 228], short: [244, 216, 220] };
const FIELD_SIZE: Record<GhostKind, number> = { wisp: 0.95, spectre: 1.1, poltergeist: 1.3 };
const FRAMES = 8;
const stormAt = (px: number) => figure(`storm|${px}`, () => paintCloud(px));
const treeAt = (px: number, variant: number) => figure(`tree|${px}|${variant}`, () => paintTree(px, variant));
const kidsAt = (px: number, stride: number) => figure(`kids|${px}|${stride}`, () => paintKids(px, stride, STRIDES));
const ghostAt = (kind: GhostKind, body: RGB, px: number, frame: number, boo: boolean, turn = 0) =>
  figure(`ghost|${kind}|${body}|${px}|${frame}|${boo ? 1 : 0}|${turn}`, () => paintSpook(kind, body, px, frame, FRAMES, boo, turn));


// A hand clawing up out of the ground for an order waiting on Strike, grey-green clay touched with its side's colour: the bigger the
// order, the further out of the ground it has dug. The dirt it comes up through is its own sprite.
function armSprite(A: number, tint: RGB, reach: number, variant: number) {
  const q = Math.round(A * 4) / 4;
  const s = q / 26;
  const e = Math.round(clamp(reach, 0, 1) * 8) / 8;
  const pose = variant % 6;
  const lean = [-0.3, -0.1, 0.12, 0.3, -0.2, 0.22][pose];
  const L = (5 + 23 * e) * s;
  return sprite(`arm|${q}|${tint}|${e}|${pose}`, 36 * s + 8, L + 14 * s + 8, 18 * s + 4, L + 9 * s + 4, (g) => {
    const skin = mix([184, 204, 160], tint, 0.18);
    const lit = css(times(skin, SUNNY));
    const shade = css(times(skin, SHADY));
    const ink = css(plus(times(skin, [0.3, 0.26, 0.28]), [10, 6, 8]));
    const along = (d: number, o = 0): Pt => ({ x: Math.sin(lean) * d + Math.cos(lean) * o, y: -Math.cos(lean) * d + Math.sin(lean) * o });
    const wrist = L - 5 * s;
    if (wrist > 0) {
      const w0 = (1.9 + 0.7 * e) * s;
      const w1 = 1.6 * s;
      poly(g, [along(0, -w0), along(wrist, -w1), along(wrist, w1), along(0, w0)], lit, ink, 1);
      poly(g, [along(0, 0), along(wrist, 0), along(wrist, w1), along(0, w0)], shade);
      if (e >= 0.5) {
        const cuff = wrist * 0.45;
        const rag = css(mix([70, 62, 68], tint, 0.1));
        poly(g, [along(0, -w0 * 1.2), along(cuff, -w0 * 1.15), along(cuff * 0.8, -w0 * 0.3), along(cuff, w0 * 0.4), along(cuff * 0.85, w0 * 1.15), along(0, w0 * 1.2)], rag, ink, 1);
      }
    }
    const palm = along(Math.max(wrist, 0) + 2.8 * s);
    const palmPath = () => {
      g.beginPath();
      g.ellipse(palm.x, palm.y, 3.2 * s, 3.5 * s, lean, 0, Math.PI * 2);
    };
    lump(g, palmPath, palm.x, palm.y, 3.2 * s, 3.5 * s, skin, true);
    g.lineCap = "round";
    const finger = (a: number, bend: number, long: number, color: string) => {
      const base = { x: palm.x + Math.sin(a) * 2.8 * s, y: palm.y - Math.cos(a) * 3 * s };
      const knuckle = { x: base.x + Math.sin(a) * 2.6 * long * s, y: base.y - Math.cos(a) * 2.6 * long * s };
      const tip = { x: knuckle.x + Math.sin(a + bend) * 2 * long * s, y: knuckle.y - Math.cos(a + bend) * 2 * long * s };
      for (const [width, stroke] of [[2.1 * s + 1.2, ink], [2.1 * s, color]] as const) {
        g.lineWidth = width;
        g.strokeStyle = stroke;
        g.beginPath();
        g.moveTo(base.x, base.y);
        g.lineTo(knuckle.x, knuckle.y);
        g.lineTo(tip.x, tip.y);
        g.stroke();
      }
    };
    for (let f = 0; f < 4; f++) finger(lean + (f - 1.5) * 0.42, f < 2 ? 0.35 : -0.35, f === 0 || f === 3 ? 0.85 : 1, f < 2 ? lit : shade);
    finger(lean + (pose % 2 ? -1.35 : 1.35), pose % 2 ? 0.5 : -0.5, 0.75, pose % 2 ? lit : shade);
  });
}

// The dirt a hand or a head comes up through: the broken ground and its hole behind, a lip of soil in front.
function moundSprite(A: number, front: boolean, wide: number) {
  const q = Math.round(A * 4) / 4;
  const s = (q / 26) * wide;
  const dirt = mix(CLAY.soil, CLAY.grass, 0.25);
  return sprite(`mound|${q}|${front ? 1 : 0}|${wide}`, 16 * s + 8, 8 * s + 8, 8 * s + 4, 4 * s + 4, (g) => {
    if (front) {
      lump(g, ellipsePath(g, 0, 1 * s, 4.2 * s, 1.4 * s), 0, 1 * s, 4.2 * s, 1.4 * s, dirt);
      return;
    }
    lump(g, ellipsePath(g, 0, 0, 7 * s, 2.8 * s), 0, 0, 7 * s, 2.8 * s, dirt);
    oval(g, 0, -0.3 * s, 3.4 * s, 1.3 * s, css(times(CLAY.soil, 0.45)));
  });
}

// A zombie's head, for the very biggest orders: grey-green clay, a torn ear, sunken eyes glowing, a gaping mouth, a few strands of hair.
function headSprite(A: number, tint: RGB, variant: number) {
  const q = Math.round(A * 4) / 4;
  const s = q / 26;
  const r = 6.6 * s;
  const v = variant % 4;
  return sprite(`head|${q}|${tint}|${v}`, r * 2.6 + 8, r * 2.4 + 8, r * 1.3 + 4, r * 2.2 + 4, (g) => {
    const skin = mix([146, 184, 124], tint, 0.14);
    const ink = css(plus(times(skin, [0.3, 0.26, 0.28]), [10, 6, 8]));
    const cy = -r * 1.02;
    const tilt = [-0.18, 0.12, -0.06, 0.2][v];
    lump(g, ellipsePath(g, -r * 0.98, cy + r * 0.08, r * 0.26, r * 0.38), -r * 0.98, cy + r * 0.08, r * 0.26, r * 0.38, times(skin, 0.92), true);
    lump(
      g,
      () => {
        g.beginPath();
        g.ellipse(0, cy, r, r * 1.1, tilt, 0, Math.PI * 2);
      },
      0,
      cy,
      r,
      r * 1.1,
      skin,
      true,
    );
    const socket = css(times(skin, 0.4));
    for (const side of [-1, 1]) {
      const ex = side * r * 0.4 + tilt * r * 0.3;
      const ey = cy - r * 0.08 + side * tilt * r * 0.3;
      oval(g, ex, ey, r * 0.3, r * 0.27, socket);
      oval(g, ex + r * 0.05, ey + r * 0.03, r * 0.12, r * 0.12, "rgb(252, 230, 120)");
    }
    oval(g, r * 0.06, cy + r * 0.55, r * 0.34, r * 0.24, css(times(skin, 0.22)));
    g.fillStyle = css(CLAY.offWhite);
    for (const t of [-0.16, 0.04, 0.22]) g.fillRect(t * r, cy + r * 0.33, r * 0.12, r * 0.12);
    g.strokeStyle = ink;
    g.lineWidth = Math.max(1, 0.5 * s);
    g.beginPath();
    g.moveTo(-r * 0.5, cy - r * 0.55);
    g.lineTo(r * 0.1, cy - r * 0.68);
    for (let t = 0; t < 3; t++) {
      g.moveTo(-r * (0.38 - t * 0.2), cy - r * 0.72);
      g.lineTo(-r * (0.34 - t * 0.2), cy - r * 0.5);
    }
    g.stroke();
    g.lineWidth = Math.max(1, 0.7 * s);
    g.strokeStyle = css(times(CLAY.bark, 0.7));
    g.beginPath();
    for (let t = 0; t < 4; t++) {
      const hx = (t - 1.5) * r * 0.3 + v * 0.4 * s;
      g.moveTo(hx, cy - r * 1.02);
      g.quadraticCurveTo(hx + (t % 2 ? 1 : -1) * r * 0.3, cy - r * 1.5, hx + (t - 1.5) * r * 0.25, cy - r * 1.35);
    }
    g.stroke();
  });
}

// A lightning scorch: ground burnt black at the middle and cracks of it branching out every way, the way a strike scars the earth.
function scorchSprite(A: number, variant: number) {
  const q = Math.round(A * 4) / 4;
  const v = variant % 6;
  return sprite(`scorch|${q}|${v}`, 1.5 * q + 8, 0.8 * q + 8, 0.75 * q + 4, 0.4 * q + 4, (g) => {
    g.save();
    g.scale(1, 0.5);
    const burnt = g.createRadialGradient(0, 0, 0, 0, 0, 0.24 * q);
    burnt.addColorStop(0, "rgba(20, 15, 14, 0.9)");
    burnt.addColorStop(0.55, "rgba(46, 34, 28, 0.55)");
    burnt.addColorStop(1, "rgba(60, 44, 32, 0)");
    g.fillStyle = burnt;
    g.fillRect(-0.3 * q, -0.3 * q, 0.6 * q, 0.6 * q);
    g.restore();
    let n = 0;
    const rnd = () => hash(v * 97.3 + n++ * 1.31);
    g.lineCap = "round";
    const crack = (x: number, y: number, ang: number, len: number, w: number, depth: number) => {
      for (let i = 0; i < 4; i++) {
        ang += (rnd() - 0.5) * 0.9;
        const nx = x + (Math.cos(ang) * len) / 4;
        const ny = y + (Math.sin(ang) * len) / 8;
        g.strokeStyle = `rgba(24, 17, 15, ${0.8 * w})`;
        g.lineWidth = Math.max(0.5, w * 0.03 * q * (1 - i * 0.15));
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(nx, ny);
        g.stroke();
        if (depth > 0 && rnd() < 0.5) crack(nx, ny, ang + (rnd() > 0.5 ? 1 : -1) * (0.5 + rnd() * 0.7), len * 0.55, w * 0.65, depth - 1);
        x = nx;
        y = ny;
      }
    };
    const arms = 7 + (v % 4);
    for (let i = 0; i < arms; i++) crack(0, 0, (i / arms) * Math.PI * 2 + rnd() * 0.6, (0.34 + rnd() * 0.32) * q, 1, 2);
  });
}

// A gravestone for your ambush: rounded grey clay, its face lit and its edge in shade, moss at the foot, cracked, and its side's arrow
// cut into it. Drawn from the middle of its foot.
function graveSprite(A: number, side: Side, variant: number, size: number) {
  const q = Math.round(A * size * 4) / 4;
  const v = variant % 4;
  const w = 0.19 * q;
  const h = (0.5 + 0.06 * (v % 2)) * q;
  const d = 0.07 * q;
  return sprite(`grave|${q}|${side}|${v}`, 2 * w + d + 14, h + d + 0.12 * q + 14, w + 7, h + d + 7, (g) => {
    const stone = mix(CLAY.rock, [158, 156, 164], 0.5);
    g.rotate([-0.06, 0.04, 0.08, -0.03][v]);
    const outline = (ox: number, oy: number) => {
      g.beginPath();
      g.moveTo(-w + ox, oy);
      g.lineTo(-w + ox, -h + w + oy);
      g.arc(ox, -h + w + oy, w, Math.PI, 0);
      g.lineTo(w + ox, oy);
      g.closePath();
    };
    g.fillStyle = css(times(stone, SHADY));
    for (let t = 1; t > 0; t -= 0.2) {
      outline(d * t, -d * 0.5 * t);
      g.fill();
    }
    outline(0, 0);
    const face = g.createLinearGradient(-w, -h, w, 0);
    face.addColorStop(0, css(plus(times(stone, SUNNY), [10, 10, 8])));
    face.addColorStop(1, css(times(stone, 0.92)));
    g.fillStyle = face;
    g.fill();
    g.strokeStyle = css(times(stone, 0.42));
    g.lineWidth = 1;
    g.stroke();
    oval(g, -w * 0.35, -0.015 * q, w * 0.6, 0.045 * q, css(mix(CLAY.leafDark, stone, 0.25), 0.85));
    oval(g, w * 0.55, -h * 0.35, w * 0.18, w * 0.1, css(mix(CLAY.leafDark, stone, 0.35), 0.6));
    g.strokeStyle = css(times(stone, 0.5));
    g.beginPath();
    g.moveTo(w * 0.55, -h * 0.92);
    g.lineTo(w * 0.22, -h * 0.76);
    g.lineTo(w * 0.36, -h * 0.62);
    g.stroke();
    const ay = -h * 0.56;
    const a = w * 0.42;
    g.fillStyle = side === "long" ? "rgb(132, 236, 188)" : "rgb(252, 150, 168)";
    g.beginPath();
    if (side === "long") {
      g.moveTo(0, ay - a);
      g.lineTo(a, ay + a * 0.6);
      g.lineTo(-a, ay + a * 0.6);
    } else {
      g.moveTo(0, ay + a);
      g.lineTo(a, ay - a * 0.6);
      g.lineTo(-a, ay - a * 0.6);
    }
    g.closePath();
    g.fill();
  });
}

// A dead tree: bare grey branches forking up into the dusk.
function deadSprite(A: number, variant: number) {
  const q = Math.round(A * 4) / 4;
  const tall = (1.25 + hash(variant) * 0.45) * q;
  return sprite(`dead|${q}|${variant}`, 1.8 * q + 8, tall + 0.7 * q, 0.9 * q + 4, tall + 0.4 * q, (g) => {
    const bark = mix(CLAY.bark, CLAY.rock, 0.5);
    g.lineCap = "round";
    const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
      const x2 = x + Math.sin(a) * len;
      const y2 = y - Math.cos(a) * len;
      for (const [width, color] of [
        [w + 1.2, css(plus(times(bark, [0.3, 0.26, 0.28]), [10, 6, 8]))],
        [w, css(times(bark, a < 0.05 ? SUNNY : SHADY))],
      ] as const) {
        g.lineWidth = width;
        g.strokeStyle = color;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x2, y2);
        g.stroke();
      }
      if (depth === 0) return;
      const n = 2 + (hash(variant * 7 + depth * 3 + Math.round(len)) > 0.6 ? 1 : 0);
      for (let i = 0; i < n; i++) branch(x2, y2, a + (i - (n - 1) / 2) * 0.75 + (hash(variant * 13 + depth * 5 + i) - 0.5) * 0.5, len * 0.66, w * 0.6, depth - 1);
    };
    poly(g, [{ x: -0.14 * q, y: 0 }, { x: -0.05 * q, y: -0.12 * q }, { x: 0, y: 0 }], css(times(bark, SUNNY)));
    poly(g, [{ x: 0, y: 0 }, { x: 0.05 * q, y: -0.12 * q }, { x: 0.14 * q, y: 0 }], css(times(bark, SHADY)));
    branch(0, 0, (hash(variant + 3) - 0.5) * 0.2, tall * 0.42, 0.12 * q, 4);
  });
}

// A stump, its cut face showing the rings.
function stumpSprite(A: number, variant: number) {
  const q = Math.round(A * 4) / 4;
  const r = 0.15 * q * (0.85 + hash(variant) * 0.35);
  const tall = 0.16 * q;
  return sprite(`stump|${q}|${variant}`, r * 2 + 8, tall + r + 8, r + 4, tall + r * 0.5 + 4, (g) => {
    const ink = css(plus(times(CLAY.bark, [0.3, 0.26, 0.28]), [10, 6, 8]));
    g.fillStyle = css(times(CLAY.bark, SUNNY));
    g.fillRect(-r, -tall, r, tall);
    g.fillStyle = css(times(CLAY.bark, SHADY));
    g.fillRect(0, -tall, r, tall);
    oval(g, 0, 0, r, r * 0.5, css(times(CLAY.bark, SHADY)));
    oval(g, 0, -tall, r, r * 0.5, css(mix(CLAY.wood, CLAY.sand, 0.45)), ink, 1);
    for (const f of [0.66, 0.36]) oval(g, 0, -tall, r * f, r * f * 0.5, undefined, css(times(CLAY.wood, 0.8)), 1);
  });
}

// A pumpkin: ribbed orange lumps and a stalk; some are carved, and those glow once it's dark.
function pumpkinSprite(A: number, variant: number) {
  const q = Math.round(A * 4) / 4;
  const r = 0.17 * q * (0.8 + hash(variant) * 0.4);
  const carved = variant % 3 === 0;
  return sprite(`pumpkin|${q}|${variant}`, r * 3 + 8, r * 2.4 + 8, r * 1.5 + 4, r * 1.9 + 4, (g) => {
    const orange: RGB = [222, 128, 46];
    for (const [dx, f] of [[-0.55, 0.62], [0.55, 0.62], [-0.22, 0.78], [0.22, 0.78], [0, 0.9]] as const) {
      lump(g, ellipsePath(g, dx * r, -r * 0.75, r * f, r * 0.78), dx * r, -r * 0.75, r * f, r * 0.78, dx > 0.3 ? times(orange, 0.9) : orange, true);
    }
    g.strokeStyle = css(CLAY.leafDark);
    g.lineWidth = r * 0.22;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(0, -r * 1.45);
    g.quadraticCurveTo(r * 0.1, -r * 1.8, r * 0.3, -r * 1.85);
    g.stroke();
    if (carved) {
      const glow = css([255, 214, 110]);
      poly(g, [{ x: -r * 0.5, y: -r * 0.95 }, { x: -r * 0.3, y: -r * 1.2 }, { x: -r * 0.12, y: -r * 0.95 }], glow);
      poly(g, [{ x: r * 0.12, y: -r * 0.95 }, { x: r * 0.3, y: -r * 1.2 }, { x: r * 0.5, y: -r * 0.95 }], glow);
      poly(g, [{ x: -r * 0.55, y: -r * 0.62 }, { x: -r * 0.2, y: -r * 0.45 }, { x: 0, y: -r * 0.58 }, { x: r * 0.2, y: -r * 0.45 }, { x: r * 0.55, y: -r * 0.62 }, { x: 0, y: -r * 0.3 }], glow);
    }
  });
}

// A boulder, mossy on top.
function boulderSprite(A: number, variant: number) {
  const q = Math.round(A * 4) / 4;
  const r = 0.22 * q * (0.8 + hash(variant) * 0.5);
  return sprite(`boulder|${q}|${variant}`, r * 3 + 8, r * 2 + 8, r * 1.5 + 4, r * 1.4 + 4, (g) => {
    lump(g, ellipsePath(g, r * 0.35, -r * 0.45, r * 0.75, r * 0.55), r * 0.35, -r * 0.45, r * 0.75, r * 0.55, times(CLAY.rock, 0.92), true);
    lump(g, ellipsePath(g, -r * 0.2, -r * 0.6, r, r * 0.72), -r * 0.2, -r * 0.6, r, r * 0.72, mix(CLAY.rock, CLAY.offWhite, 0.18), true);
    lump(g, ellipsePath(g, -r * 0.35, -r * 1.05, r * 0.55, r * 0.22), -r * 0.35, -r * 1.05, r * 0.55, r * 0.22, CLAY.leafLight);
  });
}

// Toadstools, red with white spots or plain brown, in a little ring of two or three.
function mushroomSprite(A: number, variant: number) {
  const q = Math.round(A * 4) / 4;
  const s = q / 26;
  const red = variant % 2 === 0;
  return sprite(`mushroom|${q}|${variant}`, 16 * s + 4, 12 * s + 4, 8 * s + 2, 10 * s + 2, (g) => {
    const caps = 2 + (variant % 3 === 0 ? 1 : 0);
    for (let c = 0; c < caps; c++) {
      const x = (c - (caps - 1) / 2) * 4 * s + (hash(variant * 3 + c) - 0.5) * 2 * s;
      const tall = (3 + hash(variant + c * 7) * 3) * s;
      const w = (2.2 + hash(variant * 5 + c) * 1.2) * s;
      g.fillStyle = css(CLAY.offWhite);
      g.fillRect(x - 0.6 * s, -tall, 1.2 * s, tall);
      const cap: RGB = red ? [200, 64, 52] : [150, 104, 70];
      lump(g, () => {
        g.beginPath();
        g.ellipse(x, -tall, w, w * 0.7, 0, Math.PI, 0);
        g.closePath();
      }, x, -tall - w * 0.3, w, w * 0.6, cap, true);
      if (red) for (const d of [-0.45, 0.2]) oval(g, x + d * w, -tall - w * 0.32, 0.5 * s, 0.4 * s, css(CLAY.offWhite));
    }
  });
}

// A fern: a few arching fronds.
function fernSprite(A: number, variant: number) {
  const q = Math.round(A * 4) / 4;
  const s = q / 26;
  return sprite(`fern|${q}|${variant}`, 26 * s + 4, 14 * s + 4, 13 * s + 2, 12 * s + 2, (g) => {
    g.lineCap = "round";
    const fronds = 4 + (variant % 2);
    for (let f = 0; f < fronds; f++) {
      const a = -0.95 + (1.9 * f) / (fronds - 1) + (hash(variant * 9 + f) - 0.5) * 0.25;
      const len = (8 + hash(variant + f * 3) * 4) * s;
      const tip = { x: Math.sin(a) * len, y: -Math.cos(a) * len * 0.75 };
      const color = css(f < fronds / 2 ? pole(CLAY.leafDark, 0.1) : times(CLAY.leafDark, SHADY));
      g.strokeStyle = color;
      g.lineWidth = 1 * s;
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(tip.x * 0.4, tip.y * 1.1, tip.x, tip.y);
      g.stroke();
      g.lineWidth = 0.9 * s;
      for (let l = 1; l < 6; l++) {
        const u = l / 6;
        const bx = tip.x * u * (0.4 + 0.6 * u);
        const by = tip.y * (1.1 * u - 0.1 * u * u);
        const leaf = (1 - u) * 2.2 * s + 0.6 * s;
        g.beginPath();
        g.moveTo(bx - leaf, by - leaf * 0.4);
        g.lineTo(bx + leaf, by + leaf * 0.4);
        g.stroke();
      }
    }
  });
}

// Clover: a spread of tiny round leaves, sometimes a white head.
function cloverSprite(A: number, variant: number) {
  const q = Math.round(A * 4) / 4;
  const s = q / 26;
  return sprite(`clover|${q}|${variant}`, 16 * s + 4, 8 * s + 4, 8 * s + 2, 6 * s + 2, (g) => {
    for (let l = 0; l < 9; l++) {
      const x = (hash(variant * 11 + l) - 0.5) * 12 * s;
      const y = -(hash(variant * 7 + l) * 4) * s;
      for (let a = 0; a < 3; a++) oval(g, x + Math.cos(a * 2.1) * 0.9 * s, y + Math.sin(a * 2.1) * 0.5 * s, 0.9 * s, 0.6 * s, css(pole(CLAY.grass, l % 3 ? 0.08 : -0.12)));
    }
    if (variant % 3 === 0) oval(g, 2 * s, -4 * s, 1.3 * s, 1.1 * s, css(CLAY.offWhite));
  });
}

function pebbleSprite(A: number, variant: number) {
  const q = Math.round(A * 4) / 4;
  const r = (0.06 + hash(variant) * 0.05) * q;
  return sprite(`pebble|${q}|${variant}`, r * 3 + 4, r * 2 + 4, r * 1.5 + 2, r * 1.2 + 2, (g) => {
    lump(g, ellipsePath(g, 0, -r * 0.4, r * 1.3, r * 0.8), 0, -r * 0.4, r * 1.3, r * 0.8, mix(CLAY.rock, CLAY.offWhite, 0.35 + hash(variant + 3) * 0.3));
  });
}

const PETALS: RGB[] = [CLAY.offWhite, CLAY.yellow, hex("#dc7a66"), hex("#b08cd2"), hex("#7f9ee0"), hex("#f0a8c0")];
function flowerSprite(A: number, variant: number) {
  const q = Math.round(A * 4) / 4;
  const s = q / 26;
  const petal = PETALS[variant % PETALS.length];
  const stems = 3 + (variant % 3);
  return sprite(`flower|${q}|${variant}`, 16 * s + 4, 12 * s + 4, 8 * s + 2, 11 * s + 2, (g) => {
    for (let f = 0; f < stems; f++) {
      const x = (f - (stems - 1) / 2) * 2.6 * s + (hash(variant * 3 + f) - 0.5) * 1.5 * s;
      const top = -(5 + hash(variant * 5 + f) * 4) * s;
      g.strokeStyle = css(pole(CLAY.grass, -0.2));
      g.lineWidth = 1 * s;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + (hash(f + variant) - 0.5) * 2 * s, top);
      g.stroke();
      const cx = x + (hash(f + variant) - 0.5) * 2 * s;
      for (let p = 0; p < 4; p++) oval(g, cx + Math.cos(p * 1.57) * 1.1 * s, top + Math.sin(p * 1.57) * 0.8 * s, 1.1 * s, 0.9 * s, css(petal));
      oval(g, cx, top, 0.6 * s, 0.5 * s, css(variant % PETALS.length === 1 ? hex("#b8862a") : CLAY.yellow));
    }
  });
}

function tuftSprite(A: number, variant: number) {
  const q = Math.round(A * 4) / 4;
  const s = q / 26;
  return sprite(`tuft|${q}|${variant}`, 14 * s + 4, 10 * s + 4, 7 * s + 2, 9 * s + 2, (g) => {
    const blades = 3 + (variant % 3);
    for (let b = 0; b < blades; b++) {
      const x = (b - (blades - 1) / 2) * 2.2 * s;
      const lean = (b - (blades - 1) / 2) * 1.2 * s;
      const tall = (4.5 + hash(variant * 7 + b) * 3) * s;
      g.lineCap = "round";
      g.lineWidth = 1.4 * s;
      g.strokeStyle = css(pole(CLAY.grass, -0.3));
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + lean * 0.5, -tall * 0.5);
      g.stroke();
      g.strokeStyle = css(pole(CLAY.grass, 0.14));
      g.beginPath();
      g.moveTo(x + lean * 0.5, -tall * 0.5);
      g.lineTo(x + lean, -tall);
      g.stroke();
    }
  });
}

export function Field(props: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  const view = useRef({ w: 0, h: 0, A: 20, OX: 0, OY: 0 });
  // The scale is fixed once it's set: a price is always the same row of ground, and the view pans to follow the kids.
  const ground = useRef({ rowSize: 0, ref: 0, cy: 0, shown: 0, lag: 0, at: 0 });
  const memory = useRef<{
    past: Past[];
    call: Yours["call"] | null;
    flag: number | null;
    summoned: Map<number, number>;
    hands: Map<string, Hand>;
    col: number;
    struck: number;
    sky: { wet: number; at: number; flash: number; next: number };
    gait: { walked: number; y: number; at: number };
    rain: Float32Array | null;
  }>({
    past: [],
    call: null,
    flag: null,
    summoned: new Map(),
    hands: new Map(),
    col: 0,
    struck: 0,
    sky: { wet: 0, at: 0, flash: -1, next: -1 },
    gait: { walked: 0, y: 0, at: 0 },
    rain: null,
  });
  const grass = useRef<{ c: HTMLCanvasElement | null; x0: number; y0: number; w: number; h: number }>({ c: null, x0: 0, y0: 0, w: 0, h: 0 });
  const hover = useRef<Pt | null>(null);
  const soft = useRef<HTMLCanvasElement | null>(null);
  // A finger aims by dragging and places on lifting; the click a tap also fires is then passed over.
  const aiming = useRef(false);
  const tapped = useRef(false);

  useEffect(() => {
    latest.current = props;
  });

  function project() {
    const v = view.current;
    const g = ground.current;
    const now = Date.now();
    const { intervalMs } = latest.current;
    const yOf = (p: number) => (g.ref - p) / g.rowSize - g.cy + R / 2;
    const priceAt = (y: number) => g.ref - (y + g.cy - R / 2) * g.rowSize;
    const X = (t: number) => (t - now) / intervalMs;
    const S = (x: number, y: number, z = 0): Pt => ({ x: v.OX + (x - y) * v.A, y: v.OY + ((x + y) * v.A) / 2 - z });
    return { v, g, now, yOf, priceAt, X, S };
  }

  // The price where the pointer is on the field, or null off it: taken from where the kids are drawn, so a click north of them is
  // always above the price even while they're catching up with it.
  function priceUnder(clientX: number, clientY: number): number | null {
    const box = wrap.current?.getBoundingClientRect();
    if (!box || !ground.current.rowSize) return null;
    if (clientX < box.left || clientX > box.right || clientY < box.top || clientY > box.bottom) return null;
    const { v, priceAt } = project();
    const u = (clientX - box.left - v.OX) / v.A;
    const w = (2 * (clientY - box.top - v.OY)) / v.A;
    return priceAt((w - u) / 2) + ground.current.lag;
  }

  // The grass, painted once onto a sheet of ground and moved with the field; painted again when the field walks off it.
  function grassSheet(nowX: number, cy: number, ext: { x0: number; x1: number; y0: number; y1: number }) {
    const sheet = grass.current;
    const D = 5;
    const top = cy - R / 2;
    const inside = sheet.c && nowX + ext.x0 - 2 >= sheet.x0 && nowX + ext.x1 + 2 <= sheet.x0 + sheet.w && top + ext.y0 - 2 >= sheet.y0 && top + ext.y1 + 2 <= sheet.y0 + sheet.h;
    if (inside) return sheet;
    const x0 = Math.floor(nowX + ext.x0 - 6);
    const y0 = Math.floor(top + ext.y0 - 10);
    const w = Math.ceil(ext.x1 - ext.x0) + 60;
    const h = Math.ceil(ext.y1 - ext.y0) + 20;
    const c = sheet.c ?? document.createElement("canvas");
    c.width = w * D;
    c.height = h * D;
    const g = c.getContext("2d")!;
    const img = g.createImageData(c.width, c.height);
    for (let v = 0; v < c.height; v++) {
      for (let u = 0; u < c.width; u++) {
        const wx = x0 + u / D;
        const wy = y0 + v / D;
        const f = (fbm(wx / 2.25, wy / 2.25) - 0.5) * 0.3 + (fbm(wx / 0.56 + 40, wy / 0.56 + 40) - 0.5) * 0.105;
        const col = pole(CLAY.grass, f);
        const i = (v * c.width + u) * 4;
        img.data[i] = col[0];
        img.data[i + 1] = col[1];
        img.data[i + 2] = col[2];
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    grass.current = { c, x0, y0, w, h };
    return grass.current;
  }

  function draw() {
    const c = canvas.current;
    if (!c || !view.current.w) return;
    const ctx = c.getContext("2d")!;
    const { candles, intervalMs, mark, tickSize, reach, span, rounds, yours, role, walls = [], blasts = [], marks, pins = [], pick, coin } = latest.current;
    const kind = GHOST_KIND[role];
    // On the field the stakes' sizes are closer together than in the portraits, so even a wisp stands out.
    const scale = FIELD_SIZE[kind];
    const v = view.current;
    const g = ground.current;
    const dpr = devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const sky = ctx.createLinearGradient(0, 0, 0, v.h);
    sky.addColorStop(0, css(CLAY.skyTop));
    sky.addColorStop(0.62, css(mix(CLAY.skyTop, CLAY.haze, 0.75)));
    sky.addColorStop(1, css(CLAY.haze));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, v.w, v.h);
    const glow = ctx.createRadialGradient(v.w / 2, v.h / 2, 0, v.w / 2, v.h / 2, Math.max(v.w, v.h) * 0.75);
    glow.addColorStop(0, css(CLAY.glow, 0.55));
    glow.addColorStop(1, css(CLAY.glow, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, v.w, v.h);

    const last = candles.at(-1);
    const target = mark ?? last?.c;
    if (target === undefined || !last) {
      ctx.fillStyle = "#3b4652";
      ctx.font = `13px ${DISPLAY}`;
      ctx.fillText("WAITING FOR THE PRICE...", 16, v.h / 2);
      return;
    }

    const at = performance.now();
    if (!g.rowSize) {
      const recent = candles.slice(-60);
      const moves = recent.slice(1).map((k, i) => Math.abs(k.c - recent[i].c));
      const typical = moves.length ? moves.reduce((a, b) => a + b, 0) / moves.length : 0;
      g.rowSize = Math.max(typical * 1.2, (target * reach) / 4, tickSize);
      g.ref = target;
      g.shown = target;
      g.cy = 0;
    }
    g.shown = reduced() ? target : g.shown + (target - g.shown) * (1 - Math.exp(-Math.min(at - g.at, 50) / 110));
    const live = g.shown;
    g.lag = target - live;
    const worldY = (p: number) => (g.ref - p) / g.rowSize;
    // The kids stay in the middle of the view; your lines further off than it shows are marked at its edge.
    const want = worldY(live);
    g.cy = !g.at || reduced() ? want : g.cy + (want - g.cy) * (1 - Math.exp(-Math.min(at - g.at, 50) / 400));
    g.at = at;

    const { now, yOf, priceAt, X, S } = project();
    const A = v.A;
    const k = A / 26;
    const walk = reduced() ? 0 : at / 110;
    const y0 = yOf(live);
    const nowX = now / intervalMs;
    // The land runs on past every edge of the view: how much of it the screen takes in, and whether a point is on screen.
    const corners = [
      [0, 0],
      [v.w, 0],
      [0, v.h],
      [v.w, v.h],
    ].map(([sx, sy]) => {
      const u = (sx - v.OX) / A;
      const w = (2 * (sy - v.OY)) / A;
      return { x: (u + w) / 2, y: (w - u) / 2 };
    });
    const ext = {
      x0: Math.min(...corners.map((q) => q.x)),
      x1: Math.max(...corners.map((q) => q.x)),
      y0: Math.min(...corners.map((q) => q.y)),
      y1: Math.max(...corners.map((q) => q.y)),
    };
    const seen = (q: Pt, pad = 40) => q.x > -pad && q.x < v.w + pad && q.y > -pad && q.y < v.h + pad * 1.5;
    // A line across the ground is on the map if the view shows it beside the kids or a little ahead of them.
    const onMap = (y: number) => [0, 2, 4].some((x) => seen(S(x, y), -24));

    // Where the kids were at any moment: through each candle from its open to its low and high and on to its close.
    const first = candles[0].t;
    const where = (t: number): number | null => {
      if (t < first) return null;
      let lo = 0;
      let hi = candles.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (candles[mid].t <= t) lo = mid;
        else hi = mid - 1;
      }
      const q = candles[lo];
      if (lo === candles.length - 1) return lerp(q.o, live, clamp((t - q.t) / Math.max(1, now - q.t), 0, 1));
      const u = clamp((t - q.t) / intervalMs, 0, 1);
      const w = q.c >= q.o ? [q.o, q.l, q.h, q.c] : [q.o, q.h, q.l, q.c];
      const seg = Math.min(2, Math.floor(u * 3));
      const s = u * 3 - seg;
      return lerp(w[seg], w[seg + 1], s * s * (3 - 2 * s));
    };

    // Remember what happened to yours, so the ground keeps it as the field moves on.
    const m = memory.current;
    if (yours.flag && !m.summoned.has(yours.flag.price)) m.summoned.set(yours.flag.price, now);
    if (yours.call && (!m.call || m.call.at !== yours.call.at)) m.past.push({ at: yours.call.at, price: yours.call.entry, side: yours.call.side, kind: "in" });
    if (!yours.call && m.call) {
      const taken = m.flag !== null && Math.abs(live - m.flag) <= Math.max(g.rowSize, tickSize * 3);
      m.past.push({ at: now, price: taken ? m.flag! : live, side: m.call.side, kind: taken ? "taken" : "out" });
    }
    m.call = yours.call ?? null;
    m.flag = yours.flag?.price ?? null;
    m.past = m.past.filter((p) => X(p.at) > -P - 2);
    // Fair weather until your graves spring; then rain sets in while you're in, and the only lightning is your thundercloud's.
    const storm = yours.call ? 0.8 : 0;
    m.sky.wet += (storm - m.sky.wet) * (1 - Math.exp(-Math.min(at - m.sky.at, 100) / 2500));
    m.sky.at = at;
    const wet = reduced() ? 0 : m.sky.wet;
    for (const key of m.summoned.keys()) if (key !== m.flag) m.summoned.delete(key);

    // The ground: one sheet of clay grass, moved with the field.
    const sheet = grassSheet(nowX, g.cy, ext);
    const D = 5;
    ctx.save();
    const ex = v.OX + (sheet.x0 - nowX - sheet.y0 + g.cy - R / 2) * A;
    const ey = v.OY + ((sheet.x0 - nowX + sheet.y0 - g.cy + R / 2) * A) / 2;
    ctx.setTransform((dpr * A) / D, (dpr * A) / (2 * D), (-dpr * A) / D, (dpr * A) / (2 * D), dpr * ex, dpr * ey);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(sheet.c!, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (wet > 0.01) {
      ctx.fillStyle = `rgba(46, 58, 84, ${0.2 * wet})`;
      ctx.fillRect(0, 0, v.w, v.h);
    }

    // The trail: everywhere they've been, trodden into a muddy path that is the chart, with puddles in it and footprints along it.
    const stepT = intervalMs / 16;
    const trail: { t: number; q: Pt }[] = [];
    for (let t = Math.ceil(Math.max(first, now + (ext.x0 - 1) * intervalMs) / stepT) * stepT; t < now; t += stepT) {
      const p = where(t);
      if (p !== null) trail.push({ t, q: S(X(t), yOf(p)) });
    }
    trail.push({ t: now, q: S(0, y0) });
    const trace = (dy = 0) => {
      ctx.beginPath();
      trail.forEach(({ q }, i) => (i ? ctx.lineTo(q.x, q.y + dy) : ctx.moveTo(q.x, q.y + dy)));
    };
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const [width, color, dy] of [
      [0.46 * A, css(pole(CLAY.grass, -0.4), 0.45), 0.02 * A],
      [0.32 * A, css(times(MUD, 1 - 0.18 * wet)), 0],
      [0.14 * A, css(pole(MUD, 0.16 - 0.1 * wet)), -0.03 * A],
    ] as const) {
      trace(dy);
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
    for (let n = 0; n < trail.length - 1; n++) {
      const { t, q } = trail[n];
      const step = Math.round(t / stepT);
      const h = hash(step * 3.7);
      if (h < 0.035 + 0.08 * wet) {
        const r = (0.07 + hash(step) * 0.08) * A;
        const lean = (hash(step * 1.9) - 0.5) * 0.12 * A;
        oval(ctx, q.x + lean, q.y + 0.02 * A, r * 2, r * 0.8, css(times(MUD, 0.66)));
        oval(ctx, q.x + lean - r * 0.35, q.y + 0.01 * A, r * 1.25, r * 0.42, css(PUDDLE, 0.7));
        oval(ctx, q.x + lean - r * 0.6, q.y, r * 0.4, r * 0.12, css(pole(PUDDLE, 0.4), 0.6));
      } else if (step % 2 === 0) {
        const side = step % 4 ? 1 : -1;
        oval(ctx, q.x + side * 0.05 * A, q.y + side * 0.025 * A, 0.045 * A, 0.022 * A, css(times(MUD, 0.8), 0.6));
      }
    }

    // The day's lines on the ground: the fight's start, each new round, the final bell.
    for (const [t, color] of [[span.from, COLORS.volt], ...rounds.map((r) => [r.at, "#f8a23a"] as const), [span.to, COLORS.volt]] as const) {
      const x = X(t);
      if (x >= ext.x0 && x <= ext.x1) line(ctx, S(x, ext.y0), S(x, ext.y1), color, 2, [8, 6]);
    }

    // Lines across the ground: chalk where banking at the market breaks even, wire where you'd be knocked out.
    if (yours.call && yours.even !== undefined && onMap(yOf(yours.even))) {
      line(ctx, S(Math.max(X(yours.call.at), ext.x0), yOf(yours.even)), S(ext.x1, yOf(yours.even)), css(CLAY.offWhite, 0.8), 1.6, [2, 6]);
    }
    if (yours.call && onMap(yOf(yours.call.koAt))) {
      const yk = yOf(yours.call.koAt);
      line(ctx, S(Math.max(X(yours.call.at), ext.x0), yk), S(ext.x1, yk), css(CLAY.steelDark, 0.8), 1.4);
      for (let a = Math.ceil((nowX + Math.max(X(yours.call.at), ext.x0)) * 2) / 2; a < nowX + ext.x1; a += 0.5) {
        const q = S(a - nowX, yk, 2);
        line(ctx, { x: q.x - 3, y: q.y - 3 }, { x: q.x + 3, y: q.y + 3 }, css(CLAY.steelDark, 0.8), 1.2);
      }
    }

    for (const p of m.past) {
      const y = yOf(p.price);
      if (!onMap(y)) continue;
      const q = S(X(p.at), y);
      if (p.kind === "in") oval(ctx, q.x, q.y, 13 * k, 5.5 * k, css(pole(CLAY.grass, -0.25), 0.4));
      else if (p.kind === "taken") blit(ctx, scorchSprite(A * 1.8, Math.round(p.at)), q, 0.9);
    }


    // Everything that stands: shadows on the ground first, then each thing back to front.
    const stood: { d: number; draw: () => void }[] = [];
    const put = (x: number, y: number, fn: () => void) => stood.push({ d: x + y, draw: fn });
    const shadows: (() => void)[] = [];
    const lights: { p: Pt; r: number; color: string }[] = [];
    // What stands tall enough to throw a long shadow when lightning lights it, where lightning is lighting the field this moment, and
    // how much the sun's soft shadows give way to it.
    const casters: { x: number; y: number; h: number; w: number }[] = [];
    const glare: { x: number; y: number }[] = [];
    let sun = 1;
    const i0 = Math.floor(nowX + ext.x0) - 1;
    const i1 = Math.ceil(nowX + ext.x1) + 1;
    const clear = [yours.trap?.price, yours.call?.entry, yours.flag?.price].filter((p): p is number => p !== undefined).map(yOf);
    const j0 = Math.floor(g.cy - R / 2 + ext.y0) - 1;
    const j1 = Math.ceil(g.cy - R / 2 + ext.y1) + 1;
    // Nothing grows on the trail.
    const bare = (x: number, y: number) => {
      if (x > 0.15) return false;
      const p = where(now + x * intervalMs);
      return p !== null && Math.abs(yOf(p) - y) < 0.24;
    };
    const low: { d: number; draw: () => void }[] = [];
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const n = hash(i * 17 + j * 131);
        const x = i - nowX + hash(i + j) * 0.7;
        const y = j + 0.5 - g.cy + R / 2;
        if (!seen(S(x, y), 80)) continue;
        // Meadows are thick with flowers, the wilder ground with ferns and toadstools.
        const meadow = clamp((fbm(i / 7 + 11, j / 7 + 5) - 0.35) * 2.4, 0, 1);
        const grove = n < 0.024 && seen(S(x, y), 10) && clear.every((yc) => Math.abs(yc - y) > 1) && !bare(x, y);
        // Whatever the kids walk through goes faint, so they're never lost behind it.
        const faint = clamp((Math.hypot(x, y - y0) - 0.5) / 0.9, 0.3, 1);
        if (grove) {
          const pick = hash(i * 3 + j);
          const variant = Math.floor(hash(i * 5 + j * 3) * 12);
          if (pick < 0.62) {
            const size = variant === 10 ? 0.7 : variant % 3 === 0 ? 1.15 : 1;
            shadows.push(() => {
              const p = S(x, y);
              blob(ctx, p.x, p.y, 0.8 * A * size, 0.38 * A * size, [92, 108, 136], 0.6 * sun);
            });
            casters.push({ x, y, h: 1.9 * A * size, w: 0.7 * A * size });
            put(x, y, () => {
              const f = treeAt(Math.round((A / 28) * (variant % 3 === 0 ? 1.15 : 1) * dpr * 10) / 10, variant);
              const p = S(x, y);
              ctx.globalAlpha = faint;
              ctx.drawImage(f.canvas, p.x - f.ox / dpr, p.y - f.oy / dpr, f.w / dpr, f.h / dpr);
              ctx.globalAlpha = 1;
            });
          } else if (pick < 0.74) {
            shadows.push(() => {
              const p = S(x, y);
              blob(ctx, p.x, p.y, 0.45 * A, 0.22 * A, [92, 108, 136], 0.45 * sun);
            });
            casters.push({ x, y, h: 1.5 * A, w: 0.35 * A });
            put(x, y, () => blit(ctx, deadSprite(A, variant), S(x, y), faint));
          } else if (pick < 0.83) put(x, y, () => blit(ctx, stumpSprite(A, variant), S(x, y), faint));
          else if (pick < 0.92) {
            put(x, y, () => blit(ctx, pumpkinSprite(A, variant), S(x, y), faint));
            if (variant % 3 === 0) lights.push({ p: S(x, y, 0.12 * A), r: 0.55 * A, color: "rgba(255, 170, 80, 0.45)" });
          } else put(x, y, () => blit(ctx, boulderSprite(A, variant), S(x, y), faint));
        }
        for (let t = 0; t < 5; t++) {
          const tx = i - nowX + hash(i * 5 + j * 11 + t);
          const ty = j + hash(i * 13 + j * 7 + t) - g.cy + R / 2;
          const q = S(tx, ty);
          if (!seen(q, 20)) continue;
          const roll = hash(i * 23 + j * 29 + t * 3);
          const v = Math.floor(hash(i * 7 + j * 3 + t * 11) * 12);
          let paint: Sprite | null = null;
          const flowers = 0.012 + 0.09 * meadow;
          const ferns = 0.006 + 0.014 * (1 - meadow);
          if (roll < (grove ? 0.5 : 0.13)) paint = tuftSprite(A, v % 6);
          else if (roll < 0.13 + flowers) paint = flowerSprite(A, v);
          else if (roll < 0.13 + flowers + ferns) paint = fernSprite(A, v);
          else if (roll < 0.15 + flowers + ferns) paint = cloverSprite(A, v);
          else if (roll > 0.993 - 0.006 * (1 - meadow)) paint = mushroomSprite(A, v);
          else if (roll > 0.982) paint = pebbleSprite(A, v % 8);
          if (!paint || bare(tx, ty)) continue;
          const sp = paint;
          low.push({ d: tx + ty, draw: () => blit(ctx, sp, q) });
        }
      }
    }
    low.sort((p, q) => p.d - q.d).forEach((l) => l.draw());
    // The future is haze: nobody knows where they'll walk.
    poly(ctx, [S(0.5, ext.y0), S(ext.x1 + 1, ext.y0), S(ext.x1 + 1, ext.y1), S(0.5, ext.y1)], css(CLAY.haze, 0.22));

    // Your thundercloud: it keeps pace a little ahead of the kids over your line and strikes the line again and again, each strike
    // leaving a scorch that the field carries off behind them, so the price it waits for is marked out on the ground.
    const STRIKE_MS = 1300;
    const yf = yours.flag && onMap(yOf(yours.flag.price)) ? yOf(yours.flag.price) : null;
    // Where a thundercloud over a row floats: a little ahead of the kids, further ahead the further south it is so it never hides them.
    const cloudAt = (y: number) => clamp(3.1 + Math.max(0, y - y0), 3.1, 6.5);
    const cloudX = yf === null ? 0 : cloudAt(yf);
    const CLOUD_Z = 2.7 * A;
    const drawCloud = (x: number, y: number, alpha: number) => {
      const f = stormAt(Math.round(((A * 4.4) / 26) * dpr * 10) / 10);
      const p = S(x, y, CLOUD_Z + (reduced() ? 0 : Math.sin(at / 900) * 0.05 * A));
      ctx.globalAlpha = alpha;
      ctx.drawImage(f.canvas, p.x - f.ox / dpr, p.y - f.oy / dpr, f.w / dpr, f.h / dpr);
      ctx.globalAlpha = 1;
    };
    const bolts: (() => void)[] = [];
    const flashes: { p: Pt; r: number; color: string }[] = [];
    if (yf !== null && yours.flag) {
      const from = m.summoned.get(yours.flag.price) ?? now;
      const seed = from % 997;
      const strikeX = (j: number) => (from + j * STRIKE_MS) / intervalMs - nowX + cloudX + (hash(j * 7.1 + seed) - 0.5) * 1.4;
      line(ctx, S(0.3, yf), S(ext.x1, yf), css(CLAY.yellow, 0.85), 2, [4, 6]);
      const j1 = Math.floor((now - from) / STRIKE_MS);
      if (from + j1 * STRIKE_MS > m.struck && !reduced()) {
        m.struck = from + j1 * STRIKE_MS;
        play("strike");
      }
      for (let j = j1; j >= 0 && j > j1 - 18; j--) {
        const x = strikeX(j);
        if (x < ext.x0) break;
        const age = now - (from + j * STRIKE_MS);
        const left = clamp(1 - age / (STRIKE_MS * 18), 0, 1);
        const q = S(x, yf);
        blit(ctx, scorchSprite(A, j + seed), q, 0.9 * left);
        if (age < 600) lights.push({ p: q, r: 0.3 * A, color: `rgba(255, 170, 80, ${0.5 * (1 - age / 600)})` });
        if (age > 260 || reduced()) continue;
        // The stroke flickers: lit, dark a moment, lit again.
        const on = age < 90 || (age > 130 && age < 240);
        if (!on) continue;
        const top = S(cloudX + (x - cloudX) * 0.35, yf, CLOUD_Z - 0.1 * A);
        glare.push({ x, y: yf });
        const sky = { x: cloudX + (x - cloudX) * 0.35, y: yf, z: CLOUD_Z / A - 0.1 };
        bolts.push(() => lightning3d(ctx, sky, { x, y: yf, z: 0 }, j * 13 + seed, A / 34, (pt) => S(pt.x, pt.y, pt.z * A)));
        flashes.push({ p: q, r: 1.1 * A, color: "rgba(255, 232, 140, 0.55)" }, { p: { x: top.x, y: top.y - 0.3 * A }, r: 1.3 * A, color: "rgba(200, 210, 255, 0.4)" });
      }
      shadows.push(() => {
        const p = S(cloudX + 0.35, yf - 0.25);
        blob(ctx, p.x, p.y, 2.1 * A, 0.95 * A, [118, 124, 160], 0.6 * sun);
      });
    }
    // Lightning comes down on the kids where they walked into your cloud.
    for (const p of m.past) {
      if (p.kind !== "taken" || now - p.at > 1100) continue;
      const t = (now - p.at) / 1100;
      const q = S(X(p.at), yOf(p.price));
      if (t < 0.4 && !reduced()) {
        glare.push({ x: X(p.at), y: yOf(p.price) });
        const kx = X(p.at);
        const ky = yOf(p.price);
        bolts.push(() => lightning3d(ctx, { x: kx + 0.3, y: ky - 0.3, z: CLOUD_Z / A + 0.4 }, { x: kx, y: ky, z: 0 }, Math.round(p.at), A / 22, (pt) => S(pt.x, pt.y, pt.z * A)));
      }
      flashes.push({ p: q, r: (1.2 + 2 * t) * A, color: `rgba(255, 232, 140, ${0.8 * (1 - t)})` });
      bolts.push(() => {
        for (const r of [0.5, 1]) oval(ctx, q.x, q.y, (0.4 + 1.6 * t * r) * A, (0.2 + 0.8 * t * r) * A, undefined, `rgba(255, 236, 120, ${1 - t})`, 2);
      });
    }

    // Strike's order book, its biggest orders only: each a hand clawing up out of the ground on its line in the candle the kids are in,
    // further out the bigger it is, the very biggest with a head out too. They rise as orders come and sink as they go; as the kids walk
    // on, the biggest stays where it was and the rest go back under.
    const col = Math.floor(nowX);
    const RISE = 700;
    const SINK = 600;
    const calm = reduced();
    if (m.col !== col) {
      for (const h of m.hands.values()) if (h.col !== col && !h.gone && !h.kept) h.gone = at;
      m.col = col;
    }
    if (walls.length) {
      const all = walls.flatMap((w) => w.orders).sort((a, b) => a - b);
      const usual = all[Math.floor(all.length / 2)] || 1;
      const cx = col + 0.5 - nowX;
      const orders: { key: string; row: number; side: Side; usd: number; seed: number }[] = [];
      for (const w of walls) {
        const row = Math.round(worldY(w.p) * 2) / 2;
        if (!seen(S(cx, row - g.cy + R / 2), -30)) continue;
        [...w.orders].sort((a, b) => b - a).forEach((usd, k) => orders.push({ key: `${col}|${w.p}|${k}`, row, side: w.side, usd, seed: hash(col * 7919 + row * 62 + k * 13) }));
      }
      orders.sort((a, b) => b.usd - a.usd);
      const most = v.w < 600 ? 4 : 7;
      const shown = new Set<string>();
      orders.forEach((o, rank) => {
        const h = m.hands.get(o.key);
        if (rank >= (h && !h.gone ? most + 3 : most)) return;
        shown.add(o.key);
        const reach = clamp((Math.sqrt(o.usd / usual) - 0.5) / 2.1, 0.2, 1);
        const head = o.usd >= usual * 8 && rank < 2;
        if (!h) m.hands.set(o.key, { col, row: o.row, side: o.side, usd: o.usd, reach, head, kept: false, born: at, gone: 0, seed: o.seed });
        else {
          if (h.gone) {
            h.born = at - RISE * (1 - clamp((at - h.gone) / SINK, 0, 1));
            h.gone = 0;
          }
          Object.assign(h, { usd: o.usd, reach, head: h.head || head });
        }
      });
      for (const [key, h] of m.hands) if (h.col === col && !h.gone && !shown.has(key)) h.gone = at;
      [...m.hands.values()]
        .filter((h) => h.col === col && !h.gone)
        .sort((a, b) => b.usd - a.usd)
        .forEach((h, i) => (h.kept = i === 0 && h.usd >= usual * 2.5));
    }
    for (const [key, h] of m.hands) if ((h.gone && at - h.gone > SINK) || h.col + 1 - nowX < ext.x0 - 1) m.hands.delete(key);
    // Part of a sprite up out of the ground: what's above its cut, drawn as far down as it has yet to rise.
    const risen = (sp: Sprite, p: Pt, e: number, alpha: number, cut: number) => {
      const d = (1 - e) * (sp.oy + cut);
      const sh = Math.min(sp.h, sp.oy + cut - d);
      if (sh <= 0.5) return;
      ctx.globalAlpha = alpha;
      ctx.drawImage(sp.c, 0, 0, sp.c.width, (sh / sp.h) * sp.c.height, p.x - sp.ox, p.y - sp.oy + d, sp.w, sh);
      ctx.globalAlpha = 1;
    };
    for (const h of m.hands.values()) {
      const cx = h.col + 0.5 - nowX;
      const fade = Math.min(1, 1.5 * clamp(1 + cx / (P * 0.5), 0, 1));
      const u = h.gone ? clamp((at - h.gone) / SINK, 0, 1) : clamp((at - h.born) / RISE, 0, 1);
      const e = calm ? (h.gone ? 0 : 1) : h.gone ? 1 - u * u : ease(u);
      if (e <= 0 || fade < 0.03) continue;
      const x = cx + (hash(h.seed) - 0.5) * 0.7;
      const y = h.row - g.cy + R / 2 + (hash(h.seed * 977) - 0.5) * 0.2;
      if (!seen(S(x, y))) continue;
      const tint = TEAMS[h.side].coat;
      const wide = h.head ? 1.7 : 1;
      put(x, y, () => {
        const p = S(x, y);
        blit(ctx, moundSprite(A, false, wide), p, fade * Math.min(1, e * 2.5));
        if (h.head) {
          const eh = clamp((e - 0.3) / 0.7, 0, 1);
          const bob = calm ? 0 : Math.sin(at / 700 + h.seed * 20) * 0.6 * k;
          const q = { x: p.x - 5.5 * k, y: p.y + 1.5 * k + bob };
          risen(headSprite(A, tint, Math.floor(h.seed * 40)), q, eh, fade, 1.4 * k);
          if (eh > 0.6) glows.push({ p: { x: q.x, y: q.y - 7.4 * k }, r: 0.4 * A, color: `rgba(252, 226, 120, ${0.38 * fade})` });
        }
        risen(armSprite(A, tint, h.reach, Math.floor(h.seed * 6)), { x: p.x + (h.head ? 4 * k : 0), y: p.y }, e, fade, 1.4 * k);
        blit(ctx, moundSprite(A, true, wide), p, fade * Math.min(1, e * 2.5));
      });
    }

    // A ghost floats a little above the ground, bobbing; its glow goes in with the dusk.
    const glows: { p: Pt; r: number; color: string }[] = [...lights];
    const spook = (x: number, y: number, side: Side, s: number, phase: number, alpha: number, boo: boolean, lift = 0, turn = 0) => {
      shadows.push(() => {
        const p = S(x, y);
        blob(ctx, p.x, p.y, 0.5 * s * A, 0.24 * s * A, [92, 108, 136], 0.5 * sun * clamp(1 - lift / (1.5 * A), 0.2, 1));
      });
      casters.push({ x, y, h: 1.3 * s * A, w: 0.6 * s * A });
      put(x, y, () => {
        const p = S(x, y, (6 + Math.sin(phase) * 2.5) * s * k + lift);
        const f = ghostAt(kind, GHOSTS[side], Math.round(1.9 * s * k * dpr * 10) / 10, Math.floor((((phase / (Math.PI * 2)) % 1) + 1) % 1 * FRAMES), boo, turn);
        ctx.globalAlpha = alpha;
        ctx.drawImage(f.canvas, p.x - f.ox / dpr, p.y - f.oy / dpr, f.w / dpr, f.h / dpr);
        ctx.globalAlpha = 1;
        glows.push({ p: { x: p.x, y: p.y - 16 * s * k }, r: 34 * s * k, color: side === "long" ? "rgba(170, 240, 210, 0.32)" : "rgba(250, 190, 205, 0.32)" });
      });
    };
    // A row of your ghosts on a line just ahead of the kids, keeping pace with them: as many as your power calls for, as big as your
    // stake, spaced by their size and, when there are many, staggered either side of the line so the row stays short.
    const across = ({ wisp: 19, spectre: 20, poltergeist: 24 }[kind] * 1.9 * scale) / 26;
    const gapOf = (count: number) => Math.min(across * 0.8, 9 / Math.max(1, count - 1));
    const row = (count: number) => {
      const gap = gapOf(count);
      const tight = gap < across * 0.7;
      return Array.from({ length: count }, (_, j) => ({ x: 0.75 + across * 0.5 + j * gap, dy: tight ? (j % 2 ? 0.32 : -0.32) : 0 }));
    };

    // Your ambush: a line of graves on your line just ahead of the kids, set in the ground itself, so as the field moves on the one at
    // the back sinks into the earth and a new one rises at the front. They sink away as your ghosts swirl up out of them.
    const graveRow = (ya: number, count: number, side: Side, sink: number) => {
      const xs = row(count);
      const gap = gapOf(count);
      const tight = gap < across * 0.7;
      const x0 = xs[0].x - gap * 0.5;
      const x1 = xs[xs.length - 1].x + gap * 0.5;
      for (let i = Math.floor((nowX + x0) / gap); i * gap - nowX < x1; i++) {
        const x = i * gap - nowX;
        const e = clamp((x - x0) / (gap * 0.9), 0, 1) * clamp((x1 - x) / (gap * 0.9), 0, 1) * sink;
        if (e < 0.02) continue;
        const y = ya + (hash(i * 3.7) - 0.5) * 0.14 + (tight ? (i % 2 ? 0.26 : -0.26) : 0);
        const v = Math.floor(hash(i * 5.3) * 4);
        casters.push({ x, y, h: 0.8 * A * scale * e, w: 0.55 * A * scale });
        shadows.push(() => {
          const p = S(x, y);
          blob(ctx, p.x + 0.14 * A, p.y - 0.06 * A, 0.34 * A * scale, 0.15 * A * scale, [110, 118, 150], 0.5 * e * sun);
        });
        put(x, y, () => {
          const p = S(x, y);
          blit(ctx, moundSprite(A, false, scale * 1.3), p, Math.min(1, e * 2));
          risen(graveSprite(A, side, v, scale * 1.5), p, ease(e), 1, 0.05 * A);
          blit(ctx, moundSprite(A, true, scale * 1.3), p, Math.min(1, e * 2));
          if (e > 0.5) glows.push({ p: { x: p.x, y: p.y - 0.45 * A * scale }, r: 0.5 * A * scale, color: side === "long" ? `rgba(130, 240, 190, ${0.45 * e})` : `rgba(250, 150, 170, ${0.45 * e})` });
        });
      }
    };

    // Every word on the field is laid on the ground like the markings on a pitch: reading west to east along a row, or south to north
    // up a line of time, its foot at (x, y) and about size tiles tall. Drawn last, so nothing stands in front of it.
    const labels: (() => void)[] = [];
    const marking = (text: string, x: number, y: number, size: number, color: string, o: { align?: CanvasTextAlign; up?: boolean; halo?: boolean; glow?: boolean; weight?: number } = {}) => {
      const f = (A * size) / 26;
      const at0 = S(x, y);
      ctx.save();
      if (o.up) ctx.setTransform(dpr * f, (-dpr * f) / 2, dpr * f, (dpr * f) / 2, dpr * at0.x, dpr * at0.y);
      else ctx.setTransform(dpr * f, (dpr * f) / 2, -dpr * f, (dpr * f) / 2, dpr * at0.x, dpr * at0.y);
      if (o.glow) ctx.globalCompositeOperation = "lighter";
      ctx.font = `${o.weight ?? 700} 26px ${o.weight === 400 ? DISPLAY : MONO}`;
      ctx.textAlign = o.align ?? "left";
      ctx.textBaseline = "alphabetic";
      if (o.halo !== false && !o.glow) {
        ctx.lineJoin = "round";
        ctx.lineWidth = 6;
        ctx.strokeStyle = "rgba(10, 14, 22, 0.6)";
        ctx.strokeText(text, 0, 0);
      }
      ctx.fillStyle = color;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    };
    if (yours.trap && !yours.call) {
      const ya = yOf(yours.trap.price);
      if (onMap(ya)) {
        graveRow(ya, yours.trap.count, yours.trap.side, 1);
        const at0 = row(yours.trap.count)[0].x;
        const price = fmt.price(yours.trap.price, tickSize);
        const color = TEAMS[yours.trap.side].ui;
        labels.push(() => marking(price, at0 - across * 0.6, ya + 0.62, 0.34, color, { align: "right" }));
      }
    }
    let spooked = 0;
    if (yours.call) {
      const call = yours.call;
      const ya = yOf(call.entry);
      // The further the kids walk on through your ghosts, the more of them they wear away: all gone at your K.O. price.
      const wrong = call.side === "long" ? call.entry - live : live - call.entry;
      const hurt = clamp(wrong / (Math.abs(call.entry - call.koAt) || 1), 0, 1);
      const go = ease((now - call.at) / (call.maker ? 900 : 1600));
      spooked = call.maker ? 1 - clamp((now - call.at) / 1400, 0, 1) : 0;
      // Sprung: the graves sink as your ghosts swirl up out of them, wide and then tighter, before settling into their row.
      const rise = call.maker && !reduced() ? clamp((now - call.at) / 1800, 0, 1) : 1;
      const swirl = (x: number, j: number, r0: number) => {
        const turn = j * 2.1 + r0 * Math.PI * 3.5;
        const r = Math.sin(r0 * Math.PI) * 0.9;
        return { x: x + Math.cos(turn) * r, y: ya + Math.sin(turn) * r * 0.55, lift: Math.sin(r0 * Math.PI) * 1.1 * A, turn };
      };
      if (onMap(ya)) {
        if (rise < 1) graveRow(ya, call.count, call.side, 1 - clamp(rise * 1.6, 0, 1));
        row(call.count).forEach(({ x, dy }, j) => {
          if (rise < 1) {
            const at0 = swirl(x, j, rise);
            at0.y += dy * rise;
            spook(at0.x, at0.y, call.side, Math.round(scale * (0.4 + 0.6 * ease(rise)) * 10) / 10, at0.turn, Math.min(1, rise * 3) * 0.95, true, at0.lift, Math.floor(ANGLES * 3 * ease(rise)) % ANGLES);
            for (let tr = 1; tr <= 5; tr++) {
              const back = swirl(x, j, Math.max(0, rise - tr * 0.035));
              back.y += dy * rise;
              glows.push({ p: S(back.x, back.y, back.lift + 0.5 * A * scale), r: 0.14 * A, color: call.side === "long" ? `rgba(150, 255, 210, ${0.7 * (1 - tr / 6)})` : `rgba(255, 170, 190, ${0.7 * (1 - tr / 6)})` });
            }
            return;
          }
          const from = call.maker ? { x, y: ya + dy } : { x: x + 1.6, y: call.side === "long" ? R + 1 : -1 };
          spook(lerp(from.x, x, go), lerp(from.y, ya + dy, go), call.side, scale, walk * 0.5 + j * 1.3, 0.95 - 0.7 * hurt, spooked > 0 || hurt < 0.05);
        });
      }
      const yk = yOf(call.koAt);
      if (onMap(yk)) labels.push(() => marking(`K.O. ${fmt.price(call.koAt, tickSize)}`, 2, yk + (call.side === "long" ? 0.55 : -0.12), 0.28, COLORS.down));
      if (yours.even !== undefined && onMap(yOf(yours.even))) {
        const ye = yOf(yours.even);
        labels.push(() => marking("BANK PAYS PAST HERE", 4.2, ye - 0.12, 0.24, "#e8edf2"));
      }
    }
    if (yours.flag && yf !== null) {
      const banks = yours.flag.banks;
      const text = `${fmt.price(yours.flag.price, tickSize)}${banks !== undefined ? `  ${fmt.money(banks, true)}` : ""}`;
      labels.push(() => marking(text, cloudX, yf + 0.7, 0.34, COLORS.volt, { align: "center" }));
    }

    // The kids: the price. They walk as far as the ground moves under them and the price carries them, a full stride to every half
    // a tile, so their feet keep to the ground; with the ground near still they stand and tremble. They jump when your ghosts spring.
    const gait = m.gait;
    const wy = worldY(live);
    const dt = gait.at ? Math.min(at - gait.at, 100) : 0;
    const moved = Math.hypot(dt / intervalMs, wy - gait.y);
    gait.walked += moved;
    gait.y = wy;
    gait.at = at;
    const still = reduced() || moved < dt * 0.00005;
    const strideNow = reduced() ? 0 : Math.floor(((gait.walked / 0.5) % 1) * STRIDES);
    const tremble = still && !reduced() ? Math.sin(at / 37) * 0.5 : 0;
    shadows.push(() => {
      const p = S(0, y0);
      blob(ctx, p.x, p.y, 0.8 * A, 0.36 * A, [92, 108, 136], 0.55 * sun);
    });
    casters.push({ x: 0, y: y0, h: 1.2 * A, w: 0.9 * A });
    put(0, y0, () => {
      const p = S(0, y0, Math.sin(spooked * Math.PI) * 14 * k);
      p.x += tremble;
      oval(ctx, p.x, p.y + Math.sin(spooked * Math.PI) * 14 * k, 22 * k, 11 * k, undefined, COLORS.volt, 2);
      const px = Math.round(2.05 * k * dpr * 10) / 10;
      const f = kidsAt(px, strideNow);
      ctx.drawImage(f.canvas, p.x - f.ox / dpr, p.y - f.oy / dpr, f.w / dpr, f.h / dpr);
      const lamp = kidsLantern(2.05 * k);
      glows.push({ p: { x: p.x + lamp.x, y: p.y + lamp.y }, r: 3.2 * A, color: "rgba(255, 196, 120, 0.5)" });
    });
    // Lightning lights the field for a moment: the soft shadows from above give way to hard, long ones thrown straight away from it.
    sun = glare.length ? 0.2 : 1;
    ctx.globalCompositeOperation = "multiply";
    shadows.forEach((fn) => fn());
    const thrown = (f: Pt, dx: number, dy: number, len: number, w: number, a: number) => {
      const nx = -dy * 0.5;
      const ny = dx * 0.5;
      ctx.fillStyle = `rgba(26, 28, 56, ${a})`;
      ctx.beginPath();
      ctx.moveTo(f.x + nx * w * 0.7, f.y + ny * w * 0.7);
      ctx.lineTo(f.x + dx * len + nx * w * 1.3, f.y + dy * len + ny * w * 1.3);
      ctx.lineTo(f.x + dx * len - nx * w * 1.3, f.y + dy * len - ny * w * 1.3);
      ctx.lineTo(f.x - nx * w * 0.7, f.y - ny * w * 0.7);
      ctx.closePath();
      ctx.fill();
    };
    for (const c of casters) {
      const f = S(c.x, c.y);
      for (const src of glare) {
        const d = Math.hypot(c.x - src.x, c.y - src.y);
        if (d > 6 || d < 0.05) continue;
        const o = S(src.x, src.y);
        const len = Math.hypot(f.x - o.x, f.y - o.y) || 1;
        thrown(f, (f.x - o.x) / len, (f.y - o.y) / len, c.h * (2.4 + 2.2 * (1 - d / 6)), c.w, 0.25 + 0.5 * (1 - d / 6));
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
    stood.sort((a, b) => a.d - b.d).forEach((s) => s.draw());
    if (yf !== null) drawCloud(cloudX, yf, 1);

    // Further into the future the haze thickens until the land is lost in it, and the far ground fades into the sky along the top.
    const fogFrom = S(F, 0);
    const fog = ctx.createLinearGradient(fogFrom.x, fogFrom.y, fogFrom.x + 4 * A, fogFrom.y + 8 * A);
    fog.addColorStop(0, css(CLAY.haze, 0));
    fog.addColorStop(1, css(CLAY.haze, 0.7));
    poly(ctx, [S(F, ext.y0), S(ext.x1 + 1, ext.y0), S(ext.x1 + 1, ext.y1), S(F, ext.y1)], undefined);
    ctx.fillStyle = fog;
    ctx.fill();
    const far = ctx.createLinearGradient(0, 0, 0, v.h * 0.32);
    far.addColorStop(0, css(CLAY.haze, 0.38));
    far.addColorStop(1, css(CLAY.haze, 0));
    ctx.fillStyle = far;
    ctx.fillRect(0, 0, v.w, v.h * 0.32);

    // Low mist drifting over the grass at dusk, and once the storm builds, the shadows of its clouds passing over.
    if (!reduced()) {
      const t = at / 1000;
      for (let n = 0; n < 5; n++) {
        const span = v.w + 900;
        const cx = ((((t * (9 + n * 3) + hash(n) * span) % span) + span) % span) - 450;
        const cy = v.h * (0.25 + hash(n * 5.3) * 0.65);
        const r = v.w * (0.22 + hash(n * 2.1) * 0.18);
        for (const [alpha, color] of [
          [0.1 * (1 - wet), CLAY.haze],
          [0.22 * wet, [34, 42, 66] as RGB],
        ] as const) {
          if (alpha < 0.01) continue;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.scale(1, 0.38);
          const patch = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
          patch.addColorStop(0, css(color, alpha));
          patch.addColorStop(1, css(color, 0));
          ctx.fillStyle = patch;
          ctx.fillRect(-r, -r, r * 2, r * 2);
          ctx.restore();
        }
      }
    }

    // Rain, heavier round by round: a drop falling slantwise in each patch of the view, and a splash where it lands.
    if (wet > 0.04) {
      const cell = 17;
      const fall = 150;
      const cols = Math.ceil(v.w / cell) + 8;
      const rows = Math.ceil(v.h / cell) + 2;
      if (!m.rain || m.rain.length !== cols * rows * 4) {
        m.rain = new Float32Array(cols * rows * 4);
        for (let n = 0; n < cols * rows; n++) {
          const h = hash(n * 73.1 + 17.3);
          m.rain.set([h, 0.42 + hash(h * 91) * 0.3, hash(h * 57), hash(h * 13) * 0.5 + hash(h * 29) * 0.5], n * 4);
        }
      }
      const drops = m.rain;
      const t = at / 1000;
      ctx.beginPath();
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const n = (gy * cols + gx) * 4;
          if (drops[n] > wet) continue;
          const period = drops[n + 1];
          const ph = (((t + drops[n + 2] * period) % period) + period) % period / period;
          const lx = (gx - 1) * cell + drops[n + 3] * cell;
          const ly = (gy - 1) * cell + drops[n + 2] * cell;
          if (ph < 0.9) {
            const drop = fall * (1 - ph);
            const x = lx - drop * 0.28;
            const y = ly - drop;
            ctx.moveTo(x, y);
            ctx.lineTo(x + 3.4, y + 12);
          } else {
            const r = 1.5 + (ph - 0.9) * 30;
            ctx.moveTo(lx - r, ly - r * 0.4);
            ctx.lineTo(lx - r * 0.4, ly);
            ctx.moveTo(lx + r, ly - r * 0.4);
            ctx.lineTo(lx + r * 0.4, ly);
          }
        }
      }
      ctx.strokeStyle = "rgba(214, 224, 242, 0.6)";
      ctx.lineWidth = 1;
      ctx.lineCap = "butt";
      ctx.stroke();
    }

    // Dusk: everything dimmed toward a cool blue, deeper as the storm comes in, then the lantern and the ghosts glowing through it.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = css(mix([206, 208, 224], [104, 112, 160], wet));
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.restore();
    ctx.globalCompositeOperation = "lighter";
    // Fireflies over the grass while it's dry, and a pool of lantern light on the ground about them.
    const dry = 1 - wet;
    if (dry > 0.05 && !reduced()) {
      const t = at / 1000;
      for (let n = 0; n < 26; n++) {
        const blink = Math.max(0, Math.sin(t * (1.3 + hash(n) * 1.4) + n * 2.7));
        if (blink < 0.05) continue;
        const fx = hash(n * 7.3) * v.w + Math.sin(t * 0.31 + n) * 40;
        const fy = v.h * (0.2 + hash(n * 3.1) * 0.75) + Math.cos(t * 0.43 + n * 1.9) * 24;
        glows.push({ p: { x: fx, y: fy }, r: 7, color: `rgba(222, 255, 150, ${0.75 * blink * dry})` });
      }
    }
    const lamp = S(0, y0);
    ctx.save();
    ctx.translate(lamp.x, lamp.y);
    ctx.scale(1, 0.5);
    const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, 2.6 * A);
    pool.addColorStop(0, "rgba(255, 186, 104, 0.3)");
    pool.addColorStop(1, "rgba(255, 186, 104, 0)");
    ctx.fillStyle = pool;
    ctx.fillRect(-2.6 * A, -2.6 * A, 5.2 * A, 5.2 * A);
    ctx.restore();
    // The coin, like a signal in the sky: a disc of lantern light on the ground under the kids with the market's mark cut out of it.
    const mark0 = coin ? signalOf(coin) : null;
    if (mark0) {
      const f = (A * 1.8) / SIGNAL;
      ctx.save();
      ctx.setTransform(dpr * f, (dpr * f) / 2, -dpr * f, (dpr * f) / 2, dpr * lamp.x, dpr * lamp.y);
      ctx.globalAlpha = 0.34;
      ctx.drawImage(mark0, -SIGNAL / 2, -SIGNAL / 2);
      ctx.restore();
      ctx.globalCompositeOperation = "lighter";
    }
    for (const glow of [...glows, ...flashes]) {
      const halo = ctx.createRadialGradient(glow.p.x, glow.p.y, 0, glow.p.x, glow.p.y, glow.r);
      halo.addColorStop(0, glow.color);
      halo.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = halo;
      ctx.fillRect(glow.p.x - glow.r, glow.p.y - glow.r, glow.r * 2, glow.r * 2);
    }
    ctx.globalCompositeOperation = "source-over";
    bolts.forEach((fn) => fn());

    // When the cloud strikes, the whole field is lit pale for a moment.
    if (glare.length) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = "rgba(223, 232, 255, 0.14)";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.restore();
    }

    // Tilt-shift, like a model photographed close up: the top and bottom of the view go soft. Too costly on a phone.
    if (v.w >= 600) {
      const tw = Math.max(1, Math.round(c.width / 2));
      const th = Math.max(1, Math.round(c.height / 2));
      const b = soft.current ?? document.createElement("canvas");
      soft.current = b;
      if (b.width !== tw || b.height !== th) {
        b.width = tw;
        b.height = th;
      }
      const gb = b.getContext("2d")!;
      gb.globalCompositeOperation = "source-over";
      gb.clearRect(0, 0, tw, th);
      gb.filter = "blur(1.1px)";
      gb.drawImage(c, 0, 0, tw, th);
      gb.filter = "none";
      gb.globalCompositeOperation = "destination-in";
      const band = gb.createLinearGradient(0, 0, 0, th);
      band.addColorStop(0, "rgba(0, 0, 0, 1)");
      band.addColorStop(0.22, "rgba(0, 0, 0, 0.85)");
      band.addColorStop(0.38, "rgba(0, 0, 0, 0)");
      band.addColorStop(0.62, "rgba(0, 0, 0, 0)");
      band.addColorStop(0.78, "rgba(0, 0, 0, 0.85)");
      band.addColorStop(1, "rgba(0, 0, 0, 1)");
      gb.fillStyle = band;
      gb.fillRect(0, 0, tw, th);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(b, 0, 0, c.width, c.height);
      ctx.restore();
    }

    // The day's markers, laid along their lines of time: the fight's start, each new round and its floor, the final bell.
    for (const [t, label, color] of [
      [span.from, "HAUNTING BEGINS", COLORS.volt],
      ...rounds.map((r) => [r.at, `ROUND ${r.round}  ${r.floor}X FLOOR`, "#f8a23a"] as const),
      [span.to, "FINAL BELL", COLORS.volt],
    ] as const) {
      const x = X(t);
      if (x < ext.x0 || x > ext.x1 || Math.abs(x) < 1.6) continue;
      marking(label, x - 0.12, y0 + 2.6, 0.3, color, { up: true });
    }

    // Who's been knocked out, where it happened.
    for (const mk of marks) {
      const x = X(mk.t);
      const y = yOf(mk.p);
      if (!onMap(y) || !seen(S(x, y))) continue;
      marking(mk.glyph, x, y + 0.2, 0.3, mk.color, { align: "center" });
    }

    // Others' ambushes, along the edge of the fog where they wait.
    const stacked = new Map<number, number>();
    for (const pin of pins) {
      const y = yOf(pin.p);
      if (!onMap(y)) continue;
      const row = Math.round(y * 2);
      const n = stacked.get(row) ?? 0;
      stacked.set(row, n + 1);
      marking(pin.glyph, F - 0.3 - n * 0.45, y + 0.18, 0.36, pin.color, { align: "center" });
    }

    // The prices, marked on the ground like the numbers on a pitch: each one every few tiles along its row, set in the ground so they
    // move off with it as time passes, brightest just ahead of the kids and fading away behind them into the past.
    const stepP = niceStep(g.rowSize * Math.max(4, 100 / A));
    const STRIDE = 8;
    for (let p = Math.ceil(priceAt(ext.y1) / stepP) * stepP; p < priceAt(ext.y0); p += stepP) {
      const y = yOf(p);
      const text = fmt.price(p, Math.max(tickSize, stepP / 100));
      const shift = (Math.round(p / stepP) % 2) * (STRIDE / 2);
      for (let i = Math.floor((nowX + ext.x0 - shift) / STRIDE); i * STRIDE + shift - nowX < ext.x1; i++) {
        const x = i * STRIDE + shift - nowX;
        const a = clamp(1 + x / 7, 0, 1) * clamp(1 - (x - 4) / 8, 0, 1) * 0.55;
        if (a < 0.04 || Math.hypot(x, y - y0) < 2.4) continue;
        if (yf !== null && Math.abs(S(x, y).y - S(cloudX, yf, CLOUD_Z).y) < 1.6 * A && Math.abs(S(x, y).x - S(cloudX, yf).x) < 2.4 * A) continue;
        marking(text, x, y - 0.1, 0.4, `rgba(214, 224, 255, ${a})`, { align: "center", glow: true });
      }
    }

    // A fill: a puff of dust where the hand was, in the candle they're in.
    for (const b of blasts) {
      const y = Math.round(worldY(b.p) * 2) / 2 - g.cy + R / 2;
      const t = clamp((now - b.at) / 900, 0, 1);
      const q = S(col + 0.5 - nowX, y, 6);
      if (!seen(q)) continue;
      for (let i = 0; i < 5; i++) oval(ctx, q.x + Math.cos(i * 1.3) * 10 * t, q.y + Math.sin(i * 1.3) * 5 * t - 6 * t, 4 + 6 * t, 3 + 4 * t, css(CLAY.haze, 0.8 * (1 - t)));
    }
    labels.forEach((fn) => fn());
    // The price, marked on the ground just south of the kids' feet.
    marking(fmt.price(target, tickSize), 0, y0 + 1.05, 0.46, COLORS.volt, { align: "center" });

    // The clock, laid along the line of time the kids stand on, down in the field's south west corner: to the start in the lobby, then
    // to the next round, then to the bell.
    const nextAt = now < span.from ? span.from : (rounds.find((r) => r.at > now)?.at ?? span.to);
    const left = nextAt - now;
    if (now < span.to && !(now < span.from && left <= 10_000)) {
      const lobby = now < span.from;
      const xl = -0.5;
      const yl = Math.min(xl + (v.OX - 28) / A, (2 * (v.h - 28 - v.OY)) / A - xl);
      const hurry = !lobby && nextAt === span.to && left < 10_000;
      const big = lobby ? 1.25 : 0.95;
      const color = hurry && Math.floor(at / 250) % 2 ? COLORS.down : COLORS.volt;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.setLineDash([6, 8]);
      ctx.strokeStyle = "rgba(255, 225, 74, 0.22)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(S(0, ext.y1).x, S(0, ext.y1).y);
      ctx.lineTo(S(0, y0 + 1.5).x, S(0, y0 + 1.5).y);
      ctx.stroke();
      ctx.restore();
      marking(fmt.clock(left), xl, yl, big, color, { up: true, weight: 400 });
    }

    const hovered = hover.current ? priceUnder(hover.current.x, hover.current.y) : null;
    const picked = hovered !== null && pick ? pick(hovered) : null;
    // What a click here would put on the field, shown faintly where it would go.
    if (picked) {
      const p = picked.p;
      const y = yOf(p);
      if (picked.art === "cloud") drawCloud(cloudAt(y), y, 0.5);
      else if (picked.art) for (const [j, at0] of row(picked.art.count).entries()) blit(ctx, graveSprite(A, picked.art.side, j, scale * 1.5), S(at0.x, y + at0.dy * 0.8), 0.5);
      const box = wrap.current!.getBoundingClientRect();
      const hx = hover.current!.x - box.left;
      const hy = hover.current!.y - box.top;
      const xc = ((hx - v.OX) / A + (2 * (hy - v.OY)) / A) / 2;
      if (aiming.current) oval(ctx, hx, hy, 16, 16, undefined, picked.color, 2);
      marking(`${picked.label.toUpperCase()}  ${fmt.price(p, tickSize)}`.trim(), xc, y + (aiming.current ? -1.1 : 0.62), 0.32, picked.color, { align: "center" });
    }
    if (wrap.current) wrap.current.style.cursor = picked ? "crosshair" : "";
  }

  useEffect(() => {
    const el = wrap.current!;
    const resize = () => {
      const c = canvas.current;
      if (!c) return;
      const { width, height } = el.getBoundingClientRect();
      c.width = Math.round(width * devicePixelRatio);
      c.height = Math.round(height * devicePixelRatio);
      // The kids in the middle of the view, the past running off to the west and the future's haze to the east; on a narrow screen
      // more of the past goes, so the kids stay big.
      const span = P + F + R;
      const A = clamp(Math.min((width - 24) / (F + R + P * (width < 600 ? 0.25 : 0.45)), (height - 40) / (span / 2 + 1.4)), 8, 44);
      view.current = { w: width, h: height, A, OX: width / 2 + (R / 2) * A, OY: height / 2 - (R / 4) * A + 0.4 * A };
    };
    const css = getComputedStyle(document.documentElement);
    MONO = css.getPropertyValue("--mono") || MONO;
    DISPLAY = css.getPropertyValue("--display") || DISPLAY;
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    let frame = 0;
    const loop = () => {
      if (!document.hidden) draw();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const place = (clientX: number, clientY: number) => {
    const p = priceUnder(clientX, clientY);
    const { pick, onPick } = latest.current;
    const picked = p !== null && pick?.(p);
    if (picked && onPick) onPick(picked.p);
  };

  return (
    <div
      className="chart"
      ref={wrap}
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") return;
        aiming.current = true;
        tapped.current = true;
        hover.current = { x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse" && !aiming.current) return;
        hover.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        if (e.pointerType === "mouse" || !aiming.current) return;
        aiming.current = false;
        hover.current = null;
        place(e.clientX, e.clientY);
      }}
      onPointerCancel={() => {
        aiming.current = false;
        hover.current = null;
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") hover.current = null;
      }}
      onClick={(e) => {
        if (tapped.current) {
          tapped.current = false;
          return;
        }
        place(e.clientX, e.clientY);
      }}
    >
      <canvas ref={canvas} role="img" aria-label="The field: the frightened kids with the lantern, heading east, are the price, north is up" />
    </div>
  );
}
