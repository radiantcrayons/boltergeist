import * as ed from "@noble/ed25519";
import { REST } from "../strike";

export type Keys = { secret: string; public: string };

export const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export function unhex(text: string): Uint8Array {
  const clean = text.replace(/^0x/i, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function newKeys(): Promise<Keys> {
  const { secretKey, publicKey } = await ed.keygenAsync();
  return { secret: hex(secretKey), public: hex(publicKey) };
}

export async function keysFrom(secretHex: string): Promise<Keys> {
  const clean = secretHex.trim().replace(/^0x/i, "").toLowerCase();
  if (!/^([0-9a-f]{64}|[0-9a-f]{128})$/.test(clean)) throw new Error("An API key is 64 or 128 hex characters");
  const secret = unhex(clean.slice(0, 64));
  return { secret: hex(secret), public: hex(await ed.getPublicKeyAsync(secret)) };
}

export class StrikeError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let offset: Promise<number> | null = null;

// Strike refuses timestamps from the future, so sign on its clock.
function serverOffset(): Promise<number> {
  offset ??= fetch(`${REST}/v2/time`)
    .then((r) => r.json() as Promise<{ serverTime: number }>)
    .then((t) => t.serverTime - Date.now())
    .catch(() => 0);
  return offset;
}

async function sha256(text: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
}

export async function signed<T>(keys: Keys, method: "GET" | "POST" | "DELETE", path: string, body?: object, extra?: Record<string, string>): Promise<T> {
  const text = body ? JSON.stringify(body) : "";
  const timestamp = String(Math.floor((Date.now() + (await serverOffset())) / 1000) - 1);
  const nonce = crypto.randomUUID();
  const message = `${method}:${path}:${timestamp}:${nonce}:${await sha256(text)}`;
  const signature = hex(await ed.signAsync(new TextEncoder().encode(message), unhex(keys.secret)));
  const res = await fetch(`${REST}${path}`, {
    method,
    headers: {
      ...(text && { "Content-Type": "application/json" }),
      "X-API-Wallet-Public-Key": keys.public,
      "X-API-Wallet-Signature": signature,
      "X-API-Wallet-Timestamp": timestamp,
      "X-API-Wallet-Nonce": nonce,
      ...extra,
    },
    body: text || undefined,
    cache: "no-store",
  });
  const reply = await res.text();
  if (!res.ok) {
    let error = reply.slice(0, 200);
    try {
      error = (JSON.parse(reply) as { error?: string }).error ?? error;
    } catch {}
    throw new StrikeError(res.status, error || `Strike said ${res.status}`);
  }
  return (reply ? JSON.parse(reply) : null) as T;
}

export async function post<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${REST}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const reply = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new StrikeError(res.status, reply.error ?? `Strike said ${res.status}`);
  return reply;
}
