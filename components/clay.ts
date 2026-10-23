// Clay figures built from rounded parts and seen from the field's isometric angle: the frightened kids, and the ghosts.
// Each part is an ellipsoid: every pixel looks along the view for the nearest one, lit in four hard bands the way plasticine
// catches the light, with darker edges and creases and a thin outline tinted from what it bounds. Glowing parts, eyes and
// lanterns, skip the bands and the edges.

export type V = [number, number, number];
export type RGB = [number, number, number];

export type Part = { c: V; r: V; m: number[]; color: RGB; glow?: boolean };
export type Figure = { canvas: HTMLCanvasElement; ox: number; oy: number; w: number; h: number };

const LIGHT: V = norm([-0.151, 0.557, 0.668]);
const LAMP: RGB = [250, 214, 120];

function norm(v: V): V {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

// A turn about the north-south axis: a limb swinging forward or back.
function pitch(a: number): number[] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}
const STILL = pitch(0);

export const part = (c: V, r: V, color: RGB, m = STILL): Part => ({ c, r, m, color });

// A limb hanging from a joint, swung by an angle: where it is, and where its far end gets to.
function limb(from: V, length: number, width: number, angle: number, color: RGB): { part: Part; end: V } {
  const axis: V = [Math.sin(angle), 0, Math.cos(angle)];
  const half = length / 2;
  const c: V = [from[0] - axis[0] * half, from[1], from[2] - axis[2] * half];
  return { part: part(c, [width, width, half + width * 0.35], color, pitch(angle)), end: [from[0] - axis[0] * length, from[1], from[2] - axis[2] * length] };
}

const lit = (c: RGB, k: number, warm = 0): RGB => [Math.min(248, c[0] * k + warm * 10), Math.min(248, c[1] * k + warm * 9), Math.min(248, c[2] * k + warm * 7)];

