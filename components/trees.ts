// Clay trees for the meadow, built from the same rounded parts as the kids and ghosts: round crowns heaped from lumps of leaves,
// autumn colours, dark firs in stacked tiers, a pale birch, a forked tree, a windswept tree, a weeping willow and a sapling. Each
// stands two to three times a kid's height, drawn from the foot of its trunk.

import { bone, part, render, type Figure, type Part, type RGB, type V } from "./clay";

// How many kinds of tree there are.
export const TREES = 12;

// Lumps on the top and front of a crown are a little paler.
const PALER: V = [0.23, 0.23, 0.76];

const BARK: RGB = [94, 66, 52];
const DARK_BARK: RGB = [70, 52, 46];
const GREY_BARK: RGB = [116, 110, 108];
const BIRCH: RGB = [232, 228, 216];
const BIRCH_FOOT: RGB = [124, 118, 112];
const MARK: RGB = [46, 42, 48];
const STAKE: RGB = [176, 140, 96];
const TIE: RGB = [70, 60, 58];

const FOREST: RGB[] = [
  [46, 92, 60],
  [38, 80, 54],
  [56, 102, 64],
];
const TEAL: RGB[] = [
  [36, 98, 86],
  [30, 84, 78],
  [46, 110, 94],
];
const OLIVE: RGB[] = [
  [96, 92, 40],
  [82, 80, 36],
  [108, 100, 44],
];
const ORANGE: RGB[] = [
  [206, 102, 40],
  [188, 84, 36],
  [222, 126, 50],
];
const RUST: RGB[] = [
  [162, 60, 42],
  [142, 48, 40],
  [178, 78, 46],
];
const MUSTARD: RGB[] = [
  [204, 150, 44],
  [186, 132, 38],
  [216, 168, 58],
];
const GOLD: RGB[] = [
  [230, 192, 74],
  [216, 172, 60],
  [238, 208, 98],
];
const FIR: RGB[] = [
  [34, 76, 70],
  [28, 66, 62],
  [40, 86, 76],
];
const SPRUCE: RGB[] = [
  [30, 60, 70],
  [26, 52, 62],
  [36, 70, 78],
];
const WILLOW: RGB[] = [
  [56, 106, 96],
  [46, 92, 86],
  [66, 118, 104],
];
const EMBER: RGB[] = [
  [214, 82, 46],
  [196, 66, 42],
  [228, 106, 56],
];
const COPPER: RGB[] = [
  [112, 48, 64],
  [96, 40, 58],
  [128, 58, 70],
];

// A steady number from 0 to 1 for a tree and a key, so the same tree always comes out the same.
function hash(seed: number, key: number) {
  const s = Math.sin(seed * 127.1 + key * 311.7 + 17.3) * 43758.5453;
  return s - Math.floor(s);
}
const tint = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const yaw = (a: number) => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];

// The trunk leans a little, a different way for each tree: where its middle is at a height, nudged across by dx and dy.
function leaning(seed: number, most: number) {
  const a = hash(seed, 1) * Math.PI * 2;
  const k = most * (0.4 + hash(seed, 2) * 0.6);
  return (z: number, dx = 0, dy = 0): V => [Math.cos(a) * k * z + dx, Math.sin(a) * k * z + dy, z];
}

// A trunk or bough through a run of points, its width at each stretch, the stretches overlapping so the joins stay smooth.
function stem(points: V[], widths: number[], bark: RGB): Part[] {
  return widths.map((w, i) => {
    const a = points[i];
    const b = points[i + 1];
    const d: V = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const back = i ? 0.1 : 0;
    const on = i < widths.length - 1 ? 0.2 : 0;
    return bone([a[0] - d[0] * back, a[1] - d[1] * back, a[2] - d[2] * back], [b[0] + d[0] * on, b[1] + d[1] * on, b[2] + d[2] * on], w, bark);
  });
}

// The flare at the foot of a trunk, and roots spreading from it into the grass.
function foot(w: number, reach: number, n: number, bark: RGB, seed: number): Part[] {
  const parts = [part([0, 0, w * 0.9], [w * 1.4, w * 1.4, w * 1.1], bark)];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash(seed, 10 + i) * 0.9;
    const d = reach * (0.8 + hash(seed, 20 + i) * 0.45);
    parts.push(bone([Math.cos(a) * w * 0.3, Math.sin(a) * w * 0.3, w * 1.5], [Math.cos(a) * d, Math.sin(a) * d, w * 0.25], w * 0.5, bark));
  }
  return parts;
}

