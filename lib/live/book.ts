import { useEffect, useState } from "react";
import { REST } from "../strike.ts";
import { apply, fromSnapshot, record, type Book, type L3Snapshot, type L3Update, type Tape } from "./l3.ts";

const WS = `${REST.replace(/^http/, "ws")}/ws/l3`;
const EVERY = 200;

type Message = L3Update & { id?: unknown; result?: unknown; error?: unknown };

// Strike's order by order book for one market, kept live: a snapshot, then every update after it in sequence.
// The book is changed in place, and handed over at most five times a second. Anything off and it starts again from a snapshot.
export function watchBook(symbol: string, onChange: (book: Book, tape: Tape) => void, onLive?: (live: boolean) => void): () => void {
  const name = symbol.toUpperCase();
  const tape: Tape = { fills: [] };
  let ws: WebSocket | null = null;
  let book: Book | null = null;
  let held: L3Update[] = [];
  let retryMs = 1000;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let shownAt = 0;
  let stopped = false;

  const show = () => {
    if (timer) return;
    timer = setTimeout(
      () => {
        timer = null;
        shownAt = Date.now();
        if (book && !stopped) onChange(book, tape);
      },
      Math.max(0, shownAt + EVERY - Date.now()),
    );
  };

  const restart = (socket: WebSocket) => {
    book = null;
    socket.close();
  };

  const load = async (socket: WebSocket) => {
    const res = await fetch(`/api/l3?symbol=${encodeURIComponent(name)}`, { cache: "no-store" }).catch(() => null);
    const snap = res?.ok ? ((await res.json().catch(() => null)) as L3Snapshot | null) : null;
    if (ws !== socket) return;
    if (!snap?.bids || !snap.asks) return restart(socket);
    const fresh = fromSnapshot(snap);
    for (const u of held.sort((a, b) => a.sequence - b.sequence)) if (apply(fresh, u) === "rebuild") return restart(socket);
    held = [];
    book = fresh;
    retryMs = 1000;
    onLive?.(true);
    show();
  };

  const connect = () => {
    retry = null;
    book = null;
    held = [];
    const socket = new WebSocket(WS);
    ws = socket;
    socket.onopen = () => socket.send(JSON.stringify({ method: "SUBSCRIBE", params: [`${name.toLowerCase()}@l3`], id: 1 }));
    socket.onmessage = (event) => {
      let msg: Message;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return restart(socket);
      }
      if (msg.error) return restart(socket);
      if (msg.id === 1 && "result" in msg) return void load(socket);
      if (msg.type !== "l3_update" || msg.symbol !== name) return;
      record(tape, msg, Date.now());
      if (!book) held.push(msg);
      else if (apply(book, msg) === "rebuild") restart(socket);
      else show();
    };
    socket.onclose = () => {
      if (ws !== socket) return;
      ws = null;
      book = null;
      onLive?.(false);
      if (stopped) return;
      retry = setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, 30_000);
    };
    socket.onerror = () => socket.close();
  };

  connect();
  return () => {
    stopped = true;
    if (retry) clearTimeout(retry);
    if (timer) clearTimeout(timer);
    const socket = ws;
    ws = null;
    socket?.close();
  };
}

type Seen = { symbol: string | null; book: Book | null; tape: Tape | null; version: number; live: boolean };

const NONE = { book: null, tape: null, version: 0, live: false };

// The live book for a market. The same book comes back changed, so version is what moves on each change.
export function useBook(symbol: string | null): { book: Book | null; tape: Tape | null; version: number; live: boolean } {
  const [seen, setSeen] = useState<Seen>({ symbol: null, ...NONE });
  useEffect(() => {
    if (!symbol) return;
    return watchBook(
      symbol,
      (book, tape) => setSeen((s) => ({ symbol, book, tape, version: s.version + 1, live: true })),
      (live) => setSeen((s) => (s.symbol === symbol ? { ...s, live } : s)),
    );
  }, [symbol]);
  return seen.symbol === symbol ? seen : NONE;
}
