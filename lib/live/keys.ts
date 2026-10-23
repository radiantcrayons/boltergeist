import * as ed from "@noble/ed25519";
import { REST } from "../strike.ts";
import { uid } from "../uid.ts";

// A trading key: its public half, and where this browser keeps the private half, which never leaves it as text.
export type Keys = { public: string; id: string };

type Kept = { key: CryptoKey } | { seed: Uint8Array };

export interface Vault {
  get(id: string): Promise<Kept | undefined>;
  put(id: string, kept: Kept): Promise<void>;
  drop(id: string): Promise<void>;
}

export const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export function unhex(text: string): Uint8Array {
  const clean = text.replace(/^0x/i, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function memoryVault(): Vault {
  const kept = new Map<string, Kept>();
  return {
    get: async (id) => kept.get(id),
    put: async (id, k) => void kept.set(id, k),
    drop: async (id) => void kept.delete(id),
  };
}

// IndexedDB keeps a CryptoKey as it is, so a key made unextractable stays that way across visits.
function indexedVault(): Vault {
  let db: Promise<IDBDatabase> | null = null;
  const open = () =>
    (db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("boltergeist", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("keys");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((err) => {
      db = null;
      throw err;
    }));
  const run = <T>(mode: IDBTransactionMode, ask: (s: IDBObjectStore) => IDBRequest<T>) =>
    open().then(
      (d) =>
        new Promise<T>((resolve, reject) => {
          const tx = d.transaction("keys", mode);
          const req = ask(tx.objectStore("keys"));
          tx.oncomplete = () => resolve(req.result);
          tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("This browser wouldn't keep the trading key"));
        }),
    );
  return {
    get: (id) => run<Kept | undefined>("readonly", (s) => s.get(id)),
    put: (id, k) => run("readwrite", (s) => s.put(k, id)).then(() => {}),
    drop: (id) => run("readwrite", (s) => s.delete(id)).then(() => {}),
  };
}

type Signer = (bytes: Uint8Array<ArrayBuffer>) => Promise<Uint8Array>;

let vault: Vault | null = null;
let native: Promise<boolean> | null = null;
const signers = new Map<string, Promise<Signer>>();
const store = () => (vault ??= typeof indexedDB === "undefined" ? memoryVault() : indexedVault());
const ED = { name: "Ed25519" } as const;
// Ed25519 in the browser's own crypto, where the private key can be made impossible to read back. Older browsers sign with noble instead.
const webEd = () => (native ??= crypto.subtle.generateKey(ED, false, ["sign", "verify"]).then(() => true, () => false));

// Whether this browser can hold a trading key it can never give back as text.
export const lockedKeys = () => webEd();

export function keepKeysIn(v: Vault, webCrypto?: boolean) {
  vault = v;
  native = webCrypto === undefined ? null : Promise.resolve(webCrypto);
  signers.clear();
}

export async function newKeys(): Promise<Keys> {
  const id = uid();
  if (await webEd()) {
    const pair = (await crypto.subtle.generateKey(ED, false, ["sign", "verify"])) as CryptoKeyPair;
    const pub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    await store().put(id, { key: pair.privateKey });
    return { public: hex(pub), id };
  }
  const { secretKey, publicKey } = await ed.keygenAsync();
  await store().put(id, { seed: secretKey });
  return { public: hex(publicKey), id };
}

// The fixed PKCS#8 wrapping of a raw Ed25519 private key.
const PKCS8 = unhex("302e020100300506032b657004220420");

// A pasted API key, taken in once: its public half is worked out, the private half is locked away, and the text is wiped.
export async function keysFrom(secretHex: string): Promise<Keys> {
  const clean = secretHex.trim().replace(/^0x/i, "").toLowerCase();
  if (!/^([0-9a-f]{64}|[0-9a-f]{128})$/.test(clean)) throw new Error("An API key is 64 or 128 hex characters");
  const seed = unhex(clean.slice(0, 64));
  const wrapped = new Uint8Array(PKCS8.length + seed.length);
  wrapped.set(PKCS8);
  wrapped.set(seed, PKCS8.length);
  const id = uid();
  try {
    const pub = hex(await ed.getPublicKeyAsync(seed));
    if (await webEd()) await store().put(id, { key: await crypto.subtle.importKey("pkcs8", wrapped, ED, false, ["sign"]) });
    else await store().put(id, { seed: seed.slice() });
    return { public: pub, id };
  } finally {
    seed.fill(0);
    wrapped.fill(0);
  }
}

export async function forget(keys?: Partial<Keys> | null) {
  if (!keys?.id) return;
  signers.delete(keys.id);
  await store()
    .drop(keys.id)
    .catch(() => {});
}

function signer(keys: Keys): Promise<Signer> {
  let s = signers.get(keys.id);
  if (!s) {
    s = store()
      .get(keys.id)
      .then((kept): Signer => {
        if (!kept) throw new StrikeError(401, "This browser no longer has your trading key: connect again");
        if ("key" in kept) return async (bytes) => new Uint8Array(await crypto.subtle.sign(ED, kept.key, bytes));
        return (bytes) => ed.signAsync(bytes, kept.seed);
      });
    s.catch(() => signers.delete(keys.id));
    signers.set(keys.id, s);
  }
  return s;
}

export async function sign(keys: Keys, bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return (await signer(keys))(bytes);
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

// The headers that prove a request comes from the key's owner, for Strike or for anyone who passes them on to Strike.
export async function signedHeaders(keys: Keys, method: "GET" | "POST" | "DELETE", path: string, text = ""): Promise<Record<string, string>> {
  const timestamp = String(Math.floor((Date.now() + (await serverOffset())) / 1000) - 1);
  const nonce = uid();
  const message = `${method}:${path}:${timestamp}:${nonce}:${await sha256(text)}`;
  return {
    "X-API-Wallet-Public-Key": keys.public,
    "X-API-Wallet-Signature": hex(await sign(keys, new TextEncoder().encode(message))),
    "X-API-Wallet-Timestamp": timestamp,
    "X-API-Wallet-Nonce": nonce,
  };
}

export async function signed<T>(keys: Keys, method: "GET" | "POST" | "DELETE", path: string, body?: object, extra?: Record<string, string>): Promise<T> {
  const text = body ? JSON.stringify(body) : "";
  const res = await fetch(`${REST}${path}`, {
    method,
    headers: {
      ...(text && { "Content-Type": "application/json" }),
      ...(await signedHeaders(keys, method, path, text)),
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