// A crown heaped from lumps of leaves round a dark heart, spiralling up from just under its middle to the top, the lumps on
// the top and front a touch paler.
function crown(c: V, size: V, n: number, lump: number, leaves: RGB[], seed: number): Part[] {
  const parts = [part(c, [size[0] * 0.8, size[1] * 0.8, size[2] * 0.8], tint(leaves[1], 0.86))];
  const turn = hash(seed, 30) * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const z = Math.min(0.88, -0.32 + ((i + 0.5) / n) * 1.3 + (hash(seed, 40 + i) - 0.5) * 0.18);
    const ring = Math.sqrt(1 - z * z);
    const a = turn + i * 2.39996 + (hash(seed, 60 + i) - 0.5) * 0.8;
    const d: V = [Math.cos(a) * ring, Math.sin(a) * ring, z];
    const s = lump * (0.78 + hash(seed, 80 + i) * 0.44);
    const out = (k: number) => size[k] - s * (0.45 + hash(seed, 140 + i) * 0.35);
    const facing = d[0] * PALER[0] + d[1] * PALER[1] + d[2] * PALER[2];
    const color = tint(leaves[Math.floor(hash(seed, 100 + i) * leaves.length)], 0.95 + facing * 0.08);
    parts.push(part([c[0] + d[0] * out(0), c[1] + d[1] * out(1), c[2] + d[2] * out(2)], [s, s * (0.9 + hash(seed, 120 + i) * 0.2), s * 0.86], color, yaw(a)));
  }
  return parts;
}

// A broadleaf tree: a trunk with a few boughs reaching up into a crown of lumps.
type Broad = {
  bark: RGB;
  leaves: RGB[];
  girth: number;
  roots: number;
  lean: number;
  crown: number;
  size: V;
  lumps: number;
  lump: number;
  boughs: [number, number, number, number][];
};
function broadleaf(seed: number, o: Broad): Part[] {
  const up = leaning(seed, o.lean);
  const j = (k: number) => hash(seed, k) - 0.5;
  const neck = o.crown - o.size[2] * 0.35;
  const parts = [...foot(o.girth, o.girth * 2.1, o.roots, o.bark, seed), ...stem([up(0), up(neck * 0.45, j(3) * 0.6, j(4) * 0.6), up(neck)], [o.girth, o.girth * 0.8], o.bark)];
  for (const [from, dx, dy, to] of o.boughs) parts.push(bone(up(from), up(to, dx + j(5) * 2, dy + j(6) * 2), o.girth * 0.4, o.bark));
  const size: V = [o.size[0] * (1 + j(7) * 0.14), o.size[1] * (1 + j(8) * 0.14), o.size[2]];
  return [...parts, ...crown(up(o.crown, j(9) * 2, j(10) * 2), size, o.lumps, o.lump, o.leaves, seed)];
}

// A conifer: a short trunk under whorls of boughs, each a wide flat skirt with a narrower round above it, every whorl
// narrower than the one below, and a spire on top.
function conifer(seed: number, leaves: RGB[], whorls: number, low: number, high: number, wide: number, narrow: number, lean: number): Part[] {
  const up = leaning(seed, lean);
  const parts = [...foot(1.7, 3.4, 3, DARK_BARK, seed), bone(up(0), up(low + 2), 1.6, DARK_BARK)];
  const step = (high - low) / (whorls - 1);
  for (let i = 0; i < whorls; i++) {
    const t = i / (whorls - 1);
    const r = wide + (narrow - wide) * t;
    const j = hash(seed, 200 + i) - 0.5;
    const k = hash(seed, 220 + i) - 0.5;
    const z = low + step * i;
    parts.push(part(up(z, j * 0.8, k * 0.8), [r * (1 + j * 0.14), r * (1 - j * 0.14), r * 0.26 + 0.7], tint(leaves[1], 0.96 + t * 0.08), yaw(k * 3)));
    parts.push(part(up(z + step * 0.42, j * 0.5, k * 0.5), [r * 0.58, r * 0.58, step * 0.5], tint(leaves[i % 2 ? 0 : 2], 0.96 + t * 0.08)));
  }
  parts.push(part(up(high + step * 0.75), [narrow * 0.42, narrow * 0.42, step * 0.6], leaves[2]));
  parts.push(bone(up(high + step * 1.1), up(high + step * 1.8), 0.45, leaves[2]));
  return parts;
}

