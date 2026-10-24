"use client";

import { useEffect, useRef } from "react";
import * as fmt from "@/lib/format";
import { play } from "@/lib/sfx";
import type { Role, Side } from "@/lib/game/war";
import type { Candle } from "@/lib/types";
import { COLORS, niceStep, type Mark, type Pick, type Pin } from "./marks";
import { ANGLES, KIDS_LEAD, kidsTorch, paintCloud, paintKids, paintSpook, paintZombie, type Figure, type GhostKind } from "./clay";
import { GHOST_KIND } from "./Spirit";
import { paintTree } from "./trees";

// What of yours is on the field: ghosts lying in wait, ghosts on the kids, your thundercloud, where giving up starts to pay.
export type Yours = {
  trap?: { side: Side; price: number; at: number; power: number; count: number; ahead?: number };
  call?: { side: Side; entry: number; at: number; power: number; count: number; maker: boolean; koAt: number; move: number };
  flag?: { price: number; banks?: number; ahead?: number };
  // How your last call ended, and when: at your thundercloud, busted, or given up at the market.
  end?: { by: "cloud" | "bust" | "hand"; at: number };
};

type Props = {
  candles: Candle[];
  intervalMs: number;
  mark: number | null;
  tickSize: number;
  reach: number;
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

// Where the ground came from: where you got in, and where you got out, with the call's price and ghosts for a bust.
type Past = { at: number; price: number; side: Side; kind: "in" | "taken" | "out" | "bust"; entry?: number; count?: number };
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
const PUDDLE_RIM = css(times(MUD, 0.66));
const PUDDLE_WATER = css(PUDDLE, 0.7);
const PUDDLE_SHINE = css(pole(PUDDLE, 0.4), 0.6);
const FOOTPRINT = css(times(MUD, 0.8), 0.6);
const RAIN = 0.8;

let motion: MediaQueryList | null = null;
const reduced = () => {
  if (!motion && typeof matchMedia !== "undefined") motion = matchMedia("(prefers-reduced-motion: reduce)");
  return motion?.matches ?? false;
};
// The field is drawn at most twice over on a screen with finer pixels than that, one and a half on a narrow one: past that
// a phone fills pixels nobody can tell apart.
let DPR = 1;
const ratioFor = (width: number) => Math.min(typeof devicePixelRatio === "number" && devicePixelRatio > 0 ? devicePixelRatio : 1, width < 600 ? 1.5 : 2);
let pointer: MediaQueryList | null = null;
const coarse = () => {
  if (!pointer && typeof matchMedia !== "undefined") pointer = matchMedia("(pointer: coarse)");
  return pointer?.matches ?? false;
};
// A cache that drops what was used longest ago once it's full.
function kept<T>(cache: Map<string, T>, key: string, max: number, make: () => T): T {
  const was = cache.get(key);
  if (was !== undefined) {
    cache.delete(key);
    cache.set(key, was);
    return was;
  }
  const made = make();
  cache.set(key, made);
  if (cache.size > max) cache.delete(cache.keys().next().value!);
  return made;
}
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
  const dpr = DPR;
  return kept(sprites, `${key}|${dpr}`, 600, () => {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(w * dpr));
    c.height = Math.max(1, Math.ceil(h * dpr));
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    g.translate(ox, oy);
    paint(g);
    return { c, ox, oy, w, h };
  });
}
const blit = (ctx: Ctx, s: Sprite, p: Pt, alpha = 1) => {
  ctx.globalAlpha = alpha;
  ctx.drawImage(s.c, p.x - s.ox, p.y - s.oy, s.w, s.h);
  ctx.globalAlpha = 1;
};
const STRIDES = 8;

// A word set once in its face, colour and size and kept as a picture, with where its baseline and start fall in it.
const GLOW = /^rgba\((\d+, \d+, \d+), ([\d.e-]+)\)$/;
const words = new Map<string, { c: HTMLCanvasElement; w: number; h: number; asc: number; left: number; width: number }>();
function wordOf(text: string, font: string, color: string, scale: number) {
  return kept(words, `${text}|${font}|${color}|${scale}`, 240, () => {
    const c = document.createElement("canvas");
    const g = c.getContext("2d")!;
    g.font = font;
    const m = g.measureText(text);
    const asc = Math.ceil(m.actualBoundingBoxAscent) + 2;
    const left = Math.ceil(m.actualBoundingBoxLeft) + 2;
    const w = left + Math.ceil(m.actualBoundingBoxRight) + 2;
    const h = asc + Math.ceil(m.actualBoundingBoxDescent) + 2;
    c.width = Math.max(1, Math.ceil(w * scale));
    c.height = Math.max(1, Math.ceil(h * scale));
    g.scale(c.width / w, c.height / h);
    g.font = font;
    g.textBaseline = "alphabetic";
    g.fillStyle = color;
    g.fillText(text, left, asc);
    return { c, w, h, asc, left, width: m.width };
  });
}

// Each market's mark, laid crisp and dark over a soft pool of warm light: solid in the middle, where the mark sits, feathering out
// to nothing at the rim. The coin's own symbol where there is one, its letters where there isn't.
const SIGNAL = 256;
const SOLID = 0.62;
// How many tiles across the signal lies on the ground, and how many motes drift down the beam to it.
const SIGNAL_TILES = 2.2;
const MOTES = 16;
const INKED = "rgb(26, 20, 34)";
const COINS = new Set(["ada", "bnb", "btc", "doge", "eth", "sol", "xrp", "zec"]);
const signals = new Map<string, { pool: HTMLCanvasElement; mark: HTMLCanvasElement }>();
function signalOf(coin: string) {
  const kept = signals.get(coin);
  if (kept) return kept;
  const r = SIGNAL / 2;
  const pool = document.createElement("canvas");
  pool.width = pool.height = SIGNAL;
  const pg = pool.getContext("2d")!;
  const light = pg.createRadialGradient(r, r, 0, r, r, r);
  light.addColorStop(0, "rgba(255, 214, 150, 1)");
  light.addColorStop(SOLID, "rgba(255, 206, 140, 1)");
  light.addColorStop(SOLID + (1 - SOLID) * 0.45, "rgba(255, 206, 140, 0.45)");
  light.addColorStop(1, "rgba(255, 206, 140, 0)");
  pg.fillStyle = light;
  pg.fillRect(0, 0, SIGNAL, SIGNAL);
  const mark = document.createElement("canvas");
  mark.width = mark.height = SIGNAL;
  const mg = mark.getContext("2d")!;
  mg.fillStyle = INKED;
  mg.font = `${SIGNAL * SOLID * (coin.length > 4 ? 0.3 : coin.length > 3 ? 0.4 : 0.5)}px ${DISPLAY}`;
  mg.textAlign = "center";
  mg.textBaseline = "middle";
  mg.fillText(coin, r, r + SIGNAL * 0.02);
  const made = { pool, mark };
  signals.set(coin, made);
  if (!COINS.has(coin.toLowerCase())) return made;
  const img = new Image();
  img.onload = () => {
    // The symbol alone: a whole coin with the coin's picture taken away leaves just the holes the symbol makes in it.
    const cut = document.createElement("canvas");
    cut.width = cut.height = SIGNAL;
    const cg = cut.getContext("2d")!;
    cg.beginPath();
    cg.arc(r, r, r - 1, 0, Math.PI * 2);
    cg.fill();
    cg.globalCompositeOperation = "destination-out";
    cg.drawImage(img, 0, 0, SIGNAL, SIGNAL);
    cg.globalCompositeOperation = "source-in";
    cg.fillStyle = INKED;
    cg.fillRect(0, 0, SIGNAL, SIGNAL);
    mg.clearRect(0, 0, SIGNAL, SIGNAL);
    const s = SIGNAL * SOLID;
    mg.drawImage(cut, r - s / 2, r - s / 2, s, s);
  };
  img.src = `/coins/${coin.toLowerCase()}.svg`;
  return made;
}