// The picture: a canvas at px pixels to a model unit, with the feet at (ox, oy).
export function render(parts: Part[], px: number, top: number, left: number, wide: number): Figure {
  const w = Math.ceil(wide * px);
  const h = Math.ceil((top + 8) * px);
  const ox = Math.round(left * px);
  const oy = Math.round((top + 2) * px);
  const depth = new Float32Array(w * h).fill(-Infinity);
  const owner = new Int16Array(w * h).fill(-1);
  const color = new Float32Array(w * h * 3);
  // The view runs along (1, 1, 1): a pixel's ray is every point whose screen position is that pixel's. In a part's own
  // terms, where the ray starts is a sum of the pixel's screen position, so that is worked out once for each part,
  // along with the patch of the picture the part can cover.
  const local = parts.map((p, i) => {
    const { c, r, m } = p;
    const k = [0, 1, 2].map((i): V => [m[i] / r[i], m[3 + i] / r[i], m[6 + i] / r[i]]);
    const reach = (d: V) => Math.hypot(...[0, 1, 2].map((i) => r[i] * (d[0] * m[i] + d[1] * m[3 + i] + d[2] * m[6 + i])));
    const sx = c[0] - c[1];
    const sy = (c[0] + c[1]) / 2 - c[2];
    const ex = reach([1, -1, 0]);
    const ey = reach([0.5, 0.5, -1]);
    const dl = k.map((v) => (v[0] + v[1] + v[2]) / 2);
    return {
      p,
      i,
      f: [...k.map((v) => (v[0] - v[1]) / 2), ...k.map((v) => -v[2]), ...k.map((v) => -(v[0] * c[0] + v[1] * c[1] + v[2] * c[2])), ...dl],
      a: dl[0] * dl[0] + dl[1] * dl[1] + dl[2] * dl[2],
      x0: Math.floor(ox + (sx - ex) * px) - 1,
      x1: Math.ceil(ox + (sx + ex) * px) + 1,
      y0: Math.floor(oy + (sy - ey) * px) - 1,
      y1: Math.ceil(oy + (sy + ey) * px) + 1,
    };
  });

  for (let y = 0; y < h; y++) {
    const row = local.filter((l) => l.y0 <= y && l.y1 >= y);
    if (!row.length) continue;
    const sy = (y + 0.5 - oy) / px;
    for (let x = 0; x < w; x++) {
      const sx = (x + 0.5 - ox) / px;
      let best = -Infinity;
      let who = -1;
      let q0 = 0;
      let q1 = 0;
      let q2 = 0;
      for (const l of row) {
        if (x < l.x0 || x > l.x1) continue;
        const f = l.f;
        const o0 = f[0] * sx + f[3] * sy + f[6];
        const o1 = f[1] * sx + f[4] * sy + f[7];
        const o2 = f[2] * sx + f[5] * sy + f[8];
        const b = 2 * (o0 * f[9] + o1 * f[10] + o2 * f[11]);
        const c = o0 * o0 + o1 * o1 + o2 * o2 - 1;
        const disc = b * b - 4 * l.a * c;
        if (disc < 0) continue;
        const u = (-b + Math.sqrt(disc)) / (2 * l.a);
        if (u <= best) continue;
        best = u;
        who = l.i;
        q0 = o0 + u * f[9];
        q1 = o1 + u * f[10];
        q2 = o2 + u * f[11];
      }
      if (who < 0) continue;
      const { p } = local[who];
      const m = p.m;
      const nl: V = [q0 / p.r[0], q1 / p.r[1], q2 / p.r[2]];
      const n = norm([m[0] * nl[0] + m[1] * nl[1] + m[2] * nl[2], m[3] * nl[0] + m[4] * nl[1] + m[5] * nl[2], m[6] * nl[0] + m[7] * nl[1] + m[8] * nl[2]]);
      const l = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
      const c = p.glow
        ? n[0] + n[1] + n[2] > 1.3 ? lit(p.color, 1.04, 6) : p.color
        : l > 0.62 ? lit(p.color, 1.1, 1) : l > 0.26 ? lit(p.color, 1) : l > -0.05 ? lit(p.color, 0.88) : lit(p.color, 0.78);
      const i = y * w + x;
      depth[i] = best;
      owner[i] = who;
      color.set(c, i * 3);
    }
  }

  const img = new ImageData(w, h);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x);
  const edgeW = Math.max(1, Math.round(px / 2.2));
  const near = [
    [edgeW, 0],
    [-edgeW, 0],
    [0, edgeW],
    [0, -edgeW],
  ];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const who = owner[i];
      let from = i;
      let k = 1;
      if (who >= 0 && !parts[who].glow) {
        let edge = false;
        let crease = false;
        for (const [dx, dy] of near) {
          const j = at(x + dx, y + dy);
          if (j < 0 || owner[j] < 0) edge = true;
          else if (owner[j] !== who && depth[j] > depth[i] + 0.6) crease = true;
        }
        k = edge ? 0.84 : crease ? 0.76 : 1;
      } else if (who < 0) {
        from = -1;
        for (const [dx, dy] of near) {
          const j = at(x + dx, y + dy);
          if (j >= 0 && owner[j] >= 0) {
            from = j;
            break;
          }
        }
        if (from < 0) continue;
      }
      const o = i * 4;
      if (who >= 0) {
        img.data[o] = color[i * 3] * k;
        img.data[o + 1] = color[i * 3 + 1] * k;
        img.data[o + 2] = color[i * 3 + 2] * k;
      } else {
        img.data[o] = color[from * 3] * 0.3 + 10;
        img.data[o + 1] = color[from * 3 + 1] * 0.26 + 6;
        img.data[o + 2] = color[from * 3 + 2] * 0.28 + 8;
      }
      img.data[o + 3] = 255;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.putImageData(img, 0, 0);
  return { canvas, ox, oy, w, h };
}

// A turn taking a part's third radius along a direction, and a part stretched from one point to another.
function toward(d: V): number[] {
  const z = norm(d);
  const x = Math.abs(z[2]) > 0.95 ? norm([z[2], 0, -z[0]]) : norm([-z[1], z[0], 0]);
  const y: V = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}

