import assert from "node:assert/strict";
import { test } from "node:test";
import * as ed from "@noble/ed25519";
import { forget, hex, keepKeysIn, keysFrom, memoryVault, newKeys, sign, signedHeaders, unhex, type Vault } from "./keys.ts";

// RFC 8032, test 1: a known key, and its signature of the empty message.
const SEED = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
const PUB = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
const EMPTY_SIG =
  "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b";
const message = new TextEncoder().encode("GET:/v2/account:1700000000:nonce:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");

function watched() {
  const inner = memoryVault();
  const kept = new Map<string, unknown>();
  const vault: Vault = {
    get: (id) => inner.get(id),
    put: (id, k) => (kept.set(id, k), inner.put(id, k)),
    drop: (id) => (kept.delete(id), inner.drop(id)),
  };
  return { vault, kept };
}

test("a pasted key is locked in the browser's crypto, can't be read back, and signs exactly as before", async () => {
  const { vault, kept } = watched();
  keepKeysIn(vault, true);
  const keys = await keysFrom(`0x${SEED.toUpperCase()}`);
  assert.equal(keys.public, PUB);
  assert.deepEqual(Object.keys(keys).sort(), ["id", "public"]);
  const stored = kept.get(keys.id) as { key: CryptoKey };
  assert.ok(stored.key instanceof CryptoKey);
  assert.equal(stored.key.extractable, false);
  await assert.rejects(crypto.subtle.exportKey("pkcs8", stored.key));
  assert.equal(hex(await sign(keys, new Uint8Array())), EMPTY_SIG);
  assert.equal(hex(await sign(keys, message)), hex(await ed.signAsync(message, unhex(SEED))));
});

test("without the browser's Ed25519 a pasted key signs through noble, still kept apart from the session", async () => {
  const { vault, kept } = watched();
  keepKeysIn(vault, false);
  const keys = await keysFrom(SEED + PUB);
  assert.equal(keys.public, PUB);
  assert.ok((kept.get(keys.id) as { seed: Uint8Array }).seed instanceof Uint8Array);
  assert.equal(hex(await sign(keys, new Uint8Array())), EMPTY_SIG);
});

test("a key that isn't 64 or 128 hex characters is refused", async () => {
  keepKeysIn(memoryVault(), true);
  await assert.rejects(keysFrom("abc"), /64 or 128 hex/);
});

test("a new key shows only its public half, and Strike can check what it signs", async () => {
  for (const web of [true, false]) {
    const { vault, kept } = watched();
    keepKeysIn(vault, web);
    const keys = await newKeys();
    assert.match(keys.public, /^[0-9a-f]{64}$/);
    const stored = kept.get(keys.id) as { key?: CryptoKey; seed?: Uint8Array };
    if (web) assert.equal(stored.key?.extractable, false);
    else assert.ok(stored.seed);
    assert.ok(await ed.verifyAsync(await sign(keys, message), message, unhex(keys.public)));
  }
});

test("a forgotten key is gone from the browser and can't sign", async () => {
  const { vault, kept } = watched();
  keepKeysIn(vault, true);
  const keys = await newKeys();
  await sign(keys, message);
  await forget(keys);
  assert.equal(kept.size, 0);
  await assert.rejects(sign(keys, message), /connect again/);
});

test("signed headers carry a signature Strike can check over method, path, time, nonce and body", async () => {
  keepKeysIn(memoryVault(), true);
  const keys = await keysFrom(SEED);
  const real = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ serverTime: Date.now() }))) as typeof fetch;
  try {
    const body = JSON.stringify({ symbol: "BTC-USD" });
    const h = await signedHeaders(keys, "POST", "/v2/order", body);
    assert.equal(h["X-API-Wallet-Public-Key"], PUB);
    const digest = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))));
    const signedText = `POST:/v2/order:${h["X-API-Wallet-Timestamp"]}:${h["X-API-Wallet-Nonce"]}:${digest}`;
    assert.ok(await ed.verifyAsync(unhex(h["X-API-Wallet-Signature"]), new TextEncoder().encode(signedText), unhex(PUB)));
  } finally {
    globalThis.fetch = real;
  }
});