// Ectoplasm round the rim of the view: two sheets of glowing teal noise laid on the ground plane at a height, drifting across the map
// against each other, kept out at the rim and added over the dusk, so the edges brighten and tint instead of greying. Each sheet tiles
// every `scale` tiles; the glow starts ECTO_FROM out from the middle of the view (0 the middle, about 0.7 the corners) and comes in
// over ECTO_IN.
const ECTO_TEX = 256;
const ECTO_FROM = 0.43;
const ECTO_IN = 0.24;
const ECTO = [
  { streaky: true, rgb: [70, 232, 214], alpha: 0.26, scale: 8, drift: [-0.3, 0.12], z: 0.6 },
  { streaky: false, rgb: [56, 186, 171], alpha: 0.21, scale: 6, drift: [0.2, -0.1], z: 0.2 },
] as const;
const smooth01 = (u: number) => {
  const c = clamp(u, 0, 1);
  return c * c * (3 - 2 * c);
};
// A tiling sheet of noise in a colour, its strength the alpha: `px` cells a repeat across and `py` down, streaky where they differ.
function ectoNoise(px: number, py: number, octaves: number, floor: number, gain: number, rgb: readonly number[]) {
  const c = document.createElement("canvas");
  c.width = c.height = ECTO_TEX;
  const g = c.getContext("2d")!;
  const img = g.createImageData(ECTO_TEX, ECTO_TEX);
  const cell = (x: number, y: number, p: number, q: number, o: number) => hash((((x % p) + p) % p) * 57.3 + (((y % q) + q) % q) * 131.7 + o * 17.1);
  const noise = (u: number, v: number, p: number, q: number, o: number) => {
    const xi = Math.floor(u);
    const yi = Math.floor(v);
    const sx = smooth01(u - xi);
    const sy = smooth01(v - yi);
    return lerp(lerp(cell(xi, yi, p, q, o), cell(xi + 1, yi, p, q, o), sx), lerp(cell(xi, yi + 1, p, q, o), cell(xi + 1, yi + 1, p, q, o), sx), sy);
  };
  for (let y = 0; y < ECTO_TEX; y++) {
    for (let x = 0; x < ECTO_TEX; x++) {
      let n = 0;
      let amp = 0.5;
      let sum = 0;
      for (let o = 0; o < octaves; o++) {
        n += noise((x / ECTO_TEX) * (px << o), (y / ECTO_TEX) * (py << o), px << o, py << o, o) * amp;
        sum += amp;
        amp *= 0.5;
      }
      img.data.set([rgb[0], rgb[1], rgb[2], Math.round(smooth01((n / sum - floor) * gain) * 255)], (y * ECTO_TEX + x) * 4);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}
// Made once, between frames, the first time it's wanted; it comes in over a second from when it's ready.
let ectoSheets: HTMLCanvasElement[] | null = null;
let ectoAsked = false;
let ectoBorn = 0;

// A lightning bolt in the field's own space, from a point in the sky to one on the ground, positions in tiles with z up: it wanders
// and forks every way in three dimensions, so its spindles reach out toward and away from the viewer as well as across, and where it
// lands, sparks crawl off along the ground. Seen through the field's view by see.
type P3 = { x: number; y: number; z: number };
// Each bolt's shape is worked out once, from where it lands, and kept for the moment it flickers.
const bolted = new Map<string, { pts: P3[]; w: number }[]>();
function lightning3d(ctx: Ctx, a: P3, b: P3, seed: number, size: number, see: (p: P3) => Pt, alpha = 1) {
  const shape = kept(bolted, `${seed}`, 48, () => boltShape({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }, seed));
  const paths = shape.map(({ pts, w }) => ({ pts: pts.map((p) => see({ x: p.x + b.x, y: p.y + b.y, z: p.z + b.z })), w }));
  glowing(ctx, paths, size, alpha);
}

function boltShape(a: P3, seed: number) {
  const b: P3 = { x: 0, y: 0, z: 0 };
  const paths: { pts: P3[]; w: number }[] = [];
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
    paths.push({ pts, w });
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
  return paths;
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

// A soft round of light or shade, made once for each colour and size and stretched to fit: light fades out to nothing at its
// edge, shade to its own colour gone clear.
const halos = new Map<string, HTMLCanvasElement>();
function halo(rgb: string, r: number, light: boolean) {
  const size = clamp(2 ** Math.ceil(Math.log2(Math.max(1, r * DPR))), 8, 128);
  return kept(halos, `${rgb}|${size}|${light ? 1 : 0}`, 160, () => {
    const c = document.createElement("canvas");
    c.width = c.height = size * 2;
    const g = c.getContext("2d")!;
    const fall = g.createRadialGradient(size, size, 0, size, size, size);
    fall.addColorStop(0, `rgba(${rgb}, 1)`);
    fall.addColorStop(1, light ? "rgba(0, 0, 0, 0)" : `rgba(${rgb}, 0)`);
    g.fillStyle = fall;
    g.fillRect(0, 0, size * 2, size * 2);
    return c;
  });
}
const rgbOf = (c: RGB) => `${Math.round(clamp(c[0], 0, 248))}, ${Math.round(clamp(c[1], 0, 248))}, ${Math.round(clamp(c[2], 0, 248))}`;
type Glow = { p: Pt; r: number; rgb: string; a: number };
function shine(ctx: Ctx, x: number, y: number, rx: number, ry: number, rgb: string, alpha: number, light: boolean) {
  if (!(alpha > 0) || !(rx > 0) || !(ry > 0)) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(halo(rgb, Math.max(rx, ry), light), x - rx, y - ry, rx * 2, ry * 2);
  ctx.globalAlpha = 1;
}

// A soft round shadow or glow on the ground, fading out to its edge.
const blob = (ctx: Ctx, x: number, y: number, rx: number, ry: number, color: RGB, alpha: number) => shine(ctx, x, y, rx, ry, rgbOf(color), alpha, false);

// The clay figures, each look, size and frame made once and kept, up to a budget of memory, the least lately used going first.
const figures = new Map<string, Figure>();
let figureBytes = 0;
const bytesOf = (f: Figure) => f.canvas.width * f.canvas.height * 4;
const budget = () => (typeof window !== "undefined" && (innerWidth < 600 || matchMedia("(pointer: coarse)").matches) ? 24e6 : 64e6);
function figure(key: string, make: () => Figure): Figure {
  const was = figures.get(key);
  if (was) {
    figures.delete(key);
    figures.set(key, was);
    return was;
  }
  const made = make();
  figures.set(key, made);
  figureBytes += bytesOf(made);
  for (const [k, f] of figures) {
    if (figureBytes <= budget() || figures.size <= 1) break;
    figures.delete(k);
    figureBytes -= bytesOf(f);
  }
  return made;
}
// Your own ghosts are mint either way; rivals' come in hues of their own.
const GHOSTS: Record<Side, RGB> = { long: [124, 232, 192], short: [124, 232, 192] };
const FIELD_SIZE: Record<GhostKind, number> = { wisp: 0.95, spectre: 1.1, poltergeist: 1.3 };
const FRAMES = 8;
// The kids walk a step behind the price, so their torch's beam reaches out to the coin's signal on the price itself.
const KIDS_BACK = (KIDS_LEAD * 2.05) / 26;
// The forest: only in bands far to the north and south, the field open FOREST_OPEN rows either side of the price all the way
// across, ahead for the play and behind for the trail the price has walked. How likely a patch of ground is to hold something,
// from how many rows south of the price it is (ry), its edge feathered over FOREST_EDGE.
const FOREST = 0.42;
const FOREST_OPEN = 6.5;
const FOREST_EDGE = 0.8;
function forest(ry: number) {
  const u = clamp((Math.abs(ry) - FOREST_OPEN) / FOREST_EDGE, 0, 1);
  return FOREST * u * u * (3 - 2 * u);
}
// A tree standing in front of the play, on the screen, turns this see-through.
const SEE_THROUGH = 0.25;
// Words on the ground, bigger than they'd be drawn at the field's scale alone, so they stay easy to read.
const WORDS = 1.45;
// Every word on the field is set at one size, in tiles tall; the prices you've set sit a little see-through.
const WORD = 0.4;
const SET = 0.72;

const stormAt = (px: number) => figure(`storm|${px}`, () => paintCloud(px));
const treeAt = (px: number, variant: number) => figure(`tree|${px}|${variant}`, () => paintTree(px, variant));
// The kids turn as they climb and drop: sixteen steps across the half turn from north through east to south, plus straight east.
const KID_TURNS = 16;
const kidTurn = (i: number) => (i / KID_TURNS - 0.5) * Math.PI;
const kidPose = (turn: number) => Math.round((turn / Math.PI + 0.5) * KID_TURNS);
// They face where the price is going before they walk there (the coin's signal goes on ahead with the price, and the torch's beam
// swings after it), and step off once they're mostly round, quicker the further round they are. A move smaller than a tick's noise doesn't turn them.
// East is their way: they turn back to it as soon as they've caught the price, past only the gaps between the ticks of a steady
// climb or fall (under TURN_BRIDGE ms), so a run of ticks doesn't flick them back and forth.
const TURN_NOISE = 0.12;
const TURN_STEP = 500;
const TURN_BRIDGE = 150;
const BODY_TURN = { ease: 70, rate: 720 };
const WALK_ROUND = Math.PI / 4;
// A turn eased toward an angle over a frame of dt ms, but never faster than rate degrees a second.
const turnTo = (from: number, to: number, dt: number, { ease, rate }: { ease: number; rate: number }) => {
  const most = (rate * Math.PI * dt) / 180_000;
  return from + clamp((to - from) * (1 - Math.exp(-dt / ease)), -most, most);
};
const kidsKey = (px: number, stride: number, turn: number) => `kids|${px}|${stride}|${turn}`;
const kidsAt = (px: number, stride: number, turn = KID_TURNS / 2) => figure(kidsKey(px, stride, turn), () => paintKids(px, stride, STRIDES, kidTurn(turn)));
const bonesAt = (px: number, stride: number, turn: number) => figure(`bones|${px}|${stride}|${turn}`, () => paintKids(px, stride, STRIDES, kidTurn(turn), true));
const ghostKey = (kind: GhostKind, body: RGB, px: number, frame: number, boo: boolean, turn: number) => `ghost|${kind}|${body}|${px}|${frame}|${boo ? 1 : 0}|${turn}`;
const ghostAt = (kind: GhostKind, body: RGB, px: number, frame: number, boo: boolean, turn = 0) =>
  figure(ghostKey(kind, body, px, frame, boo, turn), () => paintSpook(kind, body, px, frame, FRAMES, boo, turn));

// Figures wanted soon are made in the browser's quiet moments between frames, a few at a time, never inside one.
const toBake = new Map<string, () => Figure>();
let baking = false;
const idle = (fn: (d?: IdleDeadline) => void) => (typeof requestIdleCallback === "function" ? requestIdleCallback(fn, { timeout: 400 }) : setTimeout(fn, 16));
function bake(d?: IdleDeadline) {
  let one = !d || d.didTimeout;
  for (const [key, make] of toBake) {
    if (!one && (!d || d.timeRemaining() < 4)) break;
    one = false;
    toBake.delete(key);
    figure(key, make);
  }
  if (toBake.size) idle(bake);
  else baking = false;
}
function kidsSoon(px: number, turn: number) {
  for (let stride = 0; stride < STRIDES; stride++) {
    const key = kidsKey(px, stride, turn);
    if (figures.has(key) || toBake.has(key)) continue;
    toBake.set(key, () => paintKids(px, stride, STRIDES, kidTurn(turn)));
  }
  if (toBake.size && !baking) {
    baking = true;
    idle(bake);
  }
}
// While your thundercloud waits over a call, the kids' bones are made between frames for the way they face, ready for the strike.
function bonesSoon(px: number, turn: number) {
  for (let stride = 0; stride < STRIDES; stride++) {
    const key = `bones|${px}|${stride}|${turn}`;
    if (figures.has(key) || toBake.has(key)) continue;
    toBake.set(key, () => paintKids(px, stride, STRIDES, kidTurn(turn), true));
  }
  if (toBake.size && !baking) {
    baking = true;
    idle(bake);
  }
}
function ghostSoon(kind: GhostKind, body: RGB, px: number, frame: number, boo: boolean, turn: number) {
  const key = ghostKey(kind, body, px, frame, boo, turn);
  if (figures.has(key) || toBake.has(key)) return;
  toBake.set(key, () => paintSpook(kind, body, px, frame, FRAMES, boo, turn));
  if (!baking) {
    baking = true;
    idle(bake);
  }
}


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

// A gravestone in your line of graves: rounded grey clay, its face lit and its edge in shade, moss at the foot, cracked, and its side's arrow
// cut into it. Drawn from the middle of its foot.
function graveSprite(A: number, side: Side, variant: number, size: number, tint?: string) {
  const q = Math.round(A * size * 4) / 4;
  const v = variant % 4;
  const w = 0.19 * q;
  const h = (0.5 + 0.06 * (v % 2)) * q;
  const d = 0.07 * q;
  return sprite(`grave|${q}|${side}|${v}|${tint ?? ""}`, 2 * w + d + 14, h + d + 0.12 * q + 14, w + 7, h + d + 7, (g) => {
    const stone = tint ? mix(mix(CLAY.rock, [158, 156, 164], 0.5), hex(tint), 0.62) : mix(CLAY.rock, [158, 156, 164], 0.5);
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

// What dresses one tile of ground, worked out from where it is alone: whether a grove may stand there, and the tufts, flowers,
// ferns and stones scattered on it, with what each becomes on open ground and what in a grove.
type Look = [kind: number, variant: number];
type Tile = { i: number; j: number; roll: number; ox: number; pick: number; variant: number; items: { u: number; w: number; plain: Look | null; wild: Look | null }[] };
type Grove = { i: number; j: number; ox: number; pick: number; variant: number; on: boolean; roll: number };
type Deco = { u: number; w: number; tile: Grove | null; plain: Sprite | null; wild: Sprite | null };
const LOOKS = [tuftSprite, flowerSprite, fernSprite, cloverSprite, mushroomSprite, pebbleSprite];
function tileAt(i: number, j: number): Tile {
  const meadow = clamp((fbm(i / 7 + 11, j / 7 + 5) - 0.35) * 2.4, 0, 1);
  const flowers = 0.012 + 0.09 * meadow;
  const ferns = 0.006 + 0.014 * (1 - meadow);
  const items: Tile["items"] = [];
  for (let t = 0; t < 5; t++) {
    const roll = hash(i * 23 + j * 29 + t * 3);
    const v = Math.floor(hash(i * 7 + j * 3 + t * 11) * 12);
    const look = (tufts: number): Look | null =>
      roll < tufts
        ? [0, v % 6]
        : roll < 0.13 + flowers
          ? [1, v]
          : roll < 0.13 + flowers + ferns
            ? [2, v]
            : roll < 0.15 + flowers + ferns
              ? [3, v]
              : roll > 0.993 - 0.006 * (1 - meadow)
                ? [4, v]
                : roll > 0.982
                  ? [5, v % 8]
                  : null;
    const plain = look(0.13);
    const wild = look(0.5);
    if (plain || wild) items.push({ u: i + hash(i * 5 + j * 11 + t), w: j + hash(i * 13 + j * 7 + t), plain, wild });
  }
  // Whether something grows here is how this roll stands against the forest where the tile is (forest), so it's settled per tile.
  return { i, j, roll: hash(i * 17 + j * 131), ox: hash(i + j) * 0.7, pick: hash(i * 3 + j), variant: Math.floor(hash(i * 5 + j * 3) * 12), items };
}

// A box on the screen in device pixels; boxes that touch are joined, so each part of the screen is laid down once.
type Box = { x: number; y: number; w: number; h: number };
function merged(list: Box[], W: number, H: number): Box[] {
  const out: Box[] = [];
  for (const b0 of list) {
    const x = Math.max(0, Math.floor(b0.x));
    const y = Math.max(0, Math.floor(b0.y));
    let b = { x, y, w: Math.min(W, Math.ceil(b0.x + b0.w)) - x, h: Math.min(H, Math.ceil(b0.y + b0.h)) - y };
    if (b.w <= 0 || b.h <= 0) continue;
    for (let i = 0; i < out.length; i++) {
      const o = out[i];
      if (b.x <= o.x + o.w && b.x + b.w >= o.x && b.y <= o.y + o.h && b.y + b.h >= o.y) {
        const l = Math.min(b.x, o.x);
        const t = Math.min(b.y, o.y);
        b = { x: l, y: t, w: Math.max(b.x + b.w, o.x + o.w) - l, h: Math.max(b.y + b.h, o.y + o.h) - t };
        out.splice(i, 1);
        i = -1;
      }
    }
    out.push(b);
  }
  return out;
}

// What stands in front of the words on the ground: where it stands, how high it floats, how far it has risen out of the ground,
// and its picture.
type Shape = { c: HTMLCanvasElement; ox: number; oy: number; w: number; h: number };
type Caster = { x: number; y: number; z?: number; tall?: number; grove?: boolean; shape: () => Shape };
const shapeOf = (f: Figure, dpr: number): Shape => ({ c: f.canvas, ox: f.ox / dpr, oy: f.oy / dpr, w: f.w / dpr, h: f.h / dpr });
// A figure's shape in one flat colour, made once per picture: danger red laid over a ghost to flash it as a call goes wrong, and
// charred black for the kids as lightning goes through them.
const RED = "rgb(255, 60, 84)";
const CHARRED = "rgb(12, 10, 18)";
const tints = new Map<string, WeakMap<HTMLCanvasElement, HTMLCanvasElement>>();
function tintOf(c: HTMLCanvasElement, color: string) {
  let made = tints.get(color);
  if (!made) tints.set(color, (made = new WeakMap()));
  const was = made.get(c);
  if (was) return was;
  const r = document.createElement("canvas");
  r.width = c.width;
  r.height = c.height;
  const g = r.getContext("2d")!;
  g.drawImage(c, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color;
  g.fillRect(0, 0, r.width, r.height);
  made.set(c, r);
  return r;
}
// Struck by your thundercloud, the kids are electrocuted for ZAP_MS: they freeze and shake, flickering between themselves and their
// bones. Busted, your ghosts flare red and spin and swirl up off the field over BUST_MS.
const ZAP_MS = 1500;
const BUST_MS = 1600;

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
    // The kids electrocuted: since when, and the stride and way round they froze in.
    zap: { at: number; stride: number; pose: number } | null;
    // How far round the beat your ghosts flash red to has come, and when it was last moved on.
    beat: { phase: number; at: number };
    gait: { walked: number; y: number; price: number; at: number; aim: number; quiet: number; turn: number; pose: number; pace: number };
  }>({
    past: [],
    call: null,
    flag: null,
    summoned: new Map(),
    hands: new Map(),
    col: 0,
    struck: 0,
    zap: null,
    beat: { phase: 0, at: 0 },
    gait: { walked: 0, y: 0, price: 0, at: 0, aim: 0, quiet: 0, turn: 0, pose: KID_TURNS / 2, pace: 1 },
  });
  const grass = useRef<{ c: HTMLCanvasElement | null; x0: number; y0: number; w: number; h: number; n: number }>({ c: null, x0: 0, y0: 0, w: 0, h: 0, n: 0 });
  const painting = useRef<{ c: HTMLCanvasElement; x0: number; y0: number; w: number; h: number; img: ImageData; row: number } | null>(null);
  const tracks = useRef<{ key: string; from: number; ts: number[]; ws: number[] } | null>(null);
  const tiles = useRef(new Map<string, Tile>());
  // The ectoplasm's scratch canvas, the rim it's kept to and its sheets' patterns, made for the canvas's size.
  const ecto = useRef<{ key: string; buf: HTMLCanvasElement; mask: HTMLCanvasElement; patterns: CanvasPattern[] } | null>(null);
  const book = useRef<{ walls: Props["walls"] | null; usual: number; lines: { p: number; side: Side; orders: number[] }[] }>({ walls: null, usual: 1, lines: [] });
  const decor = useRef<{ key: string; groves: Grove[]; low: Deco[] }>({ key: "", groves: [], low: [] });
  // The grass darkened by the rain, kept for the sheet and how wet it is.
  const soaked = useRef<{ c: HTMLCanvasElement | null; n: number; level: number }>({ c: null, n: -1, level: -1 });
  const hover = useRef<Pt | null>(null);
  // How far into view each tall thing has faded, by its tile, so nothing pops in or out.
  const fades = useRef(new Map<string, number>());
  const seeThrough = useRef(new Map<string, number>());
  const fadeAt = useRef(0);
  // Where each rival is shown, gliding after where they really are when they move.
  const glides = useRef(new Map<string, number>());
  const appears = useRef(new Map<string, number>());
  const places = useRef(new Map<string, { x: number; dy: number }>());
  const writing = useRef<HTMLCanvasElement | null>(null);
  const asked = useRef("");
  const trodden = useRef({ key: "", seen: new Map<string, boolean>() });
  // The field's place on the page, read once and again only when the page moves or resizes; and the cursor last set.
  const placed = useRef<DOMRect | null>(null);
  const cursor = useRef("");
  const written = useRef<Box[]>([]);
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
  function onPage(): DOMRect | null {
    return (placed.current ??= wrap.current?.getBoundingClientRect() ?? null);
  }

  function priceUnder(clientX: number, clientY: number): number | null {
    const box = onPage();
    if (!box || !ground.current.rowSize) return null;
    if (clientX < box.left || clientX > box.right || clientY < box.top || clientY > box.bottom) return null;
    const { v, priceAt } = project();
    const u = (clientX - box.left - v.OX) / v.A;
    const w = (2 * (clientY - box.top - v.OY)) / v.A;
    return priceAt((w - u) / 2) + ground.current.lag;
  }

  // The grass, painted once onto a sheet of ground and moved with the field. Before the field walks off it the next sheet is
  // painted a few rows a frame, so no one frame pays for all of it.
  function grassSheet(nowX: number, cy: number, ext: { x0: number; x1: number; y0: number; y1: number }) {
    const D = 5;
    const top = cy - R / 2;
    const fits = (s: { x0: number; y0: number; w: number; h: number } | null, pad: number) =>
      !!s && nowX + ext.x0 - pad >= s.x0 && nowX + ext.x1 + pad <= s.x0 + s.w && top + ext.y0 - pad >= s.y0 && top + ext.y1 + pad <= s.y0 + s.h;
    const sheet = grass.current;
    const start = () => {
      const x0 = Math.floor(nowX + ext.x0 - 6);
      const y0 = Math.floor(top + ext.y0 - 10);
      const w = Math.ceil(ext.x1 - ext.x0) + 60;
      const h = Math.ceil(ext.y1 - ext.y0) + 20;
      const c = document.createElement("canvas");
      c.width = w * D;
      c.height = h * D;
      const img = new ImageData(c.width, c.height);
      return { c, x0, y0, w, h, img, row: 0 };
    };
    const paint = (s: NonNullable<typeof painting.current>, until: number) => {
      const W = s.c.width;
      const data = s.img.data;
      while (s.row < s.c.height && performance.now() < until) {
        const v = s.row++;
        const wy = s.y0 + v / D;
        for (let u = 0; u < W; u++) {
          const wx = s.x0 + u / D;
          const f = (fbm(wx / 2.25, wy / 2.25) - 0.5) * 0.3 + (fbm(wx / 0.56 + 40, wy / 0.56 + 40) - 0.5) * 0.105;
          const col = pole(CLAY.grass, f);
          const i = (v * W + u) * 4;
          data[i] = col[0];
          data[i + 1] = col[1];
          data[i + 2] = col[2];
          data[i + 3] = 255;
        }
      }
      return s.row >= s.c.height;
    };
    const swap = (s: NonNullable<typeof painting.current>) => {
      s.c.getContext("2d")!.putImageData(s.img, 0, 0);
      grass.current = { c: s.c, x0: s.x0, y0: s.y0, w: s.w, h: s.h, n: sheet.n + 1 };
      painting.current = null;
      return grass.current;
    };
    if (sheet.c && fits(sheet, 2)) {
      if (!fits(sheet, 6)) {
        if (!painting.current || !fits(painting.current, 6)) painting.current = start();
        if (paint(painting.current, performance.now() + 2)) return swap(painting.current);
      }
      return sheet;
    }
    const next = painting.current && fits(painting.current, 2) ? painting.current : start();
    paint(next, Infinity);
    return swap(next);
  }

  // The ground's dressing for the tiles in view, laid back to front: worked out again only when the view takes in other tiles or
  // changes scale, each tile's own dressing kept while it stays near the view.
  function groundFor(i0: number, i1: number, j0: number, j1: number, A: number, dpr: number) {
    const key = `${i0}|${i1}|${j0}|${j1}|${A}|${dpr}`;
    if (decor.current.key === key) return decor.current;
    const known = tiles.current;
    for (const [id, t] of known) if (t.i < i0 - 4 || t.i > i1 + 4 || t.j < j0 - 4 || t.j > j1 + 4) known.delete(id);
    const groves: Grove[] = [];
    const low: Deco[] = [];
    const art = (l: Look | null) => (l ? LOOKS[l[0]](A, l[1]) : null);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const id = `${i},${j}`;
        let t = known.get(id);
        if (!t) {
          t = tileAt(i, j);
          known.set(id, t);
        }
        const grove = t.roll < FOREST ? { i, j, ox: t.ox, pick: t.pick, variant: t.variant, on: false, roll: t.roll } : null;
        if (grove) groves.push(grove);
        for (const it of t.items) low.push({ u: it.u, w: it.w, tile: grove, plain: art(it.plain), wild: art(it.wild) });
      }
    }
    low.sort((p, q) => p.u + p.w - (q.u + q.w));
    decor.current = { key, groves, low };
    return decor.current;
  }

  function draw() {
    const c = canvas.current;
    if (!c || !view.current.w) return;
    let ctx = c.getContext("2d")!;
    const field = ctx;
    // Where each word went on the screen this frame, and each cloud, so the words can be cut and laid down only where they are.
    const boxes: Box[] = [];
    const veils: { c: HTMLCanvasElement; x: number; y: number; w: number; h: number }[] = [];
    const { candles, intervalMs, mark, tickSize, reach, yours, role, walls = [], blasts = [], marks, pins = [], pick, coin } = latest.current;
    const kind = GHOST_KIND[role];
    // On the field the stakes' sizes are closer together than in the portraits, so even a wisp stands out.
    const scale = FIELD_SIZE[kind];
    const v = view.current;
    const g = ground.current;
    const dpr = DPR;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const last = candles[candles.length - 1];
    const target = mark ?? last?.c;
    // The sky only shows until there's a price: then the ground covers the whole view.
    if (target === undefined || !last) {
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
      memory.current.gait.price = target;
    }
    g.shown = reduced() ? target : g.shown + (target - g.shown) * (1 - Math.exp(-Math.min(at - g.at, 50) / 110));
    // The kids carry the price, but they turn to face a move before they make it: their own row waits on how far round they are,
    // while the price's trail and the coin's signal on the end of it go on ahead.
    const gait = memory.current.gait;
    gait.price = reduced() ? target : gait.price + (target - gait.price) * (1 - Math.exp(-(Math.min(at - g.at, 50) * gait.pace) / 110));
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
    const ky = yOf(gait.price);
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
      // How it ended, from the game's own word on it when that's for this call, or else from whether the kids were at the cloud.
      const by = yours.end && yours.end.at >= m.call.at ? yours.end.by : null;
      const near = m.flag !== null && Math.abs(live - m.flag) <= Math.max(g.rowSize, tickSize * 3);
      const kind = by === "bust" ? "bust" : m.flag !== null && (by === "cloud" || (!by && near)) ? "taken" : "out";
      m.past.push({ at: now, price: kind === "taken" ? m.flag! : live, side: m.call.side, kind, entry: m.call.entry, count: m.call.count });
      if (kind === "taken") m.zap = { at: now, stride: -1, pose: -1 };
    }
    m.call = yours.call ?? null;
    m.flag = yours.flag?.price ?? null;
    m.past = m.past.filter((p) => X(p.at) > -P - 2);
    // It rains the whole night through, and the only lightning is your thundercloud's.
    const wet = reduced() ? 0 : RAIN;
    for (const key of m.summoned.keys()) if (key !== m.flag) m.summoned.delete(key);
    // How far your call has gone wrong: how far from your ghosts to the bust the kids have come, 0 at your entry and 1 at the bust.
    // Past half way your ghosts flash red, to a beat that quickens from once a second to twice as the bust nears, and the edge of
    // the view the bust lies past glows red; short of it, nothing.
    let hurt = 0;
    if (yours.call) {
      const c = yours.call;
      const wrong = c.side === "long" ? c.entry - live : live - c.entry;
      hurt = clamp(wrong / (Math.abs(c.entry - c.koAt) || 1), 0, 1);
    }
    const danger = clamp((hurt - 0.5) / 0.5, 0, 1);
    const alarm = smooth01((hurt - 0.5) / 0.04) * (0.55 + 0.45 * danger);
    m.beat.phase = (m.beat.phase + (Math.min(at - (m.beat.at || at), 100) / 1000) * Math.PI * 2 * (1 + danger)) % (Math.PI * 2);
    m.beat.at = at;
    const pulse = reduced() ? 0.6 : 0.5 + 0.5 * Math.sin(m.beat.phase);

    // The ground: one sheet of clay grass, moved with the field.
    const sheet = grassSheet(nowX, g.cy, ext);
    const D = 5;
    // In the rain the grass darkens: the sheet is darkened once for each step of wetness rather than the whole view every frame.
    let lawn = sheet.c!;
    if (wet > 0.01) {
      const level = Math.max(1, Math.round(wet * 64));
      const s = soaked.current;
      if (!s.c || s.n !== sheet.n || s.level !== level) {
        const c2 = s.c ?? document.createElement("canvas");
        if (c2.width !== lawn.width || c2.height !== lawn.height) {
          c2.width = lawn.width;
          c2.height = lawn.height;
        }
        const gs = c2.getContext("2d")!;
        gs.globalCompositeOperation = "copy";
        gs.drawImage(lawn, 0, 0);
        gs.globalCompositeOperation = "source-over";
        gs.fillStyle = `rgba(46, 58, 84, ${(0.2 * level) / 64})`;
        gs.fillRect(0, 0, c2.width, c2.height);
        soaked.current = { c: c2, n: sheet.n, level };
      }
      lawn = soaked.current.c!;
    }
    ctx.save();
    const ex = v.OX + (sheet.x0 - nowX - sheet.y0 + g.cy - R / 2) * A;
    const ey = v.OY + ((sheet.x0 - nowX + sheet.y0 - g.cy + R / 2) * A) / 2;
    ctx.setTransform((dpr * A) / D, (dpr * A) / (2 * D), (-dpr * A) / D, (dpr * A) / (2 * D), dpr * ex, dpr * ey);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(lawn, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // The trail: everywhere they've been, trodden into a muddy path that is the chart, with puddles in it and footprints along it.
    const stepT = intervalMs / 16;
    const from = Math.ceil(Math.max(first, now + (ext.x0 - 1) * intervalMs) / stepT) * stepT;
    // Where they were through the candles already closed doesn't change, so it's kept until the next candle opens.
    const open = last.t;
    const tk = `${intervalMs}|${g.rowSize}|${g.ref}|${first}|${open}|${candles.length}`;
    let tr = tracks.current;
    if (!tr || tr.key !== tk || tr.from > from) {
      const ts: number[] = [];
      const ws: number[] = [];
      for (let t = from; t < open; t += stepT) {
        const p = where(t);
        if (p !== null) {
          ts.push(t);
          ws.push(worldY(p));
        }
      }
      tr = tracks.current = { key: tk, from, ts, ws };
    }
    const trail: { t: number; q: Pt }[] = [];
    for (let n = 0; n < tr.ts.length; n++) if (tr.ts[n] >= from - stepT * 0.5) trail.push({ t: tr.ts[n], q: S(X(tr.ts[n]), tr.ws[n] - g.cy + R / 2) });
    for (let t = trail.length ? trail[trail.length - 1].t + stepT : from; t < now; t += stepT) {
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
    // Footprints in one stroke of the brush between puddles, so each puddle still lies over the prints before it and under those after.
    let prints = 0;
    const stamp = () => {
      if (!prints) return;
      ctx.fillStyle = FOOTPRINT;
      ctx.fill();
      prints = 0;
    };
    for (let n = 0; n < trail.length - 1; n++) {
      const { t, q } = trail[n];
      const step = Math.round(t / stepT);
      const h = hash(step * 3.7);
      if (h < 0.035 + 0.08 * wet) {
        stamp();
        const r = (0.07 + hash(step) * 0.08) * A;
        const lean = (hash(step * 1.9) - 0.5) * 0.12 * A;
        oval(ctx, q.x + lean, q.y + 0.02 * A, r * 2, r * 0.8, PUDDLE_RIM);
        oval(ctx, q.x + lean - r * 0.35, q.y + 0.01 * A, r * 1.25, r * 0.42, PUDDLE_WATER);
        oval(ctx, q.x + lean - r * 0.6, q.y, r * 0.4, r * 0.12, PUDDLE_SHINE);
      } else if (step % 2 === 0) {
        const side = step % 4 ? 1 : -1;
        const x = q.x + side * 0.05 * A;
        const y = q.y + side * 0.025 * A;
        if (!prints) ctx.beginPath();
        ctx.moveTo(x + 0.045 * A, y);
        ctx.ellipse(x, y, 0.045 * A, 0.022 * A, 0, 0, Math.PI * 2);
        prints++;
      }
    }
    stamp();

    // A line across the ground where you'd be busted, in red with a cross along it, the ground past it stained red and glowing
    // brighter to the beat the nearer the kids come; it glows through the dusk once that's down.
    let bustLine: { y: number; x0: number } | null = null;
    if (yours.call && onMap(yOf(yours.call.koAt))) {
      const yk = yOf(yours.call.koAt);
      const x0 = Math.max(X(yours.call.at), ext.x0);
      const beyond = yours.call.side === "long" ? ext.y1 + 1 : ext.y0 - 1;
      poly(ctx, [S(x0, yk), S(ext.x1, yk), S(ext.x1, beyond), S(x0, beyond)], `rgba(255, 60, 84, ${0.14 + 0.16 * pulse * (0.3 + hurt)})`);
      line(ctx, S(x0, yk), S(ext.x1, yk), "rgba(255, 77, 109, 0.95)", 2.6);
      for (let a = Math.ceil((nowX + x0) * 2) / 2; a < nowX + ext.x1; a += 0.5) {
        const q = S(a - nowX, yk, 2);
        line(ctx, { x: q.x - 3.5, y: q.y - 3.5 }, { x: q.x + 3.5, y: q.y + 3.5 }, "rgba(255, 77, 109, 0.95)", 1.6);
        line(ctx, { x: q.x - 3.5, y: q.y + 3.5 }, { x: q.x + 3.5, y: q.y - 3.5 }, "rgba(255, 77, 109, 0.95)", 1.6);
      }
      bustLine = { y: yk, x0 };
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
    const lights: Glow[] = [];
    // What stands tall, with the picture of it, so the words on the ground can be cut away behind it; and where lightning is lighting
    // the field this moment, for the flash.
    const casters: Caster[] = [];
    const glare: { x: number; y: number }[] = [];
    const i0 = Math.floor(nowX + ext.x0) - 1;
    const i1 = Math.ceil(nowX + ext.x1) + 1;
    const clear = [yours.trap?.price, yours.call?.entry, yours.flag?.price].filter((p): p is number => p !== undefined).map(yOf);
    const j0 = Math.floor(g.cy - R / 2 + ext.y0) - 1;
    const j1 = Math.ceil(g.cy - R / 2 + ext.y1) + 1;
    // Nothing grows on the trail.
    // Whether a spot lies on the trail. Where the trail has been is settled once its candle closes, so those answers are kept by
    // their place in the world until the scale changes.
    const settled = candles.length ? candles[candles.length - 1].t : 0;
    const scaleKey = `${g.rowSize}|${intervalMs}`;
    if (trodden.current.key !== scaleKey || trodden.current.seen.size > 6000) trodden.current = { key: scaleKey, seen: new Map() };
    const bare = (x: number, y: number) => {
      if (x > 0.15) return false;
      const t = now + x * intervalMs;
      const id = t < settled ? `${Math.round((x + nowX) * 64)}|${Math.round((y + g.cy) * 64)}` : null;
      const kept = id === null ? undefined : trodden.current.seen.get(id);
      if (kept !== undefined) return kept;
      const p = where(t);
      const on = p !== null && Math.abs(yOf(p) - y) < 0.24;
      if (id !== null) trodden.current.seen.set(id, on);
      return on;
    };
    // The set prices, all on one column: a tree that would stand over one of them fades off it, so they always read.
    const setRows = [y0 + 1.05, ...(yours.trap && !yours.call ? [yOf(yours.trap.price) + 0.95] : []), ...(yours.flag ? [yOf(yours.flag.price) + 0.95] : [])];
    const setBoxes = setRows.map((yl) => {
      const c = S(0, yl);
      return { x0: c.x - 2.4 * A, x1: c.x + 2.4 * A, y0: c.y - 0.8 * A, y1: c.y + 0.8 * A };
    });
    const overSet = (x: number, y: number) => {
      const b = S(x, y);
      return setBoxes.some((r) => b.x + 0.8 * A > r.x0 && b.x - 0.8 * A < r.x1 && b.y > r.y0 && b.y - 2.8 * A < r.y1);
    };
    const dec = groundFor(i0, i1, j0, j1, A, dpr);
    const fadeStep = clamp((at - fadeAt.current) / 320, 0, 1);
    fadeAt.current = at;
    if (fades.current.size > 6000) fades.current.clear();
    if (seeThrough.current.size > 3000) seeThrough.current.clear();
    // A tree standing in front of any of the play on the screen (a ghost, a grave, a hand or the kids behind it) eases see-through,
    // so the game is never hidden. Asked as each is drawn, once everything has said where it stands.
    let pieces: { d: number; x0: number; y0: number; x1: number; y1: number }[] | null = null;
    const veiled = (id: string, d: number, x0: number, y0: number, w: number, h: number) => {
      pieces ??= casters
        .filter((c) => !c.grove)
        .map((c) => {
          const sh = c.shape();
          const p = S(c.x, c.y, c.z ?? 0);
          return { d: c.x + c.y, x0: p.x - sh.ox, y0: p.y - sh.oy, x1: p.x - sh.ox + sh.w, y1: p.y - sh.oy + sh.h };
        });
      // (the foot of its trunk aside, which covers little)
      const over = pieces.some((b) => b.d < d && x0 < b.x1 && x0 + w > b.x0 && y0 < b.y1 && y0 + h * 0.85 > b.y0);
      const was = seeThrough.current.get(id) ?? 1;
      const veil = was + ((over ? SEE_THROUGH : 1) - was) * fadeStep;
      if (veil > 0.995) seeThrough.current.delete(id);
      else seeThrough.current.set(id, veil);
      return veil;
    };
    for (const tile of dec.groves) {
      tile.on = false;
      const x = tile.i - nowX + tile.ox;
      const y = tile.j + 0.5 - g.cy + R / 2;
      if (!seen(S(x, y), 2.6 * A)) continue;
      const id = `${tile.i}|${tile.j}`;
      const want = tile.roll < forest(y - y0) && clear.every((yc) => Math.abs(yc - y) > 1) && !bare(x, y) ? (overSet(x, y) ? 0.12 : 1) : 0;
      const was = fades.current.get(id) ?? 0;
      const shown = was + (want - was) * fadeStep;
      if (shown < 0.01 && want === 0) {
        fades.current.delete(id);
        continue;
      }
      fades.current.set(id, shown);
      tile.on = true;
      const faint = shown;
      const { pick, variant } = tile;
      if (pick < 0.62) {
        const size = variant === 10 ? 0.7 : variant % 3 === 0 ? 1.15 : 1;
        const f = treeAt(Math.round((A / 28) * (variant % 3 === 0 ? 1.15 : 1) * dpr * 10) / 10, variant);
        shadows.push(() => {
          const p = S(x, y);
          blob(ctx, p.x, p.y, 0.8 * A * size, 0.38 * A * size, [92, 108, 136], 0.6 * faint);
        });
        if (faint > 0.5) casters.push({ x, y, grove: true, shape: () => shapeOf(f, dpr) });
        put(x, y, () => {
          const p = S(x, y);
          ctx.globalAlpha = faint * veiled(id, x + y, p.x - f.ox / dpr, p.y - f.oy / dpr, f.w / dpr, f.h / dpr);
          ctx.drawImage(f.canvas, p.x - f.ox / dpr, p.y - f.oy / dpr, f.w / dpr, f.h / dpr);
          ctx.globalAlpha = 1;
        });
      } else if (pick < 0.74) {
        const sp = deadSprite(A, variant);
        shadows.push(() => {
          const p = S(x, y);
          blob(ctx, p.x, p.y, 0.45 * A, 0.22 * A, [92, 108, 136], 0.45 * faint);
        });
        if (faint > 0.5) casters.push({ x, y, grove: true, shape: () => sp });
        put(x, y, () => {
          const p = S(x, y);
          blit(ctx, sp, p, faint * veiled(id, x + y, p.x - sp.ox, p.y - sp.oy, sp.w, sp.h));
        });
      } else if (pick < 0.83) put(x, y, () => blit(ctx, stumpSprite(A, variant), S(x, y), faint));
      else if (pick < 0.92) {
        put(x, y, () => blit(ctx, pumpkinSprite(A, variant), S(x, y), faint));
        if (variant % 3 === 0) lights.push({ p: S(x, y, 0.12 * A), r: 0.55 * A, rgb: "255, 170, 80", a: 0.45 });
      } else put(x, y, () => blit(ctx, boulderSprite(A, variant), S(x, y), faint));
    }
    for (const l of dec.low) {
      const tx = l.u - nowX;
      const ty = l.w - g.cy + R / 2;
      const q = S(tx, ty);
      if (!seen(q, 20)) continue;
      const sp = l.tile?.on ? l.wild : l.plain;
      if (!sp || bare(tx, ty)) continue;
      blit(ctx, sp, q);
    }
    // Your thundercloud: it keeps pace with the kids over your line and strikes the line again and again, each strike
    // leaving a scorch that the field carries off behind them, so the price it waits for is marked out on the ground.
    const STRIKE_MS = 1300;
    const yf = yours.flag && onMap(yOf(yours.flag.price)) ? yOf(yours.flag.price) : null;
    // A thundercloud floats over its row in line with the kids, a step behind the price line.
    const CLOUD_OFF = -KIDS_BACK;
    const cloudX = CLOUD_OFF;
    const CLOUD_Z = 2.7 * A;
    // Three clouds along the line: yours in the middle and a smaller one either side, so the price it waits for reads as a line.
    const CLOUDS = [
      { dx: -1.7, s: 0.66 },
      { dx: 0, s: 1 },
      { dx: 1.7, s: 0.66 },
    ];
    const drawCloud = (x: number, y: number, alpha: number, size = 1) => {
      const f = stormAt(Math.round(((A * 4.4 * size) / 26) * dpr * 10) / 10);
      const p = S(x, y, CLOUD_Z + (reduced() ? 0 : Math.sin(at / 900) * 0.05 * A));
      ctx.globalAlpha = alpha;
      ctx.drawImage(f.canvas, p.x - f.ox / dpr, p.y - f.oy / dpr, f.w / dpr, f.h / dpr);
      ctx.globalAlpha = 1;
      veils.push({ c: f.canvas, x: p.x - f.ox / dpr, y: p.y - f.oy / dpr, w: f.w / dpr, h: f.h / dpr });
    };
    const bolts: (() => void)[] = [];
    const flashes: Glow[] = [];
    // Clouds going as they strike the kids for the last time.
    const fading: { x: number; y: number; alpha: number; size: number }[] = [];
    const drawClouds = (x: number, y: number, alpha: number) => CLOUDS.forEach((cl) => drawCloud(x + cl.dx, y, alpha, cl.s));
    if (yf !== null && yours.flag) {
      // A cloud waits in silence while your graves do: it strikes only once your ghosts are up and you're in.
      const summoned = m.summoned.get(yours.flag.price) ?? now;
      const call = yours.call;
      const from = call ? Math.max(summoned, call.at + (call.maker ? 1800 : 1600)) : Infinity;
      let latest = -Infinity;
      CLOUDS.forEach((cl, ci) => {
        // Each cloud strikes in its turn, so between them the line is struck three times as often.
        const start = from + (ci * STRIKE_MS) / CLOUDS.length;
        const seed = (summoned % 997) + ci * 101;
        const cx = cloudX + cl.dx;
        const strikeX = (j: number) => (start + j * STRIKE_MS) / intervalMs - nowX + cx + (hash(j * 7.1 + seed) - 0.5) * 1.4 * cl.s;
        const j1 = start === Infinity ? -1 : Math.floor((now - start) / STRIKE_MS);
        if (j1 >= 0) latest = Math.max(latest, start + j1 * STRIKE_MS);
        for (let j = j1; j >= 0 && j > j1 - 18; j--) {
          const x = strikeX(j);
          if (x < ext.x0) break;
          const age = now - (start + j * STRIKE_MS);
          const left = clamp(1 - age / (STRIKE_MS * 18), 0, 1);
          const q = S(x, yf);
          blit(ctx, scorchSprite(A, j + seed), q, 0.9 * left);
          if (age < 600) lights.push({ p: q, r: 0.3 * A, rgb: "255, 170, 80", a: 0.5 * (1 - age / 600) });
          if (age > 260 || reduced()) continue;
          // The stroke flickers: lit, dark a moment, lit again.
          const on = age < 90 || (age > 130 && age < 240);
          if (!on) continue;
          const top = S(cx + (x - cx) * 0.35, yf, CLOUD_Z - 0.1 * A);
          glare.push({ x, y: yf });
          const sky = { x: cx + (x - cx) * 0.35, y: yf, z: CLOUD_Z / A - 0.1 };
          bolts.push(() => lightning3d(ctx, sky, { x, y: yf, z: 0 }, j * 13 + seed, (A / 34) * (0.7 + 0.3 * cl.s), (pt) => S(pt.x, pt.y, pt.z * A)));
          flashes.push({ p: q, r: 1.1 * A * cl.s, rgb: "255, 232, 140", a: 0.55 }, { p: { x: top.x, y: top.y - 0.3 * A }, r: 1.3 * A * cl.s, rgb: "200, 210, 255", a: 0.4 });
        }
        shadows.push(() => {
          const p = S(cx + 0.35 * cl.s, yf - 0.25);
          blob(ctx, p.x, p.y, 2.1 * A * cl.s, 0.95 * A * cl.s, [118, 124, 160], 0.6);
        });
      });
      if (latest > m.struck && !reduced()) {
        m.struck = latest;
        play("strike");
      }
    }
    // Lightning comes down on the kids where they walked into your cloud: its last two strikes, from the cloud itself straight down
    // into them, electrocuting them, and then the cloud goes.
    for (const p of m.past) {
      if (p.kind !== "taken" || now - p.at > ZAP_MS) continue;
      const age = now - p.at;
      const t = age / ZAP_MS;
      const cy0 = yOf(p.price);
      const cx = X(p.at) + CLOUD_OFF;
      const q = S(-KIDS_BACK, ky);
      for (const cl of CLOUDS) fading.push({ x: cx + cl.dx, y: cy0, alpha: 1 - t, size: cl.s });
      [0, 520].forEach((off, n) => {
        const a = age - off;
        // Each stroke flickers: lit, dark a moment, lit again.
        if (reduced() || a < 0 || !(a < 90 || (a > 130 && a < 240))) return;
        glare.push({ x: -KIDS_BACK, y: ky });
        bolts.push(() => lightning3d(ctx, { x: cx, y: cy0, z: CLOUD_Z / A - 0.1 }, { x: -KIDS_BACK, y: ky, z: 0 }, Math.round(p.at) + n * 17, A / 22, (pt) => S(pt.x, pt.y, pt.z * A)));
      });
      flashes.push({ p: q, r: (1.2 + 2 * t) * A, rgb: "255, 232, 140", a: 0.8 * (1 - t) });
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
      // The book only changes a few times a second: its usual order and each line's orders biggest first are worked out then.
      let bk = book.current;
      if (bk.walls !== walls) {
        const all = walls.flatMap((w) => w.orders).sort((a, b) => a - b);
        bk = book.current = { walls, usual: all[Math.floor(all.length / 2)] || 1, lines: walls.map((w) => ({ p: w.p, side: w.side, orders: [...w.orders].sort((a, b) => b - a) })) };
      }
      const usual = bk.usual;
      const cx = col + 0.5 - nowX;
      const most = v.w < 600 ? 4 : 7;
      // Only the biggest few orders in view are ever shown, so only those are kept, biggest first.
      const keep = most + 3;
      const orders: { key: string; row: number; side: Side; usd: number; seed: number }[] = [];
      for (const w of bk.lines) {
        const row = Math.round(worldY(w.p) * 2) / 2;
        if (!seen(S(cx, row - g.cy + R / 2), -30)) continue;
        for (let k = 0; k < w.orders.length; k++) {
          const usd = w.orders[k];
          if (orders.length === keep && usd <= orders[keep - 1].usd) break;
          let at0 = orders.length;
          while (at0 > 0 && orders[at0 - 1].usd < usd) at0--;
          orders.splice(at0, 0, { key: `${col}|${w.p}|${k}`, row, side: w.side, usd, seed: hash(col * 7919 + row * 62 + k * 13) });
          if (orders.length > keep) orders.pop();
        }
      }
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
      const arm = armSprite(A, tint, h.reach, Math.floor(h.seed * 6));
      casters.push({ x, y, tall: e, shape: () => arm });
      put(x, y, () => {
        const p = S(x, y);
        blit(ctx, moundSprite(A, false, wide), p, fade * Math.min(1, e * 2.5));
        if (h.head) {
          const eh = clamp((e - 0.3) / 0.7, 0, 1);
          const bob = calm ? 0 : Math.sin(at / 700 + h.seed * 20) * 0.6 * k;
          const q = { x: p.x - 5.5 * k, y: p.y + 1.5 * k + bob };
          // Looking south toward the kids from north of them, east along the field from south of them.
          const turn = y < y0 ? 4 : 28;
          const skin = mix([146, 184, 124], tint, 0.14).map(Math.round) as RGB;
          const hpx = Math.round(0.094 * A * dpr * 10) / 10;
          const hf = figure(`zombie|${hpx}|${skin}|${turn}`, () => paintZombie(skin, hpx, turn));
          risen({ c: hf.canvas, ox: hf.ox / dpr, oy: hf.oy / dpr, w: hf.w / dpr, h: hf.h / dpr }, q, eh, fade, 1.4 * k);
          if (eh > 0.6) glows.push({ p: { x: q.x, y: q.y - 7.4 * k }, r: 0.4 * A, rgb: "252, 226, 120", a: 0.38 * fade });
        }
        risen(arm, { x: p.x + (h.head ? 4 * k : 0), y: p.y }, e, fade, 1.4 * k);
        blit(ctx, moundSprite(A, true, wide), p, fade * Math.min(1, e * 2.5));
      });
    }

    // A ghost floats a little above the ground, bobbing; its glow goes in with the dusk.
    const glows: Glow[] = [...lights];
    // A ghost's figure is made at size made and drawn at size s; rising, its frame is held so the few figures it needs are kept.
    const spook = (x: number, y: number, side: Side, s: number, phase: number, alpha: number, boo: boolean, lift = 0, turn = 0, made = s, frame?: number, red = 0) => {
      const z = (6 + Math.sin(phase) * 2.5) * s * k + lift;
      const f = ghostAt(kind, GHOSTS[side], Math.round(1.9 * made * k * dpr * 10) / 10, frame ?? Math.floor((((phase / (Math.PI * 2)) % 1) + 1) % 1 * FRAMES), boo, turn);
      const st = s / made / dpr;
      shadows.push(() => {
        const p = S(x, y);
        blob(ctx, p.x, p.y, 0.5 * s * A, 0.24 * s * A, [92, 108, 136], 0.5 * clamp(1 - lift / (1.5 * A), 0.2, 1));
      });
      casters.push({ x, y, z, shape: () => ({ c: f.canvas, ox: f.ox * st, oy: f.oy * st, w: f.w * st, h: f.h * st }) });
      put(x, y, () => {
        const p = S(x, y, z);
        ctx.globalAlpha = alpha;
        ctx.drawImage(f.canvas, p.x - f.ox * st, p.y - f.oy * st, f.w * st, f.h * st);
        // Going wrong, they flash red: red is how much of it is laid over them.
        if (red > 0.02) {
          ctx.globalAlpha = alpha * Math.min(0.9, red);
          ctx.drawImage(tintOf(f.canvas, RED), p.x - f.ox * st, p.y - f.oy * st, f.w * st, f.h * st);
        }
        ctx.globalAlpha = 1;
        glows.push({ p: { x: p.x, y: p.y - 16 * s * k }, r: 34 * s * k, rgb: red > 0.25 ? "255, 90, 110" : side === "long" ? "170, 240, 210" : "250, 190, 205", a: 0.32 + 0.18 * clamp((red - 0.25) / 0.4, 0, 1) });
      });
    };
    // A row of your ghosts on your line, keeping pace with the kids and centred on them: as many as your power calls for, as big as
    // your stake, spaced by their size and, when there are many, staggered either side of the line so the row stays short.
    const across = ({ wisp: 19, spectre: 20, poltergeist: 24 }[kind] * 1.9 * scale) / 26;
    const gapOf = (count: number) => Math.min(across * 0.8, 9 / Math.max(1, count - 1));
    const row = (count: number) => {
      const gap = gapOf(count);
      const tight = gap < across * 0.7;
      return Array.from({ length: count }, (_, j) => ({ x: -KIDS_BACK + (j - (count - 1) / 2) * gap, dy: tight ? (j % 2 ? 0.32 : -0.32) : 0 }));
    };

    // Your graves: a line of them on your line, centred on the kids, set in the ground itself, so as the field moves on the one at
    // the back sinks into the earth and a new one rises at the front. They sink away as your ghosts swirl up out of them.
    // Others' graves go through here too, in their own colour, further along and closer set.
    const graveRow = (ya: number, count: number, side: Side, sink: number, o: { shift?: number; gap?: number; tint?: string; size?: number } = {}) => {
      const gap = o.gap ?? gapOf(count);
      const tight = !o.gap && gap < across * 0.7;
      const mid = -KIDS_BACK + (o.shift ?? 0);
      const x0 = mid - (count * gap) / 2;
      const x1 = mid + (count * gap) / 2;
      for (let i = Math.floor((nowX + x0) / gap); i * gap - nowX < x1; i++) {
        const x = i * gap - nowX;
        const e = clamp((x - x0) / (gap * 0.9), 0, 1) * clamp((x1 - x) / (gap * 0.9), 0, 1) * sink;
        if (e < 0.02) continue;
        const y = ya + (hash(i * 3.7) - 0.5) * 0.14 + (tight ? (i % 2 ? 0.26 : -0.26) : 0);
        const v = Math.floor(hash(i * 5.3) * 4);
        const stone = graveSprite(A, side, v, scale * (o.size ?? 1.5), o.tint);
        casters.push({ x, y, tall: ease(e), shape: () => stone });
        shadows.push(() => {
          const p = S(x, y);
          blob(ctx, p.x + 0.14 * A, p.y - 0.06 * A, 0.34 * A * scale, 0.15 * A * scale, [110, 118, 150], 0.5 * e);
        });
        put(x, y, () => {
          const p = S(x, y);
          blit(ctx, moundSprite(A, false, scale * 1.3), p, Math.min(1, e * 2));
          risen(stone, p, ease(e), 1, 0.05 * A);
          blit(ctx, moundSprite(A, true, scale * 1.3), p, Math.min(1, e * 2));
          if (e > 0.5 && !o.tint) glows.push({ p: { x: p.x, y: p.y - 0.45 * A * scale }, r: 0.5 * A * scale, rgb: side === "long" ? "130, 240, 190" : "250, 150, 170", a: 0.45 * e });
        });
      }
    };

    // Every word on the field is laid on the ground like the markings on a pitch: reading west to east along a row, or south to north
    // up a line of time, its foot at (x, y), all at one size. Drawn after the dusk so it stays clear, and cut away wherever something
    // stands in front of it.
    const labels: (() => void)[] = [];
    const marking = (text: string, x: number, y: number, color: string, o: { align?: CanvasTextAlign; up?: boolean; halo?: boolean; glow?: boolean; weight?: number; alpha?: number } = {}) => {
      const f = (A * WORD * WORDS * (v.w < 600 ? 1.06 : 1)) / 26;
      const at0 = S(x, y);
      const m = o.up ? [dpr * f, (-dpr * f) / 2, dpr * f, (dpr * f) / 2] : [dpr * f, (dpr * f) / 2, -dpr * f, (dpr * f) / 2];
      // Its box on the screen, from its box in its own lettering, padded for the halo.
      const boxed = (x0: number, x1: number, y0: number, y1: number) => {
        const px = [x0 - 5, x1 + 5, x0 - 5, x1 + 5].map((u, i) => m[0] * u + m[2] * (i < 2 ? y0 - 5 : y1 + 5) + dpr * at0.x);
        const py = [x0 - 5, x1 + 5, x0 - 5, x1 + 5].map((u, i) => m[1] * u + m[3] * (i < 2 ? y0 - 5 : y1 + 5) + dpr * at0.y);
        const l = Math.min(...px);
        const t = Math.min(...py);
        boxes.push({ x: l, y: t, w: Math.max(...px) - l, h: Math.max(...py) - t });
      };
      ctx.save();
      ctx.setTransform(m[0], m[1], m[2], m[3], dpr * at0.x, dpr * at0.y);
      if (o.glow) ctx.globalCompositeOperation = "lighter";
      const font = `${o.weight ?? 700} 26px ${o.weight === 400 ? DISPLAY : MONO}`;
      // The many faint numbers along the rows are set once each and laid down as pictures, once the face they're set in has loaded.
      const glowing = o.glow && GLOW.test(color) && typeof document !== "undefined" && document.fonts?.status === "loaded";
      if (glowing) {
        const [, rgb, alpha] = GLOW.exec(color)!;
        const wd = wordOf(text, font, `rgb(${rgb})`, f * dpr * 1.12);
        const shift = o.align === "center" ? -wd.width / 2 : o.align === "right" || o.align === "end" ? -wd.width : 0;
        ctx.globalAlpha = Number(alpha);
        ctx.drawImage(wd.c, shift - wd.left, -wd.asc, wd.w, wd.h);
        ctx.restore();
        boxed(shift - wd.left, shift - wd.left + wd.w, -wd.asc, -wd.asc + wd.h);
        return;
      }
      ctx.font = font;
      ctx.textAlign = o.align ?? "left";
      ctx.textBaseline = "alphabetic";
      if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
      if (o.halo !== false && !o.glow) {
        ctx.lineJoin = "round";
        ctx.lineWidth = 6;
        ctx.strokeStyle = "rgba(10, 14, 22, 0.6)";
        ctx.strokeText(text, 0, 0);
      }
      ctx.fillStyle = color;
      ctx.fillText(text, 0, 0);
      const tw = ctx.measureText(text).width;
      const from = o.align === "center" ? -tw / 2 : o.align === "right" || o.align === "end" ? -tw : 0;
      ctx.restore();
      boxed(from, from + tw, -22, 7);
    };
    // Rising, each ghost spins once round on its own, showing itself from every side, then turns to face the kids. It's drawn from
    // its full size figure at every turn, made ahead a few a frame while the graves wait, so the swirl never stops to make them.
    const kx = -KIDS_BACK;
    const facing = (x: number, y: number) => {
      const a = Math.atan2(ky - y, kx - x) - Math.PI / 4;
      return ((Math.round((a / (Math.PI * 2)) * ANGLES) % ANGLES) + ANGLES) % ANGLES;
    };
    // While the graves wait, the rise's every turn and the walk the ghosts will take facing the kids are made between frames.
    if (yours.trap && !yours.call && !reduced()) {
      const body = GHOSTS[yours.trap.side];
      const px = Math.round(1.9 * scale * k * dpr * 10) / 10;
      const ya = yOf(yours.trap.price);
      const ask = `${kind}|${px}|${yours.trap.count}|${Math.round(ya - y0)}`;
      if (asked.current !== ask) {
        asked.current = ask;
        for (let t = 0; t < ANGLES; t++) ghostSoon(kind, body, px, 0, true, t);
        for (const { x, dy } of row(yours.trap.count)) for (let fr = 0; fr < FRAMES; fr++) ghostSoon(kind, body, px, fr, true, facing(x, ya + dy));
      }
    }
    // While you're in, every turn of your ghost is made between frames too, for the spin they go up in if you're busted.
    if (yours.call && !reduced()) {
      const px = Math.round(1.9 * scale * k * dpr * 10) / 10;
      const ask = `bust|${kind}|${px}|${yours.call.side}`;
      if (asked.current !== ask) {
        asked.current = ask;
        for (let t = 0; t < ANGLES; t++) ghostSoon(kind, GHOSTS[yours.call.side], px, 0, true, t);
      }
    }
    if (yours.trap && !yours.call) {
      const ya = yOf(yours.trap.price);
      if (onMap(ya)) {
        graveRow(ya, yours.trap.count, yours.trap.side, 1);
        const price = fmt.price(yours.trap.price, tickSize);
        const color = TEAMS[yours.trap.side].ui;
        labels.push(() => marking(price, 0, ya + 0.95, color, { align: "center", alpha: SET }));
      }
    }
    let spooked = 0;
    if (yours.call) {
      const call = yours.call;
      const ya = yOf(call.entry);
      // The further the kids walk on through your ghosts, the more of them they wear away (hurt): all gone at your bust price.
      const go =ease((now - call.at) / (call.maker ? 900 : 1600));
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
            const grow = 0.4 + 0.6 * ease(rise);
            const begin = (j / Math.max(1, call.count - 1)) * 0.3;
            const spun = Math.floor(ANGLES * ease(clamp((rise - begin) / 0.6, 0, 1)));
            spook(at0.x, at0.y, call.side, Math.round(scale * grow * 10) / 10, at0.turn, Math.min(1, rise * 3) * 0.95, true, at0.lift, (facing(x, ya + dy) + spun) % ANGLES, scale, 0);
            for (let tr = 1; tr <= 5; tr++) {
              const back = swirl(x, j, Math.max(0, rise - tr * 0.035));
              back.y += dy * rise;
              glows.push({ p: S(back.x, back.y, back.lift + 0.5 * A * scale), r: 0.14 * A, rgb: call.side === "long" ? "150, 255, 210" : "255, 170, 190", a: 0.7 * (1 - tr / 6) });
            }
            return;
          }
          const from = call.maker ? { x, y: ya + dy } : { x: x + 1.6, y: call.side === "long" ? R + 1 : -1 };
          const gx = lerp(from.x, x, go);
          const gy = lerp(from.y, ya + dy, go);
          spook(gx, gy, call.side, scale, walk * 0.5 + j * 1.3, 0.95 - 0.7 * hurt, spooked > 0 || hurt < 0.05, 0, facing(gx, gy), scale, undefined, alarm * (0.5 + 0.5 * pulse));
        });
      }
      const yk = yOf(call.koAt);
      if (onMap(yk)) labels.push(() => marking(`BUSTED ${fmt.price(call.koAt, tickSize)}`, 2, yk + (call.side === "long" ? 0.55 : -0.12), COLORS.down));
    }
    // Busted: the rise from the graves run backwards. Your ghosts flare red and are swept in off their row into one whirl round the
    // middle of it, then spiral up it together and off the field, each spinning on its own axis faster and faster the other way round,
    // shrinking and fading as it goes, with a trail of red wisps behind it and a red column of light up the whirl; from where they
    // were if that's in view, else round the kids, who are where the bust is. A ring of red goes out over the ground from the kids and
    // the whole field flushes red a moment.
    let flush = 0;
    for (const p of m.past) {
      if (p.kind !== "bust" || now - p.at > BUST_MS) continue;
      const t = (now - p.at) / BUST_MS;
      const ya = p.entry !== undefined && onMap(yOf(p.entry)) ? yOf(p.entry) : ky;
      const count = p.count ?? 4;
      const cx = -KIDS_BACK;
      // Each takes its own place round the whirl, evenly spaced, coming in to it from its place in the row.
      const up = (x: number, dy: number, j: number, u: number) => {
        const turn = (j / count) * Math.PI * 2 - u * u * Math.PI * 4;
        const r = 1.6 * (1 - 0.4 * u);
        const k = ease(u / 0.35);
        return { x: lerp(x, cx + Math.cos(turn) * r, k), y: lerp(ya + dy, ya + Math.sin(turn) * r, k), lift: (0.4 * u + 6 * u * u) * A, turn };
      };
      row(count).forEach(({ x, dy }, j) => {
        const u = clamp((t - (j / Math.max(1, count - 1)) * 0.12) / 0.85, 0, 1);
        if (u >= 1) return;
        const face = facing(x, ya + dy);
        if (reduced()) {
          spook(x, ya + dy, p.side, scale, 0, 0.95 * (1 - u), true, 0, face, scale, 0, 0.6);
          return;
        }
        const go = up(x, dy, j, u);
        const spun = Math.floor(ANGLES * 4 * u * u);
        const fade = 0.95 * (1 - smooth01((u - 0.6) / 0.4));
        spook(go.x, go.y, p.side, Math.round(scale * (1 - 0.45 * ease(u)) * 10) / 10, go.turn, fade, true, go.lift, (((face - spun) % ANGLES) + ANGLES) % ANGLES, scale, 0, 0.3 + 0.25 * (1 - u));
        for (let tr = 1; tr <= 5; tr++) {
          const back = up(x, dy, j, Math.max(0, u - tr * 0.035));
          glows.push({ p: S(back.x, back.y, back.lift + 0.5 * A * scale), r: 0.16 * A, rgb: "255, 90, 120", a: 0.75 * (1 - tr / 6) * fade });
        }
      });
      if (!reduced()) for (let i = 0; i < 6; i++) glows.push({ p: S(cx, ya, i * 1.1 * A), r: (0.9 - 0.08 * i) * A, rgb: "255, 60, 100", a: 0.18 * Math.sin(Math.PI * clamp(t * 1.4, 0, 1)) });
      const q = S(-KIDS_BACK, ky);
      flashes.push({ p: q, r: (1.4 + 2.4 * t) * A, rgb: "255, 60, 90", a: 0.8 * (1 - t) });
      bolts.push(() => {
        for (const r of [0.55, 1]) oval(ctx, q.x, q.y, (0.4 + 2.6 * t * r) * A, (0.2 + 1.3 * t * r) * A, undefined, `rgba(255, 77, 109, ${1 - t})`, 3);
      });
      flush = Math.max(flush, Math.pow(1 - t, 3));
    }
    if (yours.flag && yf !== null) {
      const banks = yours.flag.banks;
      const text = `${fmt.price(yours.flag.price, tickSize)}${banks !== undefined ? `  ${fmt.money(banks, true)}` : ""}`;
      labels.push(() => marking(text, 0, yf + 0.95, COLORS.volt, { align: "center", alpha: SET }));
    }

    // Everyone else, each player in their own hue, in a column just east of yours: graves of their colour on the row where theirs
    // wait, and their ghost on the row where they came in once they're in. Smaller than yours, staggered where several share a row.
    const crowd = new Map<number, number>();
    if (glides.current.size > 64) glides.current.clear();
    if (appears.current.size > 64) appears.current.clear();
    if (places.current.size > 64) places.current.clear();
    // How far a rival's graves or ghost have come into view since they first showed.
    const appear = (key: string) => {
      const v = Math.min(1, (appears.current.get(key) ?? 0) + fadeStep * 0.6);
      appears.current.set(key, v);
      return v;
    };
    for (const r of pins) {
      const was = glides.current.get(r.id) ?? r.p;
      const at0 = was + (r.p - was) * fadeStep * 0.6;
      glides.current.set(r.id, at0);
      const y = yOf(at0);
      if (!onMap(y)) continue;
      const lane = Math.round(y * 2);
      const n = crowd.get(lane) ?? 0;
      crowd.set(lane, n + 1);
      const rk = GHOST_KIND[r.role];
      const s = FIELD_SIZE[rk] * 0.7;
      // Their place in the column glides too, when others come and go on their row.
      const tx = -KIDS_BACK + 5.5 + n * 1.05;
      const tdy = n ? (n % 2 ? 0.28 : -0.28) : 0;
      const spot = places.current.get(r.id) ?? { x: tx, dy: tdy };
      spot.x += (tx - spot.x) * fadeStep * 0.6;
      spot.dy += (tdy - spot.dy) * fadeStep * 0.6;
      places.current.set(r.id, spot);
      const x = spot.x;
      const ry = y + spot.dy;
      if (!r.call) {
        graveRow(ry, 2, r.side, appear(`${r.id}|graves`), { shift: x + KIDS_BACK, gap: 0.55, tint: r.hue, size: 1.2 });
        continue;
      }
      const seed = hash([...r.id].reduce((h, ch) => h + ch.charCodeAt(0), 0) * 1.7);
      const phase = (reduced() ? 0 : at / 520) + seed * Math.PI * 2;
      const z = (5 + Math.sin(phase) * 2) * s * k;
      const f = ghostAt(rk, hex(r.hue), Math.round(1.9 * s * k * dpr * 10) / 10, 0, false, facing(x, ry));
      const st = 1 / dpr;
      const alpha = 0.95 * appear(`${r.id}|ghost`);
      shadows.push(() => {
        const p = S(x, ry);
        blob(ctx, p.x, p.y, 0.5 * s * A, 0.24 * s * A, [92, 108, 136], 0.45 * alpha);
      });
      casters.push({ x, y: ry, z, shape: () => ({ c: f.canvas, ox: f.ox * st, oy: f.oy * st, w: f.w * st, h: f.h * st }) });
      put(x, ry, () => {
        const p = S(x, ry, z);
        ctx.globalAlpha = alpha;
        ctx.drawImage(f.canvas, p.x - f.ox * st, p.y - f.oy * st, f.w * st, f.h * st);
        ctx.globalAlpha = 1;
      });
    }

    // The kids: the price. They walk as far as the ground moves under them and the price carries them, a full stride to every half
    // a tile, so their feet keep to the ground; with the ground near still they stand and tremble. They jump when your ghosts spring.
    const wy = worldY(gait.price);
    const dt = gait.at ? Math.min(at - gait.at, 100) : 0;
    const moved = Math.hypot(dt / intervalMs, wy - gait.y);
    gait.walked += moved;
    gait.y = wy;
    gait.at = at;
    const still = reduced() || moved < dt * 0.00005;
    const strideNow = reduced() ? 0 : Math.floor(((gait.walked / 0.5) % 1) * STRIDES);
    const tremble = still && !reduced() ? Math.sin(at / 37) * 0.5 : 0;
    // They walk a step behind the price, the coin's signal on the ground ahead of them where the middle one's torch shines.
    shadows.push(() => {
      const p = S(kx, ky);
      blob(ctx, p.x, p.y, 0.8 * A, 0.36 * A, [92, 108, 136], 0.55);
    });
    const jump = Math.sin(spooked * Math.PI) * 14 * k;
    const kidPx = Math.round(2.05 * k * dpr * 10) / 10;
    // Which way they face: east as they walk, turned toward where the price is going from the gap still to walk (south a positive
    // turn), read as a pace in rows a second against the ground's tile a candle.
    const gap = worldY(target) - wy;
    const pull = reduced() || Math.abs(gap) < TURN_NOISE ? 0 : gap / (TURN_STEP / 1000);
    if (pull) gait.quiet = 0;
    else if ((gait.quiet += dt) > TURN_BRIDGE) gait.aim = 0;
    if (pull && (Math.sign(pull) !== Math.sign(gait.aim) || Math.abs(pull) >= Math.abs(gait.aim))) gait.aim = pull;
    const heading = clamp(Math.atan2(gait.aim, 1000 / intervalMs), -Math.PI / 2, Math.PI / 2);
    gait.turn = reduced() ? 0 : turnTo(gait.turn, heading, dt, BODY_TURN);
    const round = clamp(1 - Math.abs(heading - gait.turn) / WALK_ROUND, 0, 1);
    gait.pace = Math.abs(gap) < TURN_NOISE ? 1 : round * round * (3 - 2 * round);
    const toward = kidPose(gait.turn);
    kidsSoon(kidPx, kidPose(heading));
    // A pose not made yet is made between frames; until it's ready they keep the one they have.
    if (toward !== gait.pose) {
      if (figures.has(kidsKey(kidPx, strideNow, toward))) gait.pose = toward;
      kidsSoon(kidPx, toward);
    }
    kidsSoon(kidPx, gait.pose);
    // Electrocuted, they freeze in the stride and the way round they were struck in.
    const zap = m.zap && now - m.zap.at < ZAP_MS ? m.zap : null;
    if (!zap) m.zap = null;
    else if (zap.stride < 0) {
      zap.stride = strideNow;
      zap.pose = gait.pose;
    }
    if (yours.call && yours.flag) bonesSoon(kidPx, gait.pose);
    const kidsNow = zap ? kidsAt(kidPx, zap.stride, zap.pose) : kidsAt(kidPx, strideNow, gait.pose);
    casters.push({ x: kx, y: ky, z: jump, shape: () => shapeOf(kidsNow, dpr) });
    let torch: Pt | null = null;
    put(kx, ky, () => {
      const p = S(kx, ky, jump);
      p.x += tremble;
      const f = kidsNow;
      // Lightning going through them: they shake, flickering between themselves and their white bones in a charred black body,
      // with sparks crackling over them.
      const age = zap ? now - zap.at : 0;
      const crackling = !!zap && age < ZAP_MS - 300;
      const xray = crackling && (reduced() ? age < 1000 : Math.floor(age / 90) % 2 === 0);
      if (zap && !reduced()) {
        const shake = 1 - age / ZAP_MS;
        p.x += Math.sin(at / 11) * 2.2 * k * shake;
        p.y += Math.cos(at / 15) * 1.2 * k * shake;
      }
      if (xray) {
        // Laid down again once the dusk and the light are on, so the body stays black and the bones white, the glow round them.
        const b = bonesAt(kidPx, zap!.stride, zap!.pose);
        const xrayed = () => {
          ctx.drawImage(tintOf(f.canvas, CHARRED), p.x - f.ox / dpr, p.y - f.oy / dpr, f.w / dpr, f.h / dpr);
          ctx.drawImage(b.canvas, p.x - b.ox / dpr, p.y - b.oy / dpr, b.w / dpr, b.h / dpr);
        };
        xrayed();
        bolts.push(xrayed);
        glows.push({ p: { x: p.x, y: p.y - 0.75 * A }, r: 1.4 * A, rgb: "150, 190, 255", a: 0.55 });
      } else ctx.drawImage(f.canvas, p.x - f.ox / dpr, p.y - f.oy / dpr, f.w / dpr, f.h / dpr);
      if (crackling && !reduced()) {
        const spark = Math.floor(age / 70);
        const paths = [0, 1, 2].map((n) => {
          const seed = (zap!.at % 997) + spark * 7.3 + n * 31.1;
          let x = p.x + (hash(seed) - 0.5) * 1.2 * A;
          let y = p.y - (0.15 + hash(seed * 1.7) * 1.1) * A;
          let turn = hash(seed * 2.3) * Math.PI * 2;
          const pts: Pt[] = [];
          for (let i = 0; i < 6; i++) {
            pts.push({ x, y });
            turn += (hash(seed * 3.1 + i) - 0.5) * 2.2;
            x += Math.cos(turn) * 0.14 * A;
            y += Math.sin(turn) * 0.14 * A;
          }
          return { pts, w: 0.5 };
        });
        bolts.push(() => glowing(ctx, paths, A / 30, 1));
      }
      if (xray) return;
      // The torch is the one light about them: no glow round the eldest's lantern, so the beam reads.
      const lens = kidsTorch(2.05 * k, kidTurn(zap ? zap.pose : gait.pose));
      torch = { x: p.x + lens.x, y: p.y + lens.y };
      glows.push({ p: torch, r: 0.4 * A, rgb: "255, 236, 190", a: 0.8 });
    });
    ctx.globalCompositeOperation = "multiply";
    shadows.forEach((fn) => fn());
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
    stood.sort((a, b) => a.d - b.d).forEach((s) => s.draw());
    if (yf !== null) drawClouds(cloudX, yf, 1);
    for (const f of fading) drawCloud(f.x, f.y, f.alpha, f.size);

    // Rain, heavier round by round: a drop falling slantwise onto each patch of ground, and a splash where it lands. Each drop
    // belongs to its patch of the ground, not of the screen, so when the view pans to follow the price the rain goes with the field.
    // Water in three tones, thin drops and the odd heavy one with a bright bead at its head, each its own length; landing, a crown
    // splash with two droplets thrown up and a ring spreading where it hit.
    const drops: { x: number; y: number; ph: number; a: number; b: number }[] = [];
    const RAIN_FALL = 150;
    if (wet > 0.04) {
      // On a phone the drops fall a little further apart: the same rain, fewer strokes.
      const cell = v.w < 600 || coarse() ? 24 : 17;
      const t = at / 1000;
      // Where the ground's own lattice of patches sits on the screen just now, and which patch is the first in view.
      const gx = (-nowX + g.cy - R / 2) * A;
      const gy = ((-nowX - g.cy + R / 2) * A) / 2;
      const i0 = Math.floor(-gx / cell) - 1;
      const j0 = Math.floor(-gy / cell) - 1;
      const cols = Math.ceil((v.w + RAIN_FALL * 0.28) / cell) + 3;
      const rows = Math.ceil((v.h + RAIN_FALL) / cell) + 3;
      const roll = (i: number, j: number, k: number) => hash((((i % 9973) + 9973) % 9973) * 73.1 + (((j % 9973) + 9973) % 9973) * 151.7 + k * 17.3);
      for (let jj = 0; jj < rows; jj++) {
        for (let ii = 0; ii < cols; ii++) {
          const i = i0 + ii;
          const j = j0 + jj;
          if (roll(i, j, 0) > wet) continue;
          const period = 0.42 + roll(i, j, 1) * 0.3;
          const off = roll(i, j, 2);
          const ph = ((((t + off * period) % period) + period) % period) / period;
          const x = gx + i * cell + roll(i, j, 3) * cell;
          const y = gy + j * cell + off * cell;
          if (x < -20 || y < -20 || x > v.w + RAIN_FALL * 0.28 + 20 || y > v.h + RAIN_FALL + 20) continue;
          drops.push({ x, y, ph, a: roll(i, j, 4), b: roll(i, j, 5) });
        }
      }
    }
    if (drops.length) {
      const tones = ["rgba(188, 208, 236, 0.42)", "rgba(222, 234, 250, 0.62)", "rgba(150, 178, 214, 0.5)"];
      const thin = tones.map(() => new Path2D());
      const heavy = tones.map(() => new Path2D());
      const beads = new Path2D();
      const crowns = new Path2D();
      const rings = new Path2D();
      const thrown = new Path2D();
      for (const d of drops) {
        const tone = Math.floor(d.a * 3) % 3;
        const big = d.b > 0.74;
        if (d.ph < 0.9) {
          // (in the air, from its top to its foot)
          const long = 8 + ((d.a * 7.3) % 1) * 9 + (big ? 4 : 0);
          const drop = RAIN_FALL * (1 - d.ph);
          const x = d.x - drop * 0.28;
          const y = d.y - drop;
          const path = (big ? heavy : thin)[tone];
          path.moveTo(x, y);
          path.lineTo(x + long * 0.28, y + long);
          if (big) {
            beads.moveTo(x + long * 0.28 + 1.1, y + long);
            beads.arc(x + long * 0.28, y + long, 1.1, 0, Math.PI * 2);
          }
          continue;
        }
        const k = (d.ph - 0.9) / 0.1;
        const r = 1.5 + k * 3;
        crowns.moveTo(d.x - r, d.y - r * 0.4);
        crowns.lineTo(d.x - r * 0.4, d.y);
        crowns.moveTo(d.x + r, d.y - r * 0.4);
        crowns.lineTo(d.x + r * 0.4, d.y);
        rings.moveTo(d.x + 2 + k * 7, d.y);
        rings.ellipse(d.x, d.y, 2 + k * 7, (2 + k * 7) * 0.42, 0, 0, Math.PI * 2);
        for (const side of [-1, 1]) thrown.rect(d.x + side * (1.5 + k * 4), d.y - 3 * Math.sin(Math.PI * k) - 1, 1.2, 1.2);
      }
      ctx.lineCap = "round";
      tones.forEach((tone, n) => {
        ctx.strokeStyle = tone;
        ctx.lineWidth = 0.9;
        ctx.stroke(thin[n]);
        ctx.lineWidth = 1.5;
        ctx.stroke(heavy[n]);
      });
      ctx.lineCap = "butt";
      ctx.fillStyle = "rgba(240, 247, 255, 0.85)";
      ctx.fill(beads);
      ctx.strokeStyle = "rgba(214, 228, 248, 0.55)";
      ctx.lineWidth = 1;
      ctx.stroke(crowns);
      ctx.strokeStyle = "rgba(200, 220, 246, 0.28)";
      ctx.stroke(rings);
      ctx.fillStyle = "rgba(226, 238, 252, 0.7)";
      ctx.fill(thrown);
    }

    // Dusk: everything dimmed toward a cool blue, deeper as the storm comes in, then the lantern and the ghosts glowing through it.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = css(mix([206, 208, 224], [104, 112, 160], wet));
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.restore();
    ctx.globalCompositeOperation = "lighter";
    // Fireflies over the grass while it's dry, fewer on a phone's smaller field, and a pool of lantern light on the ground about them.
    const dry = 1 - wet;
    if (dry >= 0.3 && !reduced()) {
      const t = at / 1000;
      for (let n = 0; n < (v.w < 600 ? 16 : 26); n++) {
        const blink = Math.max(0, Math.sin(t * (1.3 + hash(n) * 1.4) + n * 2.7));
        if (blink < 0.05) continue;
        const fx = hash(n * 7.3) * v.w + Math.sin(t * 0.31 + n) * 40;
        const fy = v.h * (0.2 + hash(n * 3.1) * 0.75) + Math.cos(t * 0.43 + n * 1.9) * 24;
        glows.push({ p: { x: fx, y: fy }, r: 7, rgb: "222, 255, 150", a: 0.75 * blink * dry });
      }
    }
    // The coin's signal sits on the price itself, centred on the end of its trail, and the torch's beam reaches out to it from the
    // kids a step behind: a soft shaft opening to the signal's width, motes drifting down it. Beam first, so the coin stays dark.
    const lamp = S(0, y0);
    shine(ctx, lamp.x, lamp.y, 2.6 * A, 1.3 * A, "255, 186, 104", 0.2, false);
    const lens = torch as Pt | null;
    if (lens) {
      const dx = lamp.x - lens.x;
      const dy = lamp.y - lens.y;
      const L = Math.hypot(dx, dy);
      if (L > 2) {
        // Across the beam, the signal's half width that way: on the screen it's an ellipse SIGNAL_TILES across and half as tall.
        const nx = -dy / L;
        const ny = dx / L;
        const rx = (Math.SQRT2 * SIGNAL_TILES * A) / 2;
        const w = 0.95 * Math.hypot(rx * nx, (rx / 2) * ny);
        const w0 = 0.07 * A;
        const fall = ctx.createLinearGradient(lens.x, lens.y, lamp.x, lamp.y);
        fall.addColorStop(0, "rgba(255, 240, 200, 0.3)");
        fall.addColorStop(1, "rgba(255, 214, 150, 0.14)");
        ctx.fillStyle = fall;
        ctx.filter = "blur(4px)";
        ctx.beginPath();
        ctx.moveTo(lens.x + nx * w0, lens.y + ny * w0);
        ctx.lineTo(lamp.x + nx * w, lamp.y + ny * w);
        ctx.lineTo(lamp.x - nx * w, lamp.y - ny * w);
        ctx.lineTo(lens.x - nx * w0, lens.y - ny * w0);
        ctx.closePath();
        ctx.fill();
        ctx.filter = "none";
        // Each mote drifts from the torch to the signal at its own pace, somewhere new across the beam each time it sets off.
        if (!reduced()) {
          for (let n = 0; n < MOTES; n++) {
            const run = (at / 1000) * (0.25 + hash(n * 1.3) * 0.3) + hash(n * 5.1);
            const u = run - Math.floor(run);
            const across = (hash(n * 7 + Math.floor(run)) * 2 - 1) * 0.85 * (w0 + (w - w0) * u);
            ctx.fillStyle = `rgba(255, 236, 196, ${0.75 * Math.sin(Math.PI * u)})`;
            ctx.beginPath();
            ctx.arc(lens.x + dx * u + nx * across, lens.y + dy * u + ny * across, 0.95 * k, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
    // The coin, like a signal in the sky: a soft pool of the torch's light with the market's mark cut out of it.
    const mark0 = coin ? signalOf(coin) : null;
    if (mark0) {
      const f = (A * SIGNAL_TILES) / SIGNAL;
      ctx.save();
      ctx.setTransform(dpr * f, (dpr * f) / 2, -dpr * f, (dpr * f) / 2, dpr * lamp.x, dpr * lamp.y);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(mark0.pool, -SIGNAL / 2, -SIGNAL / 2);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.82;
      ctx.drawImage(mark0.mark, -SIGNAL / 2, -SIGNAL / 2);
      ctx.restore();
      ctx.globalCompositeOperation = "lighter";
    }
    for (const glow of [...glows, ...flashes]) if (glow.a >= 0.05) shine(ctx, glow.p.x, glow.p.y, glow.r, glow.r, glow.rgb, glow.a, true);
    if (bustLine) {
      const { y, x0 } = bustLine;
      line(ctx, S(x0, y), S(ext.x1, y), `rgba(255, 50, 80, ${0.18 + 0.3 * pulse * (0.3 + hurt)})`, 9);
      line(ctx, S(x0, y), S(ext.x1, y), `rgba(255, 120, 140, ${0.35 + 0.3 * pulse})`, 2.4);
    }
    // The ectoplasm (ECTO): each sheet laid in a half-size scratch canvas on the ground plane, lifted to its height, moving with the
    // ground and drifting over it, kept to the rim, then added on.
    if (!ectoSheets && !ectoAsked) {
      ectoAsked = true;
      idle(() => {
        ectoSheets = ECTO.map((sheet) => (sheet.streaky ? ectoNoise(2, 9, 4, 0.4, 2.6, sheet.rgb) : ectoNoise(4, 4, 5, 0.32, 2.2, sheet.rgb)));
        ectoBorn = performance.now();
      });
    }
    if (ectoSheets) {
      const lw = Math.ceil(v.w / 2);
      const lh = Math.ceil(v.h / 2);
      let mist = ecto.current;
      if (!mist || mist.key !== `${lw}x${lh}`) {
        const buf = document.createElement("canvas");
        buf.width = lw;
        buf.height = lh;
        const mask = document.createElement("canvas");
        mask.width = lw;
        mask.height = lh;
        const mg = mask.getContext("2d")!;
        const rim = mg.createImageData(lw, lh);
        for (let y = 0; y < lh; y++) {
          for (let x = 0; x < lw; x++) rim.data[(y * lw + x) * 4 + 3] = Math.round(smooth01((Math.hypot((x / lw - 0.5) * 1.15, (y / lh - 0.52) * 1.3) - ECTO_FROM) / ECTO_IN) * 255);
        }
        mg.putImageData(rim, 0, 0);
        const bg = buf.getContext("2d")!;
        mist = ecto.current = { key: `${lw}x${lh}`, buf, mask, patterns: ectoSheets.map((sheet) => bg.createPattern(sheet, "repeat")!) };
      }
      const bg = mist.buf.getContext("2d")!;
      const t = reduced() ? 0 : at / 1000;
      const born = clamp((performance.now() - ectoBorn) / 1000, 0, 1);
      ECTO.forEach((sheet, n) => {
        // the sheet's place on the ground, kept within one repeat so the numbers stay small
        const across = (((nowX - sheet.drift[0] * t) % sheet.scale) + sheet.scale) % sheet.scale;
        const down = (((g.cy - R / 2 - sheet.drift[1] * t) % sheet.scale) + sheet.scale) % sheet.scale;
        const u = (A * sheet.scale) / ECTO_TEX / 2;
        mist.patterns[n].setTransform(new DOMMatrix([u, u / 2, -u, u / 2, (v.OX - A * (across - down)) / 2, (v.OY - sheet.z * A - (A / 2) * (across + down)) / 2]));
        bg.globalCompositeOperation = "source-over";
        bg.clearRect(0, 0, lw, lh);
        bg.fillStyle = mist.patterns[n];
        bg.fillRect(0, 0, lw, lh);
        bg.globalCompositeOperation = "destination-in";
        bg.drawImage(mist.mask, 0, 0);
        ctx.globalAlpha = sheet.alpha * born;
        ctx.drawImage(mist.buf, 0, 0, v.w, v.h);
      });
      ctx.globalAlpha = 1;
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

    // Past half way to the bust, the edge of the view the bust lies past glows red to the beat, stronger as the kids near it: the
    // south edge for a long, the north for a short. Busted, the whole field flushes red a moment.
    if (yours.call && alarm > 0.01) {
      const south = yours.call.side === "long";
      const a = alarm * (0.2 + 0.35 * danger) * (0.6 + 0.4 * pulse);
      const band = ctx.createLinearGradient(0, south ? v.h : 0, 0, south ? v.h * 0.5 : v.h * 0.5);
      band.addColorStop(0, `rgba(255, 40, 70, ${a})`);
      band.addColorStop(1, "rgba(255, 40, 70, 0)");
      ctx.fillStyle = band;
      ctx.fillRect(0, 0, v.w, v.h);
    }
    if (flush > 0.01) {
      ctx.fillStyle = `rgba(255, 30, 60, ${0.34 * flush})`;
      ctx.fillRect(0, 0, v.w, v.h);
    }

    // A fill: a puff of dust where the hand was, in the candle they're in.
    for (const b of blasts) {
      const y = Math.round(worldY(b.p) * 2) / 2 - g.cy + R / 2;
      const t = clamp((now - b.at) / 900, 0, 1);
      const q = S(col + 0.5 - nowX, y, 6);
      if (!seen(q)) continue;
      for (let i = 0; i < 5; i++) oval(ctx, q.x + Math.cos(i * 1.3) * 10 * t, q.y + Math.sin(i * 1.3) * 5 * t - 6 * t, 4 + 6 * t, 3 + 4 * t, css(CLAY.haze, 0.8 * (1 - t)));
    }

    // The words on the ground go down last so the dusk and rain don't dull them, but trees, kids, ghosts, hands and clouds still stand
    // in front of them: they're set on a layer of their own, cleared only where last frame's words were.
    const page = (writing.current ??= document.createElement("canvas"));
    const fresh = page.width !== c.width || page.height !== c.height;
    if (fresh) {
      page.width = c.width;
      page.height = c.height;
    }
    const words = page.getContext("2d")!;
    words.setTransform(1, 0, 0, 1, 0, 0);
    words.globalAlpha = 1;
    words.globalCompositeOperation = "source-over";
    if (!fresh) for (const r of written.current) words.clearRect(r.x, r.y, r.w, r.h);
    words.setTransform(field.getTransform());
    ctx = words;

    // Who's been busted, where it happened.
    for (const mk of marks) {
      const x = X(mk.t);
      const y = yOf(mk.p);
      if (!onMap(y) || !seen(S(x, y))) continue;
      marking(mk.glyph, x, y + 0.2, mk.color, { align: "center" });
    }

    // The prices, marked on the ground like the numbers on a pitch: each one every few tiles along its row, set in the ground so they
    // move off with it as time passes, at half strength where they come in from the east, a tenth by the price line, then gone.
    const stepP = niceStep(g.rowSize * Math.max(4, 100 / A));
    const STRIDE = 12;
    for (let p = Math.ceil(priceAt(ext.y1) / stepP) * stepP; p < priceAt(ext.y0); p += stepP) {
      const y = yOf(p);
      const text = fmt.price(p, Math.max(tickSize, stepP / 100));
      for (let i = Math.floor((nowX + ext.x0) / STRIDE); i * STRIDE - nowX < ext.x1; i++) {
        const x = i * STRIDE - nowX;
        const a = x >= 0 ? 0.1 + 0.4 * clamp(x / Math.max(ext.x1, 1), 0, 1) : 0.1 * clamp(1 + x / 2, 0, 1);
        if (a < 0.04 || Math.hypot(x, y - y0) < 2.4) continue;
        if (yf !== null && Math.abs(S(x, y).y - S(cloudX, yf, CLOUD_Z).y) < 1.6 * A && Math.abs(S(x, y).x - S(cloudX, yf).x) < 2.4 * A) continue;
        marking(text, x, y - 0.1, `rgba(214, 224, 255, ${a})`, { align: "center", glow: true });
      }
    }

    labels.forEach((fn) => fn());
    // The price, marked on the ground just south of the coin's signal.
    marking(fmt.price(target, tickSize), 0, y0 + 1.05, "#f4f8f6", { align: "center", alpha: SET });

    const hovered = hover.current ? priceUnder(hover.current.x, hover.current.y) : null;
    ctx = field;
    // Each word is cut away under whatever stands over it, then laid down on the field, only where words are.
    const spots = merged(boxes, c.width, c.height);
    const over = (x: number, y: number, w: number, h: number) => spots.some((r) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y);
    words.save();
    words.setTransform(1, 0, 0, 1, 0, 0);
    words.globalCompositeOperation = "destination-out";
    for (const k of casters) {
      const sh = k.shape();
      const q = S(k.x, k.y);
      const x = (q.x - sh.ox) * dpr;
      const y = (q.y - sh.oy - (k.z ?? 0)) * dpr;
      if (over(x, y, sh.w * dpr, sh.h * dpr)) words.drawImage(sh.c, x, y, sh.w * dpr, sh.h * dpr);
    }
    for (const w of veils) if (over(w.x * dpr, w.y * dpr, w.w * dpr, w.h * dpr)) words.drawImage(w.c, w.x * dpr, w.y * dpr, w.w * dpr, w.h * dpr);
    words.restore();
    field.save();
    field.setTransform(1, 0, 0, 1, 0, 0);
    field.globalAlpha = 1;
    field.globalCompositeOperation = "source-over";
    for (const r of spots) field.drawImage(page, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    field.restore();
    written.current = spots;

    const picked = hovered !== null && pick ? pick(hovered) : null;
    // What a click here would put on the field, shown faintly where it would go.
    if (picked) {
      const p = picked.p;
      const y = yOf(p);
      if (picked.art === "cloud") drawClouds(CLOUD_OFF, y, 0.5);
      else if (picked.art) for (const [j, at0] of row(picked.art.count).entries()) blit(ctx, graveSprite(A, picked.art.side, j, scale * 1.5), S(at0.x, y + at0.dy * 0.8), 0.5);
      const box = onPage()!;
      const hx = hover.current!.x - box.left;
      const hy = hover.current!.y - box.top;
      if (aiming.current) oval(ctx, hx, hy, 16, 16, undefined, picked.color, 2);
      marking(`${picked.label.toUpperCase()}  ${fmt.price(p, tickSize)}`.trim(), 0, y + (aiming.current ? -1.1 : 0.62), picked.color, { align: "center", alpha: SET });
    }
    const pointer = picked ? "crosshair" : "";
    if (wrap.current && cursor.current !== pointer) wrap.current.style.cursor = cursor.current = pointer;
  }

  useEffect(() => {
    const el = wrap.current!;
    const resize = () => {
      const c = canvas.current;
      if (!c) return;
      placed.current = null;
      const { width, height } = el.getBoundingClientRect();
      DPR = ratioFor(width);
      c.width = Math.round(width * DPR);
      c.height = Math.round(height * DPR);
      // The kids in the middle of the view, the past running off to the west and the future's haze to the east; on a narrow screen
      // more of the past goes, so the kids stay big.
      const span = P + F + R;
      const A = clamp(Math.min((width - 24) / (F + R + P * (width < 600 ? 0.25 : 0.45)), (height - 40) / (span / 2 + 1.4)), 8, 44);
      view.current = { w: width, h: height, A, OX: width / 2 + (R / 2) * A, OY: height / 2 - (R / 4) * A + 0.4 * A };
      // Resizing clears the canvas, so a paused field is drawn again at once.
      draw();
    };
    const css = getComputedStyle(document.documentElement);
    MONO = css.getPropertyValue("--mono") || MONO;
    DISPLAY = css.getPropertyValue("--display") || DISPLAY;
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    // The field rests while nobody can see it: scrolled away, behind the result at the end, or under a dialog.
    let frame = 0;
    let shown = true;
    let covered = false;
    let looked = 0;
    const sight = new IntersectionObserver(([e]) => (shown = e.isIntersecting));
    sight.observe(el);
    const moved = () => (placed.current = null);
    addEventListener("scroll", moved, { capture: true, passive: true });
    addEventListener("resize", moved);
    // The next frame is asked for first, so a frame that goes wrong is skipped rather than stopping the field for good.
    let told = false;
    const loop = (t: number) => {
      frame = requestAnimationFrame(loop);
      if (t - looked > 400) {
        looked = t;
        // Only the game's own dialogs count: a browser extension's own .modal must never stop the field.
        covered = !!document.querySelector(".app .debrief, .app > .modal, .app .cutscene");
      }
      if (document.hidden || !shown || covered) return;
      try {
        draw();
      } catch (err) {
        if (!told) console.error("The field skipped a frame:", err);
        told = true;
        canvas.current?.getContext("2d")?.reset();
      }
    };
    frame = requestAnimationFrame(loop);
    return () => {
      observer.disconnect();
      sight.disconnect();
      removeEventListener("scroll", moved, { capture: true });
      removeEventListener("resize", moved);
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