export function bone(a: V, b: V, w: number, color: RGB): Part {
  const d: V = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const half = Math.hypot(d[0], d[1], d[2]) / 2;
  return part([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], [w, w, half + w * 0.35], color, toward(d));
}

// A turn about the up axis, two turns one after the other, and a point turned.
const yaw = (a: number) => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
const times = (a: number[], b: number[]) => [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => a[i - (i % 3)] * b[i % 3] + a[i - (i % 3) + 1] * b[(i % 3) + 3] + a[i - (i % 3) + 2] * b[(i % 3) + 6]);
const turned = (m: number[], v: V): V => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];

// The ghosts face whoever is looking: f toward them, s across to the right of the picture, z up.
const FACE = norm([1, 1, 0]);
const ACROSS = norm([1, -1, 0]);
const spot = (f: number, s: number, z: number): V => [FACE[0] * f + ACROSS[0] * s, FACE[1] * f + ACROSS[1] * s, z];
const FACING = [FACE[0], ACROSS[0], 0, FACE[1], ACROSS[1], 0, 0, 0, 1];
const lump = (f: number, s: number, z: number, r: V, color: RGB, glow = false): Part => ({ c: spot(f, s, z), r, m: FACING, color, glow });
const nudge = (v: V, f: number, s: number, z: number): V => {
  const d = spot(f, s, z);
  return [v[0] + d[0], v[1] + d[1], v[2] + d[2]];
};

const INK: RGB = [34, 28, 40];
const SHINE: RGB = [246, 248, 250];
const BLUSH: RGB = [246, 150, 164];
const HOLLOW: RGB = [30, 22, 42];
const EMBER: RGB = [252, 232, 116];
const TEETH: RGB = [248, 246, 232];
const TONGUE: RGB = [226, 92, 104];

export type GhostKind = "wisp" | "spectre" | "poltergeist";

// The wisp: a round little head running down into a curl of flame, two big eyes, nubs for arms.
function wisp(body: RGB, phase: number, boo: boolean): Part[] {
  const parts: Part[] = [];
  const flare = boo ? 1.3 : 1;
  const tail: [number, number, number, number][] = [
    [0, 0, 9.6, 3.3],
    [-0.3, 0.6, 6.2, 2.3],
    [-0.6, 2.2, 3.4, 1.5],
    [-0.8, 4, 3.4, 0.95],
    [-0.9, 5.2, 5.4, 0.55],
    [-0.8, 5.6, 7.4, 0],
  ];
  const curl = tail.map(([f, s, z], i) => spot(f + Math.cos(phase - i * 0.9) * 0.2 * i, s + Math.sin(phase - i * 0.9) * 0.3 * i * flare, z + (boo ? i * 0.45 : 0)));
  for (let i = 0; i < curl.length - 1; i++) parts.push(bone(curl[i], curl[i + 1], tail[i][3] * (i ? flare : 1), body));
  parts.push(lump(0, 0, 11.2, [3.9, 4.1, 3.9], body));
  const tuft = spot(-0.9, 1.3 + Math.sin(phase) * 0.4, boo ? 17.2 : 16.3);
  parts.push(bone(spot(-0.5, 0.3, 14.3), tuft, boo ? 1.05 : 0.85, body));
  if (boo) parts.push(bone(spot(-0.5, -0.4, 14.3), spot(-0.8, -1.6 - Math.sin(phase) * 0.4, 16.3), 0.8, body));
  for (const s of [-1, 1]) {
    parts.push(lump(0.8, s * 4.1, boo ? 11.8 : 9.4 + Math.sin(phase + s) * 0.3, [0.9, 0.95, 0.8], body));
    parts.push(lump(3.15, s * 2.75, 10, [0.5, 0.75, 0.42], BLUSH));
    parts.push(lump(3.2, s * 1.55, 11.4, [0.75, 1.1, 1.35], INK));
    parts.push(lump(3.85, s * 1.55 - 0.4, 11.9, [0.3, 0.38, 0.4], SHINE));
  }
  parts.push(boo ? lump(2.9, 0, 9.1, [0.8, 1, 1.25], INK) : lump(3.3, 0, 9.4, [0.4, 0.55, 0.45], INK));
  return parts;
}

