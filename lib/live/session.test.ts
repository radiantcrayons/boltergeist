import assert from "node:assert/strict";
import { test } from "node:test";
import { keepKeysIn, memoryVault, newKeys, sign } from "./keys.ts";
import { loadSession, saveSession, type Session } from "./session.ts";

const shelf = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => shelf.get(k) ?? null,
  setItem: (k: string, v: string) => void shelf.set(k, v),
  removeItem: (k: string) => void shelf.delete(k),
  clear: () => shelf.clear(),
  key: (i: number) => [...shelf.keys()][i] ?? null,
  get length() {
    return shelf.size;
  },
} as Storage;

const KEY = "tradewars.session.mainnet";
const message = new TextEncoder().encode("hello");

async function session(via: Session["via"] = "wallet"): Promise<Session> {
  return { network: "mainnet", keys: await newKeys(), accountId: "acct", via, expiresAt: Date.now() + 60_000 };
}

test("a saved session comes back with only the key's public half and its place, and still signs", async () => {
  keepKeysIn(memoryVault(), true);
  shelf.clear();
  const s = await session();
  saveSession(s);
  const saved = shelf.get(KEY)!;
  assert.deepEqual(Object.keys(JSON.parse(saved).keys).sort(), ["id", "public"]);
  const back = loadSession();
  assert.deepEqual(back, JSON.parse(saved));
  assert.ok(back && (await sign(back.keys, message)).length === 64);
});

test("a session saved the old way, with its key as text, is wiped and the player connects again", () => {
  shelf.clear();
  shelf.set(KEY, JSON.stringify({ network: "mainnet", keys: { secret: "ab".repeat(32), public: "cd".repeat(32) }, accountId: "acct", via: "wallet" }));
  assert.equal(loadSession(), null);
  assert.equal(shelf.has(KEY), false);
});

test("an expired session, or a pasted key with no expiry, is dropped along with its key", async () => {
  keepKeysIn(memoryVault(), true);
  shelf.clear();
  const s = await session("key");
  shelf.set(KEY, JSON.stringify({ ...s, expiresAt: Date.now() - 1 }));
  assert.equal(loadSession(), null);
  assert.equal(shelf.has(KEY), false);
  await new Promise((r) => setTimeout(r, 0));
  await assert.rejects(sign(s.keys, message), /connect again/);
  const t = await session("key");
  shelf.set(KEY, JSON.stringify({ ...t, expiresAt: undefined }));
  assert.equal(loadSession(), null);
});

test("logging out, or connecting another key, throws the last key away", async () => {
  keepKeysIn(memoryVault(), true);
  shelf.clear();
  const first = await session();
  saveSession(first);
  const second = await session();
  saveSession(second);
  await new Promise((r) => setTimeout(r, 0));
  await assert.rejects(sign(first.keys, message), /connect again/);
  assert.ok(await sign(second.keys, message));
  saveSession(null);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(shelf.has(KEY), false);
  await assert.rejects(sign(second.keys, message), /connect again/);
});