// A slim birch: a pale trunk with dark marks and a thinner second stem, and a light, airy crown in clumps along the tops.
function birch(seed: number): Part[] {
  const j = (k: number) => hash(seed, k) - 0.5;
  const main: V[] = [
    [0, 0, 0],
    [0.4 + j(3), -0.3, 14],
    [1.6, -1 + j(4), 28],
    [2.8 + j(5), -1.4, 43],
  ];
  const second: V[] = [
    [-0.3, 0.4, 1],
    [-2.2, 2.6 + j(6), 13],
    [-4.6 + j(7), 4.8, 29],
  ];
  const parts = [...foot(1.25, 2.6, 3, BIRCH_FOOT, seed), ...stem(main, [1.25, 1.05, 0.8], BIRCH), ...stem(second, [0.85, 0.65], BIRCH)];
  parts.push(bone([1.5, -1, 26], [6.5, -4.6, 34], 0.38, BIRCH), bone([1, -0.7, 21], [-2.6, 0.8, 31], 0.34, BIRCH));
  const marks: [V[], number, number, number][] = [
    [main, 0, 0.12, 1.2],
    [main, 0, 0.3, 1.15],
    [main, 0, 0.55, 1.1],
    [main, 1, 0.2, 1],
    [main, 1, 0.65, 0.9],
    [main, 2, 0.3, 0.75],
    [second, 0, 0.4, 0.8],
    [second, 1, 0.3, 0.65],
  ];
  marks.forEach(([line, k, t, w], i) => {
    const a = line[k];
    const b = line[k + 1];
    const side = Math.PI / 4 + (i % 2 ? 0.7 : -0.6) + j(300 + i) * 0.4;
    const c: V = [a[0] + (b[0] - a[0]) * t + Math.cos(side) * w * 0.72, a[1] + (b[1] - a[1]) * t + Math.sin(side) * w * 0.72, a[2] + (b[2] - a[2]) * t];
    parts.push(part(c, [w * 0.72, w * 0.72, 0.28], MARK));
  });
  parts.push(...crown([2.6, -1.4, 40], [9, 9, 8], 8, 4.2, GOLD, seed));
  parts.push(...crown([-4.8, 4.8, 30.5], [5.4, 5.4, 4.8], 4, 3, GOLD, seed + 1).slice(1));
  parts.push(part([6.8, -4.8, 34.5], [3, 3, 2.5], GOLD[0]), part([-2.8, 1, 31.5], [2.6, 2.6, 2.2], GOLD[2]));
  return parts;
}

// A tree forked low into two leaders, each carrying its own crown, the two crowns meeting in the middle.
function forked(seed: number): Part[] {
  const up = leaning(seed, 0.05);
  const j = (k: number) => hash(seed, k) - 0.5;
  const fork = up(16);
  const left = up(32, -4.6 + j(3) * 1.5, 4.2);
  const right = up(34, 4.6, -4.2 + j(4) * 1.5);
  const parts = [...foot(2.3, 4.8, 4, BARK, seed), ...stem([up(0), up(8, j(5) * 0.6, j(6) * 0.6), fork], [2.3, 2], BARK), part(fork, [2.1, 2.1, 2.6], BARK)];
  parts.push(bone(up(13), left, 1.45, BARK), bone(up(13), right, 1.5, BARK));
  parts.push(...crown([left[0] - 0.5, left[1] + 0.5, 37], [9.5, 9.5, 8.5], 7, 5.2, MUSTARD, seed));
  parts.push(...crown([right[0] + 0.5, right[1] - 0.5, 40 + j(7) * 2], [10, 10, 9], 7, 5.4, MUSTARD, seed + 3));
  return parts;
}

