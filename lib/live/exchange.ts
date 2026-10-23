import { signed, StrikeError, type Keys } from "./keys.ts";
import type { Dealt, Exchange, Held, Order } from "./desk.ts";

type RawPosition = { symbol: string; size: string; entry_price: string; liquidation_price?: string; iso_balance?: string; upnl?: string };
type RawFill = { price: string; size: string; fee: string; role: string; timestamp: number };

export function strike(keys: Keys, feeBps: number): Exchange {
  const q = encodeURIComponent;
  return {
    marginMode: (symbol, mode) => signed(keys, "POST", "/v2/marginMode", { symbol, marginMode: mode }),
    leverage: (symbol, leverage) => signed(keys, "POST", "/v2/leverage", { symbol, leverage }),
    market: (symbol, side, size, clientId, reduceOnly) =>
      signed(
        keys,
        "POST",
        "/v2/order",
        { symbol, side, type: "market", size, client_order_id: clientId, slippage: "0.01", ...(reduceOnly && { reduce_only: true }) },
        feeBps > 0 ? { "X-Builder-Fee-Bps": String(feeBps) } : undefined,
      ),
    // Traps and flags are maker orders, so they carry no builder fee.
    limit: (symbol, side, size, price, clientId, opts) =>
      signed(keys, "POST", "/v2/order", {
        symbol,
        side,
        type: "limit",
        size,
        price,
        time_in_force: "GTC",
        client_order_id: clientId,
        ...(opts.postOnly && { post_only: true }),
        ...(opts.reduceOnly && { reduce_only: true }),
      }),
    cancel: (symbol, orderId) => signed(keys, "DELETE", "/v2/order/cancel", { symbol, order_id: orderId }),
    order: async (symbol, clientId) => {
      try {
        return await signed<Order>(keys, "GET", `/v2/order?symbol=${q(symbol)}&client_order_id=${q(clientId)}`);
      } catch (err) {
        if (err instanceof StrikeError && err.status === 404) return null;
        throw err;
      }
    },
    fills: async (symbol, orderId): Promise<Dealt[]> => {
      const res = await signed<{ fills?: RawFill[] }>(keys, "GET", `/v2/history/fill?symbol=${q(symbol)}&order_id=${orderId}`);
      return (res.fills ?? []).map((f) => ({ price: Number(f.price), size: Number(f.size), fee: Number(f.fee) || 0, maker: f.role === "maker", at: f.timestamp }));
    },
    position: async (symbol): Promise<Held | null> => {
      const res = await signed<{ positions?: RawPosition[] }>(keys, "GET", `/v2/positions?symbol=${q(symbol)}`);
      const p = (res.positions ?? []).find((x) => x.symbol === symbol && Number(x.size) !== 0);
      return p
        ? { side: Number(p.size) > 0 ? "long" : "short", size: Math.abs(Number(p.size)), entry: Number(p.entry_price), koAt: Number(p.liquidation_price) || 0, iso: Number(p.iso_balance) || 0, upnl: Number(p.upnl) || 0 }
        : null;
    },
  };
}