// The spectre: tall and hooded, two embers for eyes in the dark of the hood, long sleeves reaching out and a ragged hem.
function spectre(body: RGB, phase: number, boo: boolean): Part[] {
  const parts: Part[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.15;
    const sway = Math.sin(phase + i * 2.3);
    const len = i % 2 ? 1.4 : 2.2;
    const top = spot(Math.cos(a) * 2.9 - 0.4, Math.sin(a) * 3.5, 3.6);
    const mid = nudge(top, Math.cos(a) * 0.5 - sway * 0.25, Math.sin(a) * 0.6 + sway * 0.2, -len * 0.7);
    parts.push(bone(top, mid, 1, body), bone(mid, nudge(mid, Math.cos(a) * 0.3 - sway * 0.35, Math.sin(a) * 0.3 + sway * 0.2, -len * 0.6), 0.45, body));
  }
  parts.push(lump(-0.4, 0, 4.6, [3.2, 3.9, 2.6], body));
  parts.push(lump(-0.3, 0, 7.4, [2.8, 3.4, 4.6], body));
  parts.push(lump(-0.1, 0, 10.6, [2.3, 3.3, 1.7], body));
  parts.push(lump(0, 0, 13.3, [3, 2.9, 2.8], body));
  parts.push(bone(spot(-0.4, 0, 15), spot(-2, 0.3 + Math.sin(phase) * 0.2, 17.1), 1, body));
  parts.push(lump(1.6, 0, 13, [1.6, 1.8, 2.2], HOLLOW));
  for (const s of [-1, 1]) {
    parts.push(bone(spot(2.1, s * 1.95, 11), spot(2.4, s * 1.55, 14.2), 0.55, body));
    parts.push(bone(spot(2.4, s * 1.55, 14.2), spot(2.55, 0, 15.4), 0.55, body));
    parts.push(lump(2.85, s * 0.72, 13.2, boo ? [0.5, 0.55, 0.75] : [0.4, 0.42, 0.58], EMBER, true));
    const shoulder = spot(0.2, s * 3, 10.8);
    const cuff = boo ? spot(2.2, s * 5.6, 14.6) : spot(3.6, s * 4.6, 11 + Math.sin(phase + s) * 0.3);
    const sway = Math.sin(phase + s * 1.3) * 0.4;
    const hang = nudge(cuff, -0.2 - sway * 0.5, s * 0.2, -2.4);
    parts.push(bone(shoulder, cuff, 0.95, body), bone(cuff, hang, 1.1, body), bone(hang, nudge(hang, -sway, 0, -1.8), 0.5, body));
    const reach = norm([cuff[0] - shoulder[0], cuff[1] - shoulder[1], cuff[2] - shoulder[2]]);
    parts.push(part([cuff[0] + reach[0] * 0.5, cuff[1] + reach[1] * 0.5, cuff[2] + reach[2] * 0.5], [0.62, 0.62, 0.25], HOLLOW, toward(reach)));
  }
  if (boo) parts.push(lump(2.7, 0, 11.9, [0.4, 0.5, 0.55], EMBER, true));
  return parts;
}

