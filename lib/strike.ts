import type { Candle, Market } from "./types";

export type Network = "mainnet" | "testnet";

export const NETWORK: Network = process.env.NEXT_PUBLIC_STRIKE_NETWORK === "testnet" ? "testnet" : "mainnet";
const HOST = NETWORK === "testnet" ? "api-v2-testnet.strikefinance.org" : "api.strikefinance.org";
export const REST = `https://${HOST}`;
const WS = `wss://${HOST}/ws/price`;
export const STRIKE_APP = process.env.NEXT_PUBLIC_STRIKE_APP_URL || "https://app.strikefinance.org";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${REST}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Strike said ${res.status}`);
  return (await res.json()) as T;
}

type RawSymbol = { symbol: string; baseAsset: string; status: string; filters: { filterType: string; tickSize?: string; stepSize?: string; notional?: string }[] };
type RawTier = { max_notional: string; max_leverage: number; maintenance_margin_rate: string; maintenance_amount: string };

export async function markets(): Promise<Market[]> {
  const [info, rules] = await Promise.all([
    get<{ symbols: RawSymbol[] }>("/price/v2/exchangeInfo"),
    get<{ markets: Record<string, { margin_tiers?: RawTier[] }> }>("/v2/markets").catch(() => ({ markets: {} as Record<string, { margin_tiers?: RawTier[] }> })),
  ]);
  return info.symbols
    .filter((s) => s.status === "trading")
    .map((s) => {
      const filter = (type: string) => s.filters.find((f) => f.filterType === type);
      const tiers = (rules.markets[s.symbol]?.margin_tiers ?? []).map((t) => ({
        maxNotional: Number(t.max_notional),
        maxPower: t.max_leverage,
        mmr: Number(t.maintenance_margin_rate),
        amount: Number(t.maintenance_amount),
      }));
      return {
        symbol: s.symbol,
        base: s.baseAsset,
        tickSize: Number(filter("PRICE_FILTER")?.tickSize ?? 0.01),
        stepSize: Number(filter("MARKET_LOT_SIZE")?.stepSize ?? filter("LOT_SIZE")?.stepSize ?? 0.001),
        minNotional: Number(filter("MIN_NOTIONAL")?.notional ?? 0),
        tiers,
      };
    });
}

export async function klines(symbol: string, interval: "1m" | "15m", limit = 500): Promise<Candle[]> {
  const query = new URLSearchParams({ symbol, interval, limit: String(limit), priceType: "mark" });
  const rows = await get<[number, string, string, string, string][]>(`/price/v2/klines?${query}`);
  return rows.map(([t, o, h, l, c]) => ({ t, o: Number(o), h: Number(h), l: Number(l), c: Number(c) }));
}

export type Mark = { p: number; at: number };
export type Ticker = { open: number; last: number };

export type Feed = {
  marks: (marks: Record<string, Mark>) => void;
  tickers: (tickers: Record<string, Ticker>) => void;
  status: (live: boolean) => void;
};

export function stream(on: Feed): () => void {
  let ws: WebSocket | null = null;
  let retryMs = 1000;
  let ping: ReturnType<typeof setInterval> | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const connect = () => {
    ws = new WebSocket(WS);
    const socket = ws;
    socket.onopen = () => {
      retryMs = 1000;
      on.status(true);
      socket.send(JSON.stringify({ method: "subscribe", channel: "!markprice@arr", id: 1 }));
      socket.send(JSON.stringify({ method: "subscribe", channel: "!miniticker@arr", id: 2 }));
      ping = setInterval(() => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ method: "ping" })), 30_000);
    };
    socket.onmessage = (event) => {
      for (const line of String(event.data).split("\n")) if (line) read(line);
    };
    const read = (line: string) => {
      let msg: unknown;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (!Array.isArray(msg) || !msg.length) return;
      if (msg[0]?.e === "markPriceUpdate") {
        const marks: Record<string, Mark> = {};
        for (const m of msg as { s: string; p: string; E: number }[]) {
          const p = Number(m.p);
          if (Number.isFinite(p)) marks[m.s] = { p, at: m.E ?? Date.now() };
        }
        on.marks(marks);
      } else if (msg[0]?.e === "24hrMiniTicker") {
        const tickers: Record<string, Ticker> = {};
        for (const t of msg as { s: string; o: string; c: string }[]) tickers[t.s] = { open: Number(t.o), last: Number(t.c) };
        on.tickers(tickers);
      }
    };
    socket.onclose = () => {
      if (ping) clearInterval(ping);
      on.status(false);
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
    if (ping) clearInterval(ping);
    ws?.close();
  };
}
