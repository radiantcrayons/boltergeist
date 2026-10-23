"use client";

import { useCallback, useEffect, useRef } from "react";
import * as fmt from "@/lib/format";
import type { Candle } from "@/lib/types";

export const COLORS = { up: "#2bf5b5", down: "#ff4d6d", volt: "#ffe14a", text: "#d6dee6", dim: "#7c8894", bull: "#f8931a" };
const BG = "#090c10";
const GRID = "#151b23";
const AXIS_W = 76;
const TIME_H = 22;
const GLIDE_MS = 110;

export type Level = { p: number; color: string; label: string; dashed?: boolean; keep?: boolean };
export type Mark = { t: number; p: number; glyph: string; color: string };
// Others' traps, by the price axis.
export type Pin = { p: number; glyph: string; color: string };
// What a click at a price would do, if anything, the price it would use, and what it would put on the field there.
export type Pick = { p: number; label: string; color: string; art?: "cloud" | { side: "long" | "short"; count: number } };

type Props = {
  candles: Candle[];
  intervalMs: number;
  mark: number | null;
  tickSize: number;
  span: { from: number; to: number };
  levels: Level[];
  marks: Mark[];
  pins?: Pin[];
  pick?: (p: number) => Pick | null;
  onPick?: (p: number) => void;
};

type Range = { min: number; max: number };

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function fonts() {
  const css = getComputedStyle(document.documentElement);
  return {
    mono: `11px ${css.getPropertyValue("--mono") || "ui-monospace, monospace"}`,
    display: `13px ${css.getPropertyValue("--display") || "sans-serif"}`,
  };
}