// The boltergeist: Strike's mint dragon come back as a ghost. A big round head with a snout pushed forward, wide eyes under heavy
// brows, black horns and a crest of spikes down its back, little clawed fists, a ghost's sheet trailing away beneath, and a bolt of
// lightning circling it.
const DRAGON: RGB = [112, 232, 186];
const DEEP: RGB = [16, 116, 90];
const HORN: RGB = [34, 40, 50];
function boltergeist(body: RGB, phase: number, boo: boolean): Part[] {
  const parts: Part[] = [];
  let grip: V = [0, 0, 0];
  const skin: RGB = [body[0] * 0.45 + DRAGON[0] * 0.55, body[1] * 0.45 + DRAGON[1] * 0.55, body[2] * 0.45 + DRAGON[2] * 0.55];
  const belly: RGB = lit(skin, 1.12, 1);
  const crest: RGB = [skin[0] * 0.62, skin[1] * 0.78, skin[2] * 0.72];
  for (let i = 0; i < 8; i++) {
    const a = ((i + phase / (Math.PI * 2)) / 8) * Math.PI * 2;
    parts.push(lump(Math.cos(a) * 3.4, Math.sin(a) * 4.2, 2.8 + Math.sin(phase + i * 2.4) * 0.5, [1.5, 1.5, 1.5], skin));
  }
  parts.push(bone(spot(-1.2, 0, 3.2), spot(-3.6, 1.4 + Math.sin(phase) * 0.6, 1.2), 1.1, skin));
  parts.push(lump(0, 0, 6.8, [3.9, 4.7, 4.3], skin));
  parts.push(lump(2.3, 0, 6.6, [1.8, 3, 3.3], belly));
  parts.push(lump(0.4, 0, 12, [3.9, 4.4, 3.7], skin));
  parts.push(lump(3.4, 0, 11.1, [2.7, 2.7, 2], skin));
  for (const s of [-1, 1]) {
    parts.push(lump(5.75, s * 0.85, 11.9, [0.3, 0.35, 0.3], INK));
    parts.push(lump(2.75, s * 1.95, 13.5, [0.95, 1.15, 1.4], SHINE));
    parts.push(lump(3.45, s * 1.85, 13.3, [0.5, 0.68, 0.85], DEEP));
    parts.push(lump(3.85, s * 1.8, 13.4, [0.26, 0.34, 0.5], INK));
    parts.push(lump(4.05, s * 1.65, 13.85, [0.14, 0.14, 0.14], SHINE));
    parts.push(bone(spot(3.1, s * 0.7, 14.9), spot(2.4, s * 3.1, 15.6 - (boo ? 0.5 : 0)), 0.55, HORN));
    parts.push(bone(spot(-0.4, s * 2.1, 15), spot(-1.5, s * 2.9, 17), 0.7, HORN));
    parts.push(bone(spot(-1.5, s * 2.9, 17), spot(-2.2, s * 3, 17.8), 0.35, HORN));
    const shoulder = spot(0.6, s * 4.2, 8.6);
    const fist = boo ? spot(2, s * 6.6, 13.4) : spot(1.8, s * 5.8, 10.6 + s * Math.sin(phase) * 0.5);
    parts.push(bone(shoulder, fist, 1.05, skin));
    parts.push(part(fist, [1.1, 1.1, 1.05], skin));
    for (const c of [-0.45, 0.45]) parts.push(part(nudge(fist, 0.9, c * s, 0.35), [0.22, 0.22, 0.32], HORN));
    if (s > 0) grip = fist;
  }
  for (const [f, z, w] of [
    [-3.6, 14.4, 0.75],
    [-4.2, 12.2, 0.7],
    [-4.4, 9.8, 0.62],
    [-4.2, 7.4, 0.52],
  ]) parts.push(bone(spot(f + 1, 0, z), spot(f - 0.6, 0, z + 0.9), w, crest));
  parts.push(lump(4.3, 0, boo ? 9.6 : 9.9, [0.9, 1.9, boo ? 1.15 : 0.6], INK));
  parts.push(lump(4.5, 0.4, boo ? 9.1 : 9.6, [0.5, 0.9, 0.35], TONGUE));
  for (const t of [-1.1, 1.1]) parts.push(lump(4.95, t, 10.5, [0.25, 0.3, 0.38], TEETH));
  // A bolt of lightning held up in its right fist like a club, glowing.
  const zig: V[] = [nudge(grip, 0.2, 0.1, -1.4), nudge(grip, 0.1, 0.9, 1.4), nudge(grip, 0, -0.2, 2.2), nudge(grip, -0.1, 1, 5.2)];
  for (let i = 0; i < zig.length - 1; i++) parts.push({ ...bone(zig[i], zig[i + 1], boo ? 0.5 : 0.42, EMBER), glow: true });
  return parts;
}