// A tree bent by the wind: the trunk curving away across the meadow and the crown streaming after it, a dead limb on the
// windward side.
function windswept(seed: number): Part[] {
  const j = (k: number) => hash(seed, k) - 0.5;
  const pull = 1 + j(3) * 0.2;
  const parts = [
    ...foot(2.1, 4.6, 4, BARK, seed),
    ...stem(
      [
        [0, 0, 0],
        [1.4 * pull, -1.4 * pull, 12],
        [4.4 * pull, -4.4 * pull, 23],
        [9 * pull, -9 * pull, 31],
      ],
      [2.1, 1.7, 1.3],
      BARK,
    ),
    bone([2.4, -2.4, 18], [-3.4, 2.6, 27 + j(4) * 3], 0.55, GREY_BARK),
    bone([-3.4, 2.6, 27 + j(4) * 3], [-5.6, 3.4, 31 + j(4) * 3], 0.32, GREY_BARK),
  ];
  parts.push(...crown([5.5 * pull, -5.5 * pull, 38], [8.5, 8.5, 8], 6, 5.2, OLIVE, seed));
  parts.push(...crown([14 * pull, -14 * pull, 35 + j(5) * 2], [8, 8, 6.5], 5, 4.6, OLIVE, seed + 7));
  return parts;
}

// A flat strand of leaves from one point to another, broad across the picture and thin through.
function strand(a: V, b: V, broad: number, thin: number, color: RGB): Part {
  const d: V = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const half = Math.hypot(d[0], d[1], d[2]) / 2;
  const z: V = [d[0] / (half * 2), d[1] / (half * 2), d[2] / (half * 2)];
  const k = (z[0] - z[1]) * Math.SQRT1_2;
  const across: V = [Math.SQRT1_2 - k * z[0], -Math.SQRT1_2 - k * z[1], -k * z[2]];
  const l = Math.hypot(across[0], across[1], across[2]);
  const x: V = [across[0] / l, across[1] / l, across[2] / l];
  const y: V = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return part([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [broad, thin, half + thin * 0.5], color, [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]]);
}

// A weeping willow: a stout leaning trunk, a dome of leaves, and long strands arching out and hanging nearly to the grass, parted
// at the front, with the strands at the back in shade behind.
function willow(seed: number): Part[] {
  const up = leaning(seed, 0.07);
  const j = (k: number) => hash(seed, k) - 0.5;
  const parts = [...foot(2.4, 5, 3, DARK_BARK, seed), ...stem([up(0), up(14, j(3), j(4)), up(31)], [2.4, 1.9], DARK_BARK)];
  const top = up(38, j(5), j(6));
  parts.push(part([top[0] - 6.5, top[1] - 6.5, top[2] - 11], [9, 9, 12], tint(WILLOW[1], 0.8)));
  parts.push(...crown(top, [12.5, 12.5, 7], 7, 5.4, WILLOW, seed));
  for (let i = 0; i < 12; i++) {
    const a = Math.PI / 4 + 0.55 + (i / 11) * (Math.PI * 2 - 1.1) + j(400 + i) * 0.2;
    const r = 9.5 + j(420 + i) * 2.4;
    const out = (d: number, z: number): V => [top[0] + Math.cos(a) * d, top[1] + Math.sin(a) * d, top[2] + z];
    const leaf = tint(WILLOW[i % 3], 0.94);
    const mid = out(r + 3, -10);
    parts.push(strand(out(r, -1), mid, 2.6, 1.3, leaf), strand(mid, out(r + 3.6, -21 - (i % 2) * 4 - j(440 + i) * 4), 2.1, 1, leaf));
  }
  return parts;
}

// A young sapling tied to a stake, with a small round crown.
function sapling(seed: number): Part[] {
  const j = (k: number) => hash(seed, k) - 0.5;
  const tip: V = [0.8 + j(3), -0.6 + j(4), 22];
  const parts = [...foot(0.75, 1.9, 3, BARK, seed), ...stem([[0, 0, 0], [0.3, -0.2, 11], tip], [0.75, 0.55], BARK)];
  parts.push(bone([-1.7, 1.5, 0], [-1.7, 1.5, 18], 0.5, STAKE), part([-0.7, 0.6, 15], [1.4, 0.55, 0.38], TIE, yaw(-Math.PI / 4)));
  parts.push(bone([0.5, -0.4, 16], [3.6, -3.2, 21], 0.3, BARK), bone([0.4, -0.2, 14], [-2.4, 1.6, 19], 0.28, BARK));
  parts.push(...crown([tip[0], tip[1], 25], [6, 6, 5.6], 6, 3.1, EMBER, seed));
  return parts;
}