export function Chart(props: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useRef({ w: 0, h: 0 });
  const latest = useRef(props);
  const frame = useRef(0);
  const shown = useRef<{ candle: Candle | null; mark: number | null; fit: Range | null; at: number }>({ candle: null, mark: null, fit: null, at: 0 });
  const hover = useRef<number | null>(null);

  useEffect(() => {
    latest.current = props;
  });

  const plotW = () => size.current.w - AXIS_W;
  const plotH = () => size.current.h - TIME_H;

  const times = useCallback(() => {
    const { span, intervalMs } = latest.current;
    const ms = span.to - span.from;
    return { left: span.from - Math.max(ms * 0.5, intervalMs * 24), right: span.to + ms * 0.06 };
  }, []);

  const xOf = useCallback(
    (t: number) => {
      const { left, right } = times();
      return ((t - left) / (right - left)) * (size.current.w - AXIS_W);
    },
    [times],
  );

  const fit = useCallback((): Range => {
    const { candles, mark, levels } = latest.current;
    const { left } = times();
    let min = Infinity;
    let max = -Infinity;
    for (const c of candles) {
      if (c.t < left) continue;
      min = Math.min(min, c.l);
      max = Math.max(max, c.h);
    }
    for (const p of [mark, ...levels.filter((l) => l.keep).map((l) => l.p)]) {
      if (p === null) continue;
      min = Math.min(min, p);
      max = Math.max(max, p);
    }
    if (!Number.isFinite(min)) return { min: 0, max: 1 };
    const span = Math.max(max - min, max * 0.0008);
    return { min: min - span * 0.12, max: max + span * 0.12 };
  }, [times]);

  const glide = useCallback((): boolean => {
    const s = shown.current;
    const { candles, intervalMs, mark } = latest.current;
    const at = performance.now();
    const dt = s.at ? Math.min(at - s.at, 50) : 16;
    const k = reduced() ? 1 : 1 - Math.exp(-dt / GLIDE_MS);
    const to = fit();
    const step = (a: number, b: number) => ((Math.abs(a - b) / (to.max - to.min)) * (size.current.h - TIME_H) < 0.2 ? b : a + (b - a) * k);
    const from = s.fit;
    s.fit = !from || from.max < to.min || from.min > to.max ? to : { min: step(from.min, to.min), max: step(from.max, to.max) };
    const last = candles.at(-1) ?? null;
    const was = !last || !s.candle || last.t < s.candle.t || last.t > s.candle.t + 3 * intervalMs ? last : last.t > s.candle.t ? { ...last, h: last.o, l: last.o, c: last.o } : s.candle;
    s.candle = last && was && { ...last, h: step(was.h, last.h), l: step(was.l, last.l), c: step(was.c, last.c) };
    s.mark = mark === null || s.mark === null ? mark : step(s.mark, mark);
    const moving = s.fit.min !== to.min || s.fit.max !== to.max || s.mark !== mark || (!!last && (s.candle!.h !== last.h || s.candle!.l !== last.l || s.candle!.c !== last.c));
    s.at = moving ? at : 0;
    return moving;
  }, [fit]);

  const draw = useCallback((): boolean => {
    const c = canvas.current;
    if (!c || !size.current.w) return false;
    const ctx = c.getContext("2d")!;
    const { w, h } = size.current;
    const moving = glide();
    const { candles, intervalMs, tickSize, span, levels, marks, pins = [], pick } = latest.current;
    const { candle: newest, mark, fit: r } = shown.current;
    const pw = plotW();
    const ph = plotH();
    const yOf = (p: number) => ((r!.max - p) / (r!.max - r!.min)) * ph;
    const now = Date.now();
    const font = fonts();
    ctx.save();
    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    const x0 = xOf(span.from);
    const x1 = xOf(span.to);
    const xNow = Math.min(Math.max(xOf(now), x0), x1);
    ctx.fillStyle = "rgba(43, 245, 181, 0.03)";
    ctx.fillRect(x0, 0, x1 - x0, ph);
    ctx.save();
    ctx.beginPath();
    ctx.rect(xNow, 0, x1 - xNow, ph);
    ctx.clip();
    ctx.strokeStyle = "rgba(43, 245, 181, 0.05)";
    ctx.lineWidth = 1;
    for (let x = xNow - ph; x < x1; x += 14) {
      ctx.beginPath();
      ctx.moveTo(x, ph);
      ctx.lineTo(x + ph, 0);
      ctx.stroke();
    }
    ctx.restore();

    ctx.font = font.mono;
    ctx.strokeStyle = GRID;
    ctx.fillStyle = COLORS.dim;
    const pStep = niceStep((r!.max - r!.min) / 6);
    for (let p = Math.ceil(r!.min / pStep) * pStep; p < r!.max; p += pStep) {
      const y = Math.round(yOf(p)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(pw, y);
      ctx.stroke();
      ctx.fillText(fmt.price(p, Math.max(tickSize, pStep / 100)), pw + 8, y + 4);
    }
    const { left, right } = times();
    const tStep = timeStep(((right - left) / pw) * 110);
    for (let t = Math.ceil(left / tStep) * tStep; t < right; t += tStep) {
      const x = Math.round(xOf(t)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ph);
      ctx.stroke();
      const label = timeLabel(t, tStep);
      ctx.fillText(label, x - ctx.measureText(label).width / 2, ph + 15);
    }

    ctx.font = font.display;
    for (const [x, label] of [
      [x0, "haunting begins"],
      [x1, "final bell"],
    ] as const) {
      ctx.strokeStyle = "rgba(255, 225, 74, 0.55)";
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, ph);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.volt;
      const text = label.toUpperCase();
      ctx.fillText(text, label === "final bell" ? x - ctx.measureText(text).width - 6 : x + 6, 18);
    }

    const bodyW = Math.max(1, (intervalMs / (right - left)) * pw * 0.66);
    for (const [i, candle] of candles.entries()) {
      const k = i === candles.length - 1 && newest ? newest : candle;
      const x = xOf(k.t + intervalMs / 2);
      if (x < -bodyW || x > pw + bodyW) continue;
      const color = k.c >= k.o ? COLORS.up : COLORS.down;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, yOf(k.h));
      ctx.lineTo(Math.round(x) + 0.5, yOf(k.l));
      ctx.stroke();
      const top = yOf(Math.max(k.o, k.c));
      ctx.fillRect(x - bodyW / 2, top, bodyW, Math.max(1, yOf(Math.min(k.o, k.c)) - top));
    }

    if (xOf(now) < pw) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(Math.round(xOf(now)) + 0.5, 0);
      ctx.lineTo(Math.round(xOf(now)) + 0.5, ph);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.font = `bold ${font.display}`;
    ctx.textAlign = "center";
    for (const m of marks) {
      const x = xOf(m.t);
      const y = yOf(m.p);
      if (x < 0 || x > pw || y < 0 || y > ph) continue;
      ctx.fillStyle = m.color;
      ctx.fillText(m.glyph, x, y + 5);
    }
    ctx.textAlign = "left";

    const stacked = new Map<number, number>();
    ctx.font = `bold ${font.mono}`;
    for (const pin of pins) {
      const y = yOf(pin.p);
      if (y < 0 || y > ph) continue;
      const row = Math.round(y / 8);
      const n = stacked.get(row) ?? 0;
      stacked.set(row, n + 1);
      ctx.fillStyle = pin.color;
      ctx.fillText(pin.glyph, pw - 14 - n * 10, y + 4);
    }

    const tags: { y: number; color: string; text: string }[] = [];
    const labelled: number[] = [];
    ctx.font = font.display;
    for (const l of levels) {
      const y = yOf(l.p);
      const off = y < 0 ? "up" : y > ph ? "down" : null;
      const at = Math.min(Math.max(y, 10), ph - 10);
      ctx.strokeStyle = l.color;
      ctx.fillStyle = l.color;
      ctx.lineWidth = 1.5;
      if (!off) {
        ctx.setLineDash(l.dashed ? [8, 6] : []);
        ctx.beginPath();
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(pw, Math.round(y) + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const label = `${off === "up" ? "▲ " : off === "down" ? "▼ " : ""}${l.label.toUpperCase()}`;
      // Two lines close together: the second label goes under its line, not on top of the first.
      const above = off === "up" ? 38 : off === "down" ? ph - 8 : y - 7;
      const ly = !off && labelled.some((u) => Math.abs(u - above) < 14) ? y + 17 : above;
      labelled.push(ly);
      ctx.fillText(label, pw - 10 - ctx.measureText(label).width, ly);
      tags.push({ y: at, color: l.color, text: fmt.price(l.p, tickSize) });
    }
    ctx.lineWidth = 1;

    if (mark !== null) {
      const y = yOf(mark);
      ctx.strokeStyle = COLORS.volt;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(pw, Math.round(y) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      tags.push({ y, color: COLORS.volt, text: fmt.price(mark, tickSize) });
    }
    const hovered = hover.current;
    const picked = hovered !== null && pick ? pick(hovered) : null;
    if (picked) {
      const p = picked.p;
      const y = yOf(p);
      ctx.strokeStyle = picked.color;
      ctx.globalAlpha = 0.7;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(pw, Math.round(y) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.font = font.display;
      ctx.fillStyle = picked.color;
      ctx.fillText(picked.label.toUpperCase(), 12, y < 24 ? y + 18 : y - 8);
      tags.push({ y, color: picked.color, text: fmt.price(p, tickSize) });
    }
    if (wrap.current) wrap.current.style.cursor = picked ? "crosshair" : "";

    ctx.font = font.mono;
    for (const tag of tags) {
      ctx.fillStyle = tag.color;
      ctx.beginPath();
      ctx.roundRect(pw + 2, tag.y - 9, AXIS_W - 4, 18, 4);
      ctx.fill();
      ctx.fillStyle = BG;
      ctx.fillText(tag.text, pw + 7, tag.y + 4);
    }

    if (!candles.length) {
      ctx.font = font.display;
      ctx.fillStyle = COLORS.dim;
      ctx.fillText("WAITING FOR THE PRICE...", 16, ph / 2);
    }
    ctx.restore();
    return moving;
  }, [glide, times, xOf]);

  const redraw = useCallback(() => {
    cancelAnimationFrame(frame.current);
    const next = () => {
      if (draw()) frame.current = requestAnimationFrame(next);
    };
    frame.current = requestAnimationFrame(next);
  }, [draw]);

  useEffect(() => {
    const el = wrap.current!;
    const resize = () => {
      const c = canvas.current;
      if (!c) return;
      const { width, height } = el.getBoundingClientRect();
      size.current = { w: width, h: height };
      c.width = Math.round(width * devicePixelRatio);
      c.height = Math.round(height * devicePixelRatio);
      redraw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    return () => observer.disconnect();
  }, [redraw]);

  useEffect(() => redraw());
  useEffect(() => {
    const timer = setInterval(redraw, 1000);
    return () => {
      clearInterval(timer);
      cancelAnimationFrame(frame.current);
    };
  }, [redraw]);

  const priceAt = (clientY: number): number | null => {
    const r = shown.current.fit;
    const box = wrap.current?.getBoundingClientRect();
    if (!r || !box) return null;
    const y = clientY - box.top;
    return y < 0 || y > plotH() ? null : r.max - (y / plotH()) * (r.max - r.min);
  };

  return (
    <div
      className="chart"
      ref={wrap}
      onPointerMove={(e) => {
        hover.current = priceAt(e.clientY);
        redraw();
      }}
      onPointerLeave={() => {
        hover.current = null;
        redraw();
      }}
      onClick={(e) => {
        const p = priceAt(e.clientY);
        const { pick, onPick } = latest.current;
        const picked = p !== null && pick?.(p);
        if (picked && onPick) onPick(picked.p);
      }}
    >
      <canvas ref={canvas} />
    </div>
  );
}


export function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  const f = raw / power;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * power;
}

const TIME_STEPS = [5_000, 15_000, 30_000, 60_000, 300_000, 900_000, 1_800_000, 3_600_000, 7_200_000, 14_400_000, 21_600_000, 43_200_000, 86_400_000];
const timeStep = (raw: number) => TIME_STEPS.find((s) => s >= raw) ?? TIME_STEPS.at(-1)!;

function timeLabel(t: number, step: number): string {
  return new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", ...(step < 60_000 && { second: "2-digit" }) });
}