// Each kind, and the room its picture needs left of its middle and across.
const SPOOKS: Record<GhostKind, [(body: RGB, phase: number, boo: boolean) => Part[], number, number]> = {
  wisp: [wisp, 9, 22],
  spectre: [spectre, 11, 22],
  poltergeist: [boltergeist, 13, 30],
};

// How many ways round a ghost can be turned: enough for it to spin smoothly.
export const ANGLES = 32;

// A ghost of a kind at px pixels to a unit: frame sets its sway, boo is it jumping out, and turn is how far round it has spun, in sixteenths.
// Turned at all, it needs as much room on one side as the other.
export function paintSpook(kind: GhostKind, body: RGB, px: number, frame: number, frames: number, boo = false, turn = 0): Figure {
  const [make, left, wide] = SPOOKS[kind];
  const parts = make(body, (frame / frames) * Math.PI * 2, boo);
  const a = ((turn % ANGLES) / ANGLES) * Math.PI * 2;
  if (!a) return render(parts, px, 19, left, wide);
  const r = yaw(a);
  const side = Math.max(left, wide - left);
  return render(
    parts.map((q) => ({ ...q, c: turned(r, q.c), m: times(r, q.m) })),
    px,
    19,
    side,
    side * 2,
  );
}

// The price: three frightened children huddled together walking east, the eldest holding a lantern out ahead.
type Child = { at: [number, number]; tall: number; turn: number; lag: number; hair: RGB; top: RGB; legs: RGB; style: "tuft" | "bunches" | "hat" };
const KID_SKIN: RGB = [238, 188, 152];
const SHOES: RGB = [72, 52, 48];
const HAT: RGB = [64, 186, 150];
const CHILDREN: Child[] = [
  { at: [3.1, -5.8], tall: 17.5, turn: 0.4, lag: 0, hair: [110, 66, 42], top: [228, 78, 62], legs: [64, 92, 168], style: "tuft" },
  { at: [-0.1, 0.1], tall: 15, turn: 0.7, lag: 0.7, hair: [74, 52, 58], top: [250, 196, 56], legs: [196, 74, 120], style: "bunches" },
  { at: [-2.8, 5.6], tall: 13, turn: 0.6, lag: 1.5, hair: [236, 128, 52], top: [84, 150, 226], legs: [70, 66, 92], style: "hat" },
];

const shoulderOf = (k: Child, side: number, bob: number): V => {
  const s = k.tall / 15;
  return [k.at[0] + 0.1 * s, k.at[1] + side * 1.9 * s, 8.4 * s + bob];
};

// Where the eldest's hand is, and the lantern hanging from it.
function kidsLantern3(bob: number): { hand: V; lamp: V } {
  const k = CHILDREN[0];
  const s = k.tall / 15;
  const hand: V = [k.at[0] + 4 * s, k.at[1] + 1.6 * s, 8.6 * s + bob];
  return { hand, lamp: [hand[0] + 0.1, hand[1], hand[2] - 2] };
}

// How far ahead of the children's feet, in model units, the middle one's torch lights the ground: where the price is.
export const KIDS_LEAD = 7;
const TORCH: RGB = [70, 74, 88];

// Where the middle child's hand is, and the torch in it shining ahead and down onto the ground.
function kidsTorch3(bob: number): { hand: V; tip: V } {
  const k = CHILDREN[1];
  const s = k.tall / 15;
  const hand: V = [k.at[0] + 2.8 * s, k.at[1] + 2.3 * s, 6.6 * s + bob];
  const d = norm([KIDS_LEAD - hand[0], -hand[1], -hand[2]]);
  return { hand, tip: [hand[0] + d[0] * 1.9, hand[1] + d[1] * 1.9, hand[2] + d[2] * 1.9] };
}