// The kinds in order: a green oak, an orange maple, a fir, a birch, a tall blue green crown, a broad rust red oak, a dark spruce,
// a windswept olive tree, a forked mustard tree, a willow, a sapling and a copper beech.
const KINDS: ((seed: number) => Part[])[] = [
  (s) => broadleaf(s, { bark: BARK, leaves: FOREST, girth: 2.3, roots: 4, lean: 0.08, crown: 37, size: [13, 13, 11], lumps: 10, lump: 6.2, boughs: [[17, 6, -4, 27], [15, -5, 5, 26]] }),
  (s) => broadleaf(s, { bark: DARK_BARK, leaves: ORANGE, girth: 2, roots: 4, lean: 0.06, crown: 38, size: [11.5, 11.5, 14], lumps: 11, lump: 5.6, boughs: [[14, -4.5, 3, 30], [15, 3.5, -3.5, 31]] }),
  (s) => conifer(s, FIR, 5, 13, 43, 11.5, 4, 0.03),
  birch,
  (s) => broadleaf(s, { bark: BARK, leaves: TEAL, girth: 1.8, roots: 4, lean: 0.04, crown: 34, size: [8.5, 8.5, 19], lumps: 11, lump: 4.8, boughs: [[12, 3, -3, 20]] }),
  (s) => broadleaf(s, { bark: DARK_BARK, leaves: RUST, girth: 2.6, roots: 5, lean: 0.05, crown: 33, size: [17, 17, 9.5], lumps: 12, lump: 6, boughs: [[11, -7, 5, 25], [12, 7, -6, 26], [12, -2, -5, 25]] }),
  (s) => conifer(s, SPRUCE, 7, 11, 47, 8.5, 2.8, 0.05),
  windswept,
  forked,
  willow,
  sapling,
  (s) => broadleaf(s, { bark: GREY_BARK, leaves: COPPER, girth: 2.6, roots: 5, lean: 0.05, crown: 38, size: [14, 14, 12.5], lumps: 12, lump: 6.2, boughs: [[16, 6, -5, 28], [17, -5, 6, 29]] }),
];

// How far a part reaches from its middle along a direction in the picture.
function reach(p: Part, d: V) {
  const m = p.m;
  return Math.hypot(...[0, 1, 2].map((i) => p.r[i] * (d[0] * m[i] + d[1] * m[3 + i] + d[2] * m[6 + i])));
}

// A tree at px pixels to a unit, drawn from the foot of its trunk on a canvas just big enough for it. Variants past the
// last kind come round again, shaped a little differently, a little bigger or smaller, and every other time the mirror image.
export function paintTree(px: number, variant: number): Figure {
  const kind = ((variant % TREES) + TREES) % TREES;
  const round = Math.floor(variant / TREES);
  const g = round ? 0.88 + hash(variant, 500) * 0.18 : 1;
  const flip = round % 2 !== 0;
  const parts = KINDS[kind](variant + 1).map((p) => {
    const c: V = flip ? [p.c[1], p.c[0], p.c[2]] : p.c;
    const m = flip ? [...p.m.slice(3, 6), ...p.m.slice(0, 3), ...p.m.slice(6)] : p.m;
    return { ...p, c: [c[0] * g, c[1] * g, c[2] * g] as V, r: [p.r[0] * g, p.r[1] * g, p.r[2] * g] as V, m };
  });
  let [l, r, t] = [0, 0, 0];
  for (const p of parts) {
    const sx = p.c[0] - p.c[1];
    const sy = (p.c[0] + p.c[1]) / 2 - p.c[2];
    const ex = reach(p, [1, -1, 0]);
    l = Math.min(l, sx - ex);
    r = Math.max(r, sx + ex);
    t = Math.min(t, sy - reach(p, [0.5, 0.5, -1]));
  }
  return render(parts, px, Math.ceil(-t) - 1, Math.ceil(-l) + 1, Math.ceil(r - l) + 2);
}