// A child: legs and arms swinging unless a hand is holding on somewhere, head turned a little, eyes wide and mouth open.
function child(k: Child, phase: number, reach: (V | null)[]): Part[] {
  const parts: Part[] = [];
  const s = k.tall / 15;
  const [x, y] = k.at;
  const swing = Math.sin(phase);
  const bob = Math.abs(Math.cos(phase)) * 0.3 * s;
  const hip = 4.2 * s + bob;
  for (const side of [-1, 1]) {
    const leg = limb([x, y + side * 0.85 * s, hip], 3.9 * s, 0.75 * s, swing * side * 0.5, k.legs);
    parts.push(leg.part, part([leg.end[0] + 0.45 * s, leg.end[1], Math.max(0.62 * s, leg.end[2] + 0.2 * s)], [1.05 * s, 0.78 * s, 0.62 * s], SHOES));
  }
  parts.push(part([x - 0.1 * s, y, hip + 0.8 * s], [1.9 * s, 2.15 * s, 1.5 * s], k.top));
  parts.push(part([x, y, hip + 2.9 * s], [1.7 * s, 1.95 * s, 2.1 * s], k.top));
  [-1, 1].forEach((side, i) => {
    const from = shoulderOf(k, side, bob);
    const to = reach[i];
    if (to) {
      parts.push(bone(from, to, 0.6 * s, k.top), part(to, [0.62 * s, 0.62 * s, 0.62 * s], KID_SKIN));
      return;
    }
    const arm = limb(from, 3.6 * s, 0.6 * s, -swing * side * 0.45, k.top);
    parts.push(arm.part, part(arm.end, [0.62 * s, 0.62 * s, 0.62 * s], KID_SKIN));
  });
  parts.push(...head(k, [x + 0.25 * s, y, 11.9 * s + bob]));
  return parts;
}

function head(k: Child, hc: V): Part[] {
  const s = k.tall / 15;
  const m = yaw(k.turn);
  const bit = (dx: number, dy: number, dz: number, a: number, b: number, c: number, color: RGB) => {
    const o = turned(m, [dx * s, dy * s, dz * s]);
    return part([hc[0] + o[0], hc[1] + o[1], hc[2] + o[2]], [a * s, b * s, c * s], color, m);
  };
  const parts = [bit(0, 0, 0, 2.75, 2.85, 2.75, KID_SKIN), bit(-0.45, 0, 0.45, 2.75, 2.95, 2.65, k.hair)];
  if (k.style === "hat") parts.push(bit(-0.2, 0, 1.6, 2.85, 2.95, 1.9, HAT), bit(-0.1, 0, 1.05, 2.95, 3.05, 0.55, SHINE), bit(-0.4, 0, 3.6, 0.8, 0.8, 0.8, SHINE));
  else parts.push(bit(1.6, 0, 1.7, 1.2, 2.3, 0.8, k.hair));
  if (k.style === "bunches") for (const side of [-1, 1]) parts.push(bit(-1, side * 2.8, 0.2, 0.95, 0.95, 1.05, k.hair));
  if (k.style === "tuft") parts.push(bit(-0.5, 0.2, 3, 0.7, 0.6, 0.9, k.hair));
  for (const side of [-1, 1]) parts.push(bit(2.15, side * 1, -0.05, 0.66, 0.8, 1, SHINE), bit(2.78, side * 1, -0.15, 0.26, 0.28, 0.34, INK));
  parts.push(bit(2.1, 0.15, -1.6, 0.38, 0.62, 0.82, INK));
  return parts;
}

function kids(stride: number, strides: number): Part[] {
  const phase = (stride / strides) * Math.PI * 2;
  const [eldest, middle, youngest] = CHILDREN;
  const bob = (k: Child) => Math.abs(Math.cos(phase + k.lag)) * 0.3 * (k.tall / 15);
  const { hand, lamp } = kidsLantern3(bob(eldest));
  const torch = kidsTorch3(bob(middle));
  const sleeve = shoulderOf(eldest, 1, bob(eldest));
  const elbow = shoulderOf(middle, 1, bob(middle));
  const parts = [
    ...child(eldest, phase, [null, hand]),
    ...child(middle, phase + middle.lag, [[sleeve[0] - 0.4, sleeve[1] + 0.6, sleeve[2] - 1.2], torch.hand]),
    ...child(youngest, phase + youngest.lag, [[elbow[0] - 0.2, elbow[1] + 0.6, elbow[2] - 1.8], null]),
  ];
  parts.push(bone(hand, [lamp[0], lamp[1], lamp[2] + 1.1], 0.14, INK));
  parts.push(part([lamp[0], lamp[1], lamp[2] + 1.05], [0.65, 0.65, 0.3], INK));
  parts.push(part([lamp[0], lamp[1], lamp[2] - 0.95], [0.6, 0.6, 0.22], INK));
  parts.push({ ...part(lamp, [0.75, 0.75, 0.95], LAMP), glow: true });
  parts.push(bone(torch.hand, torch.tip, 0.4, TORCH));
  parts.push({ ...part(torch.tip, [0.46, 0.46, 0.46], LAMP), glow: true });
  return parts;
}

export const paintKids = (px: number, stride: number, strides: number) => render(kids(stride, strides), px, 19, 15, 33);

// The torch's lens from the children's feet, in pixels, for its beam.
export function kidsTorch(px: number) {
  const [x, y, z] = kidsTorch3(0.3 * (CHILDREN[1].tall / 15)).tip;
  return { x: (x - y) * px, y: ((x + y) / 2 - z) * px };
}

// The lantern's place from the children's feet, in pixels, for its glow.
export function kidsLantern(px: number) {
  const [x, y, z] = kidsLantern3(0.3 * (CHILDREN[0].tall / 15)).lamp;
  return { x: (x - y) * px, y: ((x + y) / 2 - z) * px };
}

// A thundercloud as a clay model: a dome of puffs heaped on a flat, dark, scalloped base, the tops catching the light. Drawn from
// the middle of its base.
const STORM: RGB = [108, 116, 146];
const STORM_TOP: RGB = [178, 184, 208];
const STORM_BASE: RGB = [60, 64, 90];
export function paintCloud(px: number, variant = 0): Figure {
  const h = (i: number) => {
    const x = Math.sin((i + variant * 17) * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const parts: Part[] = [part([0, 0, 1.3], [7, 7, 1.4], STORM_BASE)];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + h(i) * 0.3;
    parts.push(part([Math.cos(a) * 5.8, Math.sin(a) * 5.8, 1.4], [2.6, 2.6, 1.5], STORM_BASE));
  }
  for (let i = 0; i < 20; i++) {
    const a = h(i + 20) * Math.PI * 2;
    const d = 1.2 + h(i + 50) * 4.6;
    const r = 1.8 + h(i + 90) * 1.5;
    const z = 2.8 + (1 - d / 5.8) * 2.8 + h(i + 130) * 1.1;
    const t = Math.min(1, Math.max(0, (z - 2.6) / 4.5));
    parts.push(part([Math.cos(a) * d, Math.sin(a) * d, z], [r, r, r * 0.82], [STORM[0] + (STORM_TOP[0] - STORM[0]) * t, STORM[1] + (STORM_TOP[1] - STORM[1]) * t, STORM[2] + (STORM_TOP[2] - STORM[2]) * t]));
  }
  for (const [x, y, z, r] of [
    [0, 0, 6.6, 2.5],
    [-1.8, 1.4, 7.2, 1.8],
    [1.9, -1.2, 7, 1.7],
    [0.6, 2.6, 6.2, 1.6],
  ]) parts.push(part([x, y, z], [r, r, r * 0.85], STORM_TOP));
  return render(parts, px, 16, 13, 26);
}
